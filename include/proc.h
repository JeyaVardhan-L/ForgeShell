#ifndef FORGESHELL_PROC_H
#define FORGESHELL_PROC_H

#include "common.h"

typedef struct ProcInfo {
    pid_t pid;
    pid_t ppid;
    pid_t pgrp;
    pid_t session;
    char comm[256];
    char state;
    const char *state_desc;
    long num_threads;
    
    /* Memory metrics from /proc/<pid>/status */
    unsigned long vm_size_kb;
    unsigned long vm_rss_kb;
    unsigned long vm_data_kb;
    unsigned long vm_stk_kb;
    unsigned long vm_exe_kb;

    /* CPU metrics from /proc/<pid>/stat */
    unsigned long utime_ticks;
    unsigned long stime_ticks;
    unsigned long long starttime_ticks;

    /* Runtime metrics */
    double total_cpu_sec;
    double process_runtime_sec;

    /* Open file descriptors */
    int open_fd_count;

    /* Paths */
    char *cmdline;
    char exe_path[PATH_MAX];
    char cwd_path[PATH_MAX];
} ProcInfo;

/* Fetch process information from Linux /proc. Returns false if process does not exist. */
bool proc_get_info(pid_t pid, ProcInfo *info);

/* Free allocated dynamic memory in ProcInfo */
void proc_free_info(ProcInfo *info);

/* Get human-readable description for single-character process state */
const char *proc_state_description(char state);

/* Builtin commands */
int builtin_inspect(int argc, char **argv);
int builtin_monitor(int argc, char **argv);
int builtin_ps(int argc, char **argv);

#endif /* FORGESHELL_PROC_H */
