#ifndef FORGESHELL_EXECUTOR_H
#define FORGESHELL_EXECUTOR_H

#include "common.h"
#include "parser.h"
#include "builtins.h"
#include "jobs.h"
#include "signals.h"
#include <sys/wait.h>
#include <fcntl.h>
#include <termios.h>

/* Shell execution state */
typedef struct ShellState {
    int last_exit_status;
    bool is_interactive;
    pid_t shell_pgid;
    int shell_terminal;
    struct termios shell_tmodes;
} ShellState;

extern ShellState g_shell;

/* Initialize shell environment, job control, and terminal signals */
void shell_init(void);

/* Apply I/O redirections for a single command. Returns 0 on success, -1 on failure. */
int apply_redirections(const Command *cmd);

/* Execute a single external command, builtin, or pipeline */
int execute_pipeline(JobPipeline *pipeline);

#endif /* FORGESHELL_EXECUTOR_H */
