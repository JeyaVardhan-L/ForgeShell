#include "proc.h"
#include <dirent.h>
#include <time.h>
#include <signal.h>

static volatile sig_atomic_t g_monitor_interrupted = 0;

static void monitor_sigint_handler(int sig) {
    (void)sig;
    g_monitor_interrupted = 1;
}

const char *proc_state_description(char state) {
    switch (state) {
        case 'R': return "Running (R)";
        case 'S': return "Sleeping in interruptible wait (S)";
        case 'D': return "Waiting in uninterruptible disk sleep (D)";
        case 'Z': return "Zombie (Z)";
        case 'T': return "Stopped by job control signal (T)";
        case 't': return "Tracing stop / debugger (t)";
        case 'X': return "Dead (X)";
        case 'I': return "Idle kernel thread (I)";
        default:  return "Unknown";
    }
}

static double get_system_uptime(void) {
    FILE *fp = fopen("/proc/uptime", "r");
    if (!fp) return 0.0;
    double uptime = 0.0;
    if (fscanf(fp, "%lf", &uptime) != 1) {
        uptime = 0.0;
    }
    fclose(fp);
    return uptime;
}

void proc_free_info(ProcInfo *info) {
    if (!info) return;
    if (info->cmdline) {
        free(info->cmdline);
        info->cmdline = NULL;
    }
}

bool proc_get_info(pid_t pid, ProcInfo *info) {
    if (!info) return false;
    memset(info, 0, sizeof(ProcInfo));
    info->pid = pid;

    char path[PATH_MAX];

    /* 1. Parse /proc/<pid>/stat */
    snprintf(path, sizeof(path), "/proc/%d/stat", (int)pid);
    FILE *fp_stat = fopen(path, "r");
    if (!fp_stat) {
        return false; /* Process does not exist or terminated */
    }

    char stat_buf[2048];
    if (!fgets(stat_buf, sizeof(stat_buf), fp_stat)) {
        fclose(fp_stat);
        return false;
    }
    fclose(fp_stat);

    /* Locate comm between first '(' and last ')' */
    char *open_paren = strchr(stat_buf, '(');
    char *close_paren = strrchr(stat_buf, ')');
    if (!open_paren || !close_paren || close_paren < open_paren) {
        return false;
    }

    size_t comm_len = close_paren - open_paren - 1;
    if (comm_len >= sizeof(info->comm)) comm_len = sizeof(info->comm) - 1;
    strncpy(info->comm, open_paren + 1, comm_len);
    info->comm[comm_len] = '\0';

    /* Parse fields after ')' */
    char state = ' ';
    int ppid = 0, pgrp = 0, session = 0;
    unsigned long utime = 0, stime = 0;
    long num_threads = 1;
    unsigned long long starttime = 0;

    if (sscanf(close_paren + 2,
               "%c %d %d %d %*d %*d %*u %*u %*u %*u %*u %lu %lu %*d %*d %*d %*d %ld %*d %llu",
               &state, &ppid, &pgrp, &session,
               &utime, &stime, &num_threads, &starttime) < 8) {
        return false;
    }

    info->state = state;
    info->ppid = (pid_t)ppid;
    info->pgrp = (pid_t)pgrp;
    info->session = (pid_t)session;
    info->utime_ticks = utime;
    info->stime_ticks = stime;
    info->num_threads = num_threads;
    info->starttime_ticks = starttime;
    info->state_desc = proc_state_description(state);

    long clk_tck = sysconf(_SC_CLK_TCK);
    if (clk_tck <= 0) clk_tck = 100;

    info->total_cpu_sec = (double)(utime + stime) / (double)clk_tck;
    double uptime = get_system_uptime();
    double start_sec = (double)starttime / (double)clk_tck;
    info->process_runtime_sec = (uptime > start_sec) ? (uptime - start_sec) : 0.0;

    /* 2. Parse /proc/<pid>/status */
    snprintf(path, sizeof(path), "/proc/%d/status", (int)pid);
    FILE *fp_status = fopen(path, "r");
    if (fp_status) {
        char line[256];
        while (fgets(line, sizeof(line), fp_status)) {
            if (strncmp(line, "VmSize:", 7) == 0) {
                sscanf(line + 7, " %lu", &info->vm_size_kb);
            } else if (strncmp(line, "VmRSS:", 6) == 0) {
                sscanf(line + 6, " %lu", &info->vm_rss_kb);
            } else if (strncmp(line, "VmData:", 7) == 0) {
                sscanf(line + 7, " %lu", &info->vm_data_kb);
            } else if (strncmp(line, "VmStk:", 6) == 0) {
                sscanf(line + 6, " %lu", &info->vm_stk_kb);
            } else if (strncmp(line, "VmExe:", 6) == 0) {
                sscanf(line + 6, " %lu", &info->vm_exe_kb);
            } else if (strncmp(line, "Threads:", 8) == 0) {
                long threads = 1;
                if (sscanf(line + 8, " %ld", &threads) == 1 && threads > 0) {
                    info->num_threads = threads;
                }
            }
        }
        fclose(fp_status);
    }

    /* 3. Parse /proc/<pid>/cmdline */
    snprintf(path, sizeof(path), "/proc/%d/cmdline", (int)pid);
    FILE *fp_cmd = fopen(path, "rb");
    if (fp_cmd) {
        char cmd_buf[4096];
        size_t n = fread(cmd_buf, 1, sizeof(cmd_buf) - 1, fp_cmd);
        fclose(fp_cmd);
        if (n > 0) {
            for (size_t i = 0; i < n - 1; i++) {
                if (cmd_buf[i] == '\0') {
                    cmd_buf[i] = ' ';
                }
            }
            cmd_buf[n] = '\0';
            info->cmdline = xstrdup(cmd_buf);
        } else {
            info->cmdline = xstrdup(info->comm);
        }
    } else {
        info->cmdline = xstrdup(info->comm);
    }

    /* 4. Resolve /proc/<pid>/exe link */
    snprintf(path, sizeof(path), "/proc/%d/exe", (int)pid);
    ssize_t exe_len = readlink(path, info->exe_path, sizeof(info->exe_path) - 1);
    if (exe_len > 0) {
        info->exe_path[exe_len] = '\0';
    } else {
        strncpy(info->exe_path, "[kernel thread or unreadable]", sizeof(info->exe_path) - 1);
        info->exe_path[sizeof(info->exe_path) - 1] = '\0';
    }

    /* 5. Resolve /proc/<pid>/cwd link */
    snprintf(path, sizeof(path), "/proc/%d/cwd", (int)pid);
    ssize_t cwd_len = readlink(path, info->cwd_path, sizeof(info->cwd_path) - 1);
    if (cwd_len > 0) {
        info->cwd_path[cwd_len] = '\0';
    } else {
        strncpy(info->cwd_path, "[unreadable]", sizeof(info->cwd_path) - 1);
        info->cwd_path[sizeof(info->cwd_path) - 1] = '\0';
    }

    /* 6. Count open file descriptors in /proc/<pid>/fd/ */
    snprintf(path, sizeof(path), "/proc/%d/fd", (int)pid);
    DIR *dir_fd = opendir(path);
    info->open_fd_count = 0;
    if (dir_fd) {
        struct dirent *entry;
        while ((entry = readdir(dir_fd)) != NULL) {
            if (strcmp(entry->d_name, ".") != 0 && strcmp(entry->d_name, "..") != 0) {
                info->open_fd_count++;
            }
        }
        closedir(dir_fd);
    }

    return true;
}

static void format_seconds(double total_sec, char *buf, size_t buf_size) {
    long sec = (long)total_sec;
    long hours = sec / 3600;
    long mins = (sec % 3600) / 60;
    long secs = sec % 60;
    if (hours > 0) {
        snprintf(buf, buf_size, "%ldh %02ldm %02lds", hours, mins, secs);
    } else if (mins > 0) {
        snprintf(buf, buf_size, "%ldm %02lds", mins, secs);
    } else {
        snprintf(buf, buf_size, "%.2fs", total_sec);
    }
}

int builtin_inspect(int argc, char **argv) {
    if (argc < 2) {
        forge_error("inspect: missing PID argument. Usage: inspect <pid>");
        return 1;
    }

    pid_t target_pid = (pid_t)atoi(argv[1]);
    if (target_pid <= 0) {
        forge_error("inspect: invalid PID '%s'", argv[1]);
        return 1;
    }

    ProcInfo info;
    if (!proc_get_info(target_pid, &info)) {
        forge_error("inspect: process %d not found or terminated", (int)target_pid);
        return 1;
    }

    char runtime_str[64];
    char cpu_str[64];
    format_seconds(info.process_runtime_sec, runtime_str, sizeof(runtime_str));
    format_seconds(info.total_cpu_sec, cpu_str, sizeof(cpu_str));

    printf("\n%sProcess Inspection Report for PID %d%s\n", COLOR_BOLD COLOR_CYAN, (int)target_pid, COLOR_RESET);
    printf("------------------------------------------------------------\n");
    printf("%s[General Identity]%s\n", COLOR_BOLD, COLOR_RESET);
    printf("  Command Name:       %-20s  (Source: /proc/%d/stat [comm])\n", info.comm, (int)target_pid);
    printf("  Process ID (PID):   %-20d  (Source: /proc/%d/stat [pid])\n", (int)info.pid, (int)target_pid);
    printf("  Parent PID (PPID):  %-20d  (Source: /proc/%d/stat [ppid])\n", (int)info.ppid, (int)target_pid);
    printf("  Process Group PGID: %-20d  (Source: /proc/%d/stat [pgrp])\n", (int)info.pgrp, (int)target_pid);
    printf("  Session ID:         %-20d  (Source: /proc/%d/stat [session])\n", (int)info.session, (int)target_pid);
    printf("  Process State:      %-20s  (Source: /proc/%d/status [State])\n", info.state_desc, (int)target_pid);
    printf("  Thread Count:       %-20ld  (Source: /proc/%d/status [Threads])\n", info.num_threads, (int)target_pid);
    printf("  Open File Descr.:   %-20d  (Source: /proc/%d/fd/ directory count)\n", info.open_fd_count, (int)target_pid);

    printf("\n%s[Memory Footprint]%s\n", COLOR_BOLD, COLOR_RESET);
    printf("  Virtual Size (VmSize): %8lu kB (%6.2f MB) (Source: /proc/%d/status [VmSize])\n",
           info.vm_size_kb, (double)info.vm_size_kb / 1024.0, (int)target_pid);
    printf("  Resident Set (VmRSS):  %8lu kB (%6.2f MB) (Source: /proc/%d/status [VmRSS])\n",
           info.vm_rss_kb, (double)info.vm_rss_kb / 1024.0, (int)target_pid);
    printf("  Data Segment (VmData): %8lu kB            (Source: /proc/%d/status [VmData])\n",
           info.vm_data_kb, (int)target_pid);
    printf("  Stack Segment (VmStk): %8lu kB            (Source: /proc/%d/status [VmStk])\n",
           info.vm_stk_kb, (int)target_pid);
    printf("  Text Segment (VmExe):  %8lu kB            (Source: /proc/%d/status [VmExe])\n",
           info.vm_exe_kb, (int)target_pid);

    printf("\n%s[CPU Usage & Timing]%s\n", COLOR_BOLD, COLOR_RESET);
    printf("  User CPU Time:         %12lu ticks  (Source: /proc/%d/stat [utime])\n",
           info.utime_ticks, (int)target_pid);
    printf("  System CPU Time:       %12lu ticks  (Source: /proc/%d/stat [stime])\n",
           info.stime_ticks, (int)target_pid);
    printf("  Total CPU Executed:    %12s        (Source: (utime+stime) / CLK_TCK)\n",
           cpu_str);
    printf("  Process Wall Runtime:  %12s        (Source: /proc/uptime - starttime)\n",
           runtime_str);

    printf("\n%s[Paths & Invocation]%s\n", COLOR_BOLD, COLOR_RESET);
    printf("  Executable Binary:  %s  (Source: readlink /proc/%d/exe)\n", info.exe_path, (int)target_pid);
    printf("  Working Directory:  %s  (Source: readlink /proc/%d/cwd)\n", info.cwd_path, (int)target_pid);
    printf("  Command Line:       %s  (Source: /proc/%d/cmdline)\n", info.cmdline, (int)target_pid);
    printf("------------------------------------------------------------\n\n");

    proc_free_info(&info);
    return 0;
}

int builtin_monitor(int argc, char **argv) {
    if (argc < 2) {
        forge_error("monitor: missing PID argument. Usage: monitor <pid> [interval_sec]");
        return 1;
    }

    pid_t target_pid = (pid_t)atoi(argv[1]);
    if (target_pid <= 0) {
        forge_error("monitor: invalid PID '%s'", argv[1]);
        return 1;
    }

    int interval_sec = 1;
    if (argc > 2) {
        interval_sec = atoi(argv[2]);
        if (interval_sec <= 0) interval_sec = 1;
    }

    ProcInfo prev_info;
    if (!proc_get_info(target_pid, &prev_info)) {
        forge_error("monitor: process %d not found or terminated", (int)target_pid);
        return 1;
    }

    long clk_tck = sysconf(_SC_CLK_TCK);
    if (clk_tck <= 0) clk_tck = 100;

    printf("\n%sMonitoring PID %d (%s) - sampling every %d second(s)%s\n",
           COLOR_BOLD COLOR_GREEN, (int)target_pid, prev_info.comm, interval_sec, COLOR_RESET);
    printf("Press Ctrl+C to stop monitoring and return to prompt.\n\n");
    printf("%-8s %-5s %-4s %-7s %-12s %-12s %-7s %-10s\n",
           "TIME", "PID", "STAT", "CPU %", "VmRSS (MB)", "VmSize (MB)", "THREADS", "RUNTIME");
    printf("-----------------------------------------------------------------------\n");

    /* Install temporary SIGINT handler so user can interrupt the monitor loop */
    g_monitor_interrupted = 0;
    struct sigaction sa_old, sa_new;
    memset(&sa_new, 0, sizeof(sa_new));
    sa_new.sa_handler = monitor_sigint_handler;
    sigaction(SIGINT, &sa_new, &sa_old);

    struct timespec prev_time;
    clock_gettime(CLOCK_MONOTONIC, &prev_time);

    while (!g_monitor_interrupted) {
        /* Sleep for interval using nanosleep (which is interrupted cleanly by SIGINT) */
        struct timespec req = {.tv_sec = interval_sec, .tv_nsec = 0};
        while (nanosleep(&req, &req) == -1 && errno == EINTR) {
            if (g_monitor_interrupted) break;
        }

        if (g_monitor_interrupted) break;

        struct timespec curr_time;
        clock_gettime(CLOCK_MONOTONIC, &curr_time);

        ProcInfo curr_info;
        if (!proc_get_info(target_pid, &curr_info)) {
            printf("\n%sforge: monitor: process %d has terminated.%s\n",
                   COLOR_YELLOW, (int)target_pid, COLOR_RESET);
            proc_free_info(&prev_info);
            sigaction(SIGINT, &sa_old, NULL);
            return 0;
        }

        double elapsed_sec = (curr_time.tv_sec - prev_time.tv_sec) +
                             (curr_time.tv_nsec - prev_time.tv_nsec) / 1e9;
        if (elapsed_sec <= 0.0) elapsed_sec = (double)interval_sec;

        unsigned long delta_ticks = (curr_info.utime_ticks + curr_info.stime_ticks) -
                                    (prev_info.utime_ticks + prev_info.stime_ticks);
        double cpu_pct = ((double)delta_ticks / (double)clk_tck) / elapsed_sec * 100.0;
        if (cpu_pct < 0.0) cpu_pct = 0.0;

        time_t raw_time = time(NULL);
        struct tm *tm_info = localtime(&raw_time);
        char time_str[16];
        strftime(time_str, sizeof(time_str), "%H:%M:%S", tm_info);

        char runtime_str[32];
        format_seconds(curr_info.process_runtime_sec, runtime_str, sizeof(runtime_str));

        printf("%-8s %-5d %-4c %6.1f%% %10.2fMB %10.2fMB %-7ld %-10s\n",
               time_str,
               (int)curr_info.pid,
               curr_info.state,
               cpu_pct,
               (double)curr_info.vm_rss_kb / 1024.0,
               (double)curr_info.vm_size_kb / 1024.0,
               curr_info.num_threads,
               runtime_str);
        fflush(stdout);

        proc_free_info(&prev_info);
        prev_info = curr_info;
        prev_time = curr_time;
    }

    proc_free_info(&prev_info);
    sigaction(SIGINT, &sa_old, NULL);
    printf("\n%sMonitoring stopped.%s\n", COLOR_DIM, COLOR_RESET);
    return 0;
}

int builtin_ps(int argc, char **argv) {
    (void)argc;
    (void)argv;

    DIR *proc_dir = opendir("/proc");
    if (!proc_dir) {
        forge_perror("opendir /proc");
        return 1;
    }

    printf("%-6s %-6s %-4s %-7s %-10s %-10s %s\n",
           "PID", "PPID", "STAT", "THREADS", "VmRSS", "TIME", "COMMAND");
    printf("------------------------------------------------------------------\n");

    struct dirent *entry;
    while ((entry = readdir(proc_dir)) != NULL) {
        /* Check if directory name is numeric (PID) */
        char *endptr;
        long pid = strtol(entry->d_name, &endptr, 10);
        if (*endptr != '\0' || pid <= 0) {
            continue;
        }

        ProcInfo info;
        if (proc_get_info((pid_t)pid, &info)) {
            char time_str[32];
            format_seconds(info.total_cpu_sec, time_str, sizeof(time_str));

            char rss_str[32];
            if (info.vm_rss_kb >= 1024) {
                snprintf(rss_str, sizeof(rss_str), "%.1fMB", (double)info.vm_rss_kb / 1024.0);
            } else {
                snprintf(rss_str, sizeof(rss_str), "%luKB", info.vm_rss_kb);
            }

            printf("%-6d %-6d %-4c %-7ld %-10s %-10s %s\n",
                   (int)info.pid,
                   (int)info.ppid,
                   info.state,
                   info.num_threads,
                   rss_str,
                   time_str,
                   info.comm);
            proc_free_info(&info);
        }
    }

    closedir(proc_dir);
    return 0;
}
