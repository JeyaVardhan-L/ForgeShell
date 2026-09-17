#ifndef FORGESHELL_JOBS_H
#define FORGESHELL_JOBS_H

#include "common.h"
#include <termios.h>

typedef enum {
    JOB_STATE_RUNNING,
    JOB_STATE_STOPPED,
    JOB_STATE_DONE
} JobState;

typedef struct Process {
    pid_t pid;
    JobState state;
    int status;
    bool completed;
    bool stopped;
    struct Process *next;
} Process;

typedef struct Job {
    int id;
    pid_t pgid;
    JobState state;
    char *command_str;
    Process *first_process;
    struct termios tmodes;
    bool notified;
    struct Job *next;
} Job;

/* Job manager functions */
void jobs_init(void);
Job *job_create(pid_t pgid, const char *cmd_str);
void job_add_process(Job *job, pid_t pid);
Job *job_find_by_id(int id);
Job *job_find_by_pgid(pid_t pgid);
Job *job_get_most_recent(void);
void job_remove(Job *job);
void job_free(Job *job);

/* Job control actions */
int wait_for_job(Job *job);
int put_job_in_foreground(Job *job, bool cont);
int put_job_in_background(Job *job, bool cont);
void check_and_notify_jobs(void);

/* Check if all processes in job completed */
bool job_is_completed(const Job *job);
bool job_is_stopped(const Job *job);

/* Builtin job commands */
int builtin_jobs(int argc, char **argv);
int builtin_fg(int argc, char **argv);
int builtin_bg(int argc, char **argv);

#endif /* FORGESHELL_JOBS_H */
