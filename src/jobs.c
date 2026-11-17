#include "jobs.h"
#include "executor.h"
#include <sys/wait.h>
#include <ctype.h>

static Job *g_job_list = NULL;

void jobs_init(void) {
    g_job_list = NULL;
}

/* Job IDs work like Bash: one more than the highest ID still in the table,
 * so numbering restarts at 1 once every job has finished. */
static int next_job_id(void) {
    int max_id = 0;
    for (Job *j = g_job_list; j; j = j->next) {
        if (j->id > max_id) {
            max_id = j->id;
        }
    }
    return max_id + 1;
}

Job *job_create(pid_t pgid, const char *cmd_str) {
    Job *job = xmalloc(sizeof(Job));
    job->id = next_job_id();
    job->pgid = pgid;
    job->state = JOB_STATE_RUNNING;
    job->command_str = xstrdup(cmd_str);
    job->first_process = NULL;
    job->notified = false;
    job->next = NULL;

    /* Append to job list */
    if (!g_job_list) {
        g_job_list = job;
    } else {
        Job *curr = g_job_list;
        while (curr->next) {
            curr = curr->next;
        }
        curr->next = job;
    }

    return job;
}

void job_add_process(Job *job, pid_t pid) {
    if (!job) return;
    Process *proc = xmalloc(sizeof(Process));
    proc->pid = pid;
    proc->state = JOB_STATE_RUNNING;
    proc->status = 0;
    proc->completed = false;
    proc->stopped = false;
    proc->next = NULL;

    if (!job->first_process) {
        job->first_process = proc;
    } else {
        Process *curr = job->first_process;
        while (curr->next) {
            curr = curr->next;
        }
        curr->next = proc;
    }
}

Job *job_find_by_id(int id) {
    Job *curr = g_job_list;
    while (curr) {
        if (curr->id == id) {
            return curr;
        }
        curr = curr->next;
    }
    return NULL;
}

Job *job_find_by_pgid(pid_t pgid) {
    Job *curr = g_job_list;
    while (curr) {
        if (curr->pgid == pgid) {
            return curr;
        }
        curr = curr->next;
    }
    return NULL;
}

Job *job_get_most_recent(void) {
    if (!g_job_list) return NULL;
    Job *curr = g_job_list;
    while (curr->next) {
        curr = curr->next;
    }
    return curr;
}

void job_free(Job *job) {
    if (!job) return;
    Process *p = job->first_process;
    while (p) {
        Process *next = p->next;
        free(p);
        p = next;
    }
    if (job->command_str) {
        free(job->command_str);
    }
    free(job);
}

void job_remove(Job *job) {
    if (!job || !g_job_list) return;
    if (g_job_list == job) {
        g_job_list = job->next;
        job_free(job);
        return;
    }
    Job *prev = g_job_list;
    while (prev->next && prev->next != job) {
        prev = prev->next;
    }
    if (prev->next == job) {
        prev->next = job->next;
        job_free(job);
    }
}

bool job_is_completed(const Job *job) {
    if (!job || !job->first_process) return true;
    for (Process *p = job->first_process; p; p = p->next) {
        if (!p->completed) {
            return false;
        }
    }
    return true;
}

bool job_is_stopped(const Job *job) {
    if (!job || !job->first_process) return false;
    bool has_stopped = false;
    for (Process *p = job->first_process; p; p = p->next) {
        if (!p->completed) {
            if (!p->stopped) {
                return false; /* At least one process is still running */
            }
            has_stopped = true;
        }
    }
    return has_stopped;
}

static void update_process_status(pid_t pid, int status) {
    for (Job *j = g_job_list; j; j = j->next) {
        for (Process *p = j->first_process; p; p = p->next) {
            if (p->pid == pid) {
                p->status = status;
                if (WIFSTOPPED(status)) {
                    p->stopped = true;
                    p->state = JOB_STATE_STOPPED;
                } else if (WIFCONTINUED(status)) {
                    p->stopped = false;
                    p->state = JOB_STATE_RUNNING;
                } else {
                    p->completed = true;
                    p->stopped = false;
                    p->state = JOB_STATE_DONE;
                }
                return;
            }
        }
    }
}

int wait_for_job(Job *job) {
    if (!job) return 0;

    int last_status = 0;
    while (!job_is_stopped(job) && !job_is_completed(job)) {
        int status = 0;
        pid_t pid = waitpid(-job->pgid, &status, WUNTRACED);
        if (pid < 0) {
            if (errno == ECHILD) {
                /* All children reaped */
                for (Process *p = job->first_process; p; p = p->next) {
                    p->completed = true;
                }
                break;
            }
            if (errno == EINTR) {
                continue;
            }
            forge_perror("waitpid");
            break;
        }

        update_process_status(pid, status);
        last_status = status;
    }

    if (job_is_completed(job)) {
        job->state = JOB_STATE_DONE;
        /* Like Bash, a pipeline's status is the status of its last command,
         * not of whichever process happened to be reaped last. */
        Process *last = job->first_process;
        while (last && last->next) {
            last = last->next;
        }
        if (last) {
            last_status = last->status;
        }
        if (WIFEXITED(last_status)) {
            g_shell.last_exit_status = WEXITSTATUS(last_status);
        } else if (WIFSIGNALED(last_status)) {
            int sig = WTERMSIG(last_status);
            g_shell.last_exit_status = 128 + sig;
            if (sig == SIGINT) {
                printf("\n");
            } else if (sig == SIGSEGV) {
                fprintf(stderr, "forge: Segmentation fault (core dumped)\n");
            } else if (sig == SIGABRT) {
                fprintf(stderr, "forge: Aborted (core dumped)\n");
            }
        }
    } else if (job_is_stopped(job)) {
        job->state = JOB_STATE_STOPPED;
        job->notified = true; /* reported here, so check_and_notify_jobs() stays quiet */
        printf("\n[%d]+ Stopped                 %s\n", job->id, job->command_str);
        g_shell.last_exit_status = 128 + SIGTSTP;
    }

    return g_shell.last_exit_status;
}

int put_job_in_foreground(Job *job, bool cont) {
    if (!job) return 1;

    /* Transfer terminal control to the job's process group */
    if (g_shell.is_interactive) {
        if (tcsetpgrp(g_shell.shell_terminal, job->pgid) < 0) {
            forge_perror("tcsetpgrp");
        }
    }

    /* If reviving a stopped job, send SIGCONT */
    if (cont) {
        job->state = JOB_STATE_RUNNING;
        job->notified = false;
        for (Process *p = job->first_process; p; p = p->next) {
            p->stopped = false;
        }
        if (kill(-job->pgid, SIGCONT) < 0) {
            forge_perror("kill (SIGCONT)");
        }
        /* Print command name when brought to foreground via fg */
        printf("%s\n", job->command_str);
        fflush(stdout);
    }

    /* Wait for the job to complete or be suspended */
    int status = wait_for_job(job);

    /* Reclaim terminal control for the shell */
    if (g_shell.is_interactive) {
        if (tcsetpgrp(g_shell.shell_terminal, g_shell.shell_pgid) < 0) {
            forge_perror("tcsetpgrp restore");
        }
        tcsetattr(g_shell.shell_terminal, TCSADRAIN, &g_shell.shell_tmodes);
    }

    /* If completed, delete from job list */
    if (job_is_completed(job)) {
        job_remove(job);
    }

    return status;
}

int put_job_in_background(Job *job, bool cont) {
    if (!job) return 1;

    job->state = JOB_STATE_RUNNING;
    if (cont) {
        job->notified = false;
        for (Process *p = job->first_process; p; p = p->next) {
            p->stopped = false;
        }
        if (kill(-job->pgid, SIGCONT) < 0) {
            forge_perror("kill (SIGCONT)");
        }
        printf("[%d]+ %s &\n", job->id, job->command_str);
    } else {
        printf("[%d] %d\n", job->id, (int)job->pgid);
    }
    return 0;
}

void check_and_notify_jobs(void) {
    int status;
    pid_t pid;

    /* Non-blocking check for any state changes in child processes */
    while ((pid = waitpid(-1, &status, WNOHANG | WUNTRACED | WCONTINUED)) > 0) {
        update_process_status(pid, status);
    }

    /* Scan job list and notify completed / stopped background jobs */
    Job *curr = g_job_list;
    while (curr) {
        Job *next = curr->next;
        if (job_is_completed(curr)) {
            printf("[%d]+ Done                    %s\n", curr->id, curr->command_str);
            job_remove(curr);
        } else if (job_is_stopped(curr) && !curr->notified) {
            printf("[%d]+ Stopped                 %s\n", curr->id, curr->command_str);
            curr->notified = true;
        }
        curr = next;
    }
}

int builtin_jobs(int argc, char **argv) {
    (void)argc;
    (void)argv;

    check_and_notify_jobs();

    if (!g_job_list) {
        return 0;
    }

    Job *recent = job_get_most_recent();
    for (Job *j = g_job_list; j; j = j->next) {
        char mark = (j == recent) ? '+' : '-';
        const char *state_str = "Running";
        if (j->state == JOB_STATE_STOPPED) {
            state_str = "Stopped";
        } else if (j->state == JOB_STATE_DONE) {
            state_str = "Done";
        }
        printf("[%d]%c %-10s %s\n", j->id, mark, state_str, j->command_str);
    }

    return 0;
}

static Job *parse_job_spec(const char *arg) {
    if (!arg) {
        return job_get_most_recent();
    }
    if (arg[0] == '%') {
        arg++;
    }
    int id = atoi(arg);
    if (id <= 0) {
        return NULL;
    }
    return job_find_by_id(id);
}

int builtin_fg(int argc, char **argv) {
    const char *spec = (argc > 1) ? argv[1] : NULL;
    Job *job = parse_job_spec(spec);
    if (!job) {
        if (spec) {
            forge_error("fg: %s: no such job", spec);
        } else {
            forge_error("fg: current: no such job");
        }
        return 1;
    }

    return put_job_in_foreground(job, true);
}

int builtin_bg(int argc, char **argv) {
    const char *spec = (argc > 1) ? argv[1] : NULL;
    Job *job = parse_job_spec(spec);
    if (!job) {
        if (spec) {
            forge_error("bg: %s: no such job", spec);
        } else {
            forge_error("bg: current: no such job");
        }
        return 1;
    }

    return put_job_in_background(job, true);
}
