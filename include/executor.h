#ifndef FORGESHELL_EXECUTOR_H
#define FORGESHELL_EXECUTOR_H

#include "common.h"
#include <sys/wait.h>

/* Shell execution state */
typedef struct ShellState {
    int last_exit_status;
    bool is_interactive;
    pid_t shell_pgid;
    int shell_terminal;
} ShellState;

extern ShellState g_shell;

/* Initialize and clean up shell state */
void shell_init(void);

/* Execute a simple argument array via fork(), execvp(), and waitpid() */
int execute_command_args(char **argv);

#endif /* FORGESHELL_EXECUTOR_H */
