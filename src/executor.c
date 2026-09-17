#include "executor.h"
#include <signal.h>

ShellState g_shell = {
    .last_exit_status = 0,
    .is_interactive = false,
    .shell_pgid = 0,
    .shell_terminal = STDIN_FILENO
};

void shell_init(void) {
    g_shell.shell_terminal = STDIN_FILENO;
    g_shell.is_interactive = isatty(g_shell.shell_terminal);
    g_shell.shell_pgid = getpgrp();
    g_shell.last_exit_status = 0;
}

int execute_command_args(char **argv) {
    if (!argv || !argv[0]) {
        return 0;
    }

    pid_t pid = fork();
    if (pid < 0) {
        forge_perror("fork");
        g_shell.last_exit_status = 1;
        return 1;
    }

    if (pid == 0) {
        /* Child process */
        execvp(argv[0], argv);

        /* If execvp returns, an error occurred */
        if (errno == ENOENT) {
            fprintf(stderr, "forge: %s: command not found\n", argv[0]);
            _exit(127);
        } else if (errno == EACCES) {
            fprintf(stderr, "forge: %s: Permission denied\n", argv[0]);
            _exit(126);
        } else {
            forge_perror(argv[0]);
            _exit(126);
        }
    }

    /* Parent process */
    int status = 0;
    pid_t wpid;
    do {
        wpid = waitpid(pid, &status, 0);
    } while (wpid == -1 && errno == EINTR);

    if (wpid == -1) {
        forge_perror("waitpid");
        g_shell.last_exit_status = 1;
        return 1;
    }

    if (WIFEXITED(status)) {
        g_shell.last_exit_status = WEXITSTATUS(status);
    } else if (WIFSIGNALED(status)) {
        int sig = WTERMSIG(status);
        g_shell.last_exit_status = 128 + sig;
        if (sig == SIGSEGV) {
            fprintf(stderr, "forge: Segmentation fault (core dumped)\n");
        } else if (sig == SIGABRT) {
            fprintf(stderr, "forge: Aborted (core dumped)\n");
        } else if (sig == SIGBUS) {
            fprintf(stderr, "forge: Bus error (core dumped)\n");
        } else if (sig == SIGFPE) {
            fprintf(stderr, "forge: Floating point exception (core dumped)\n");
        }
    }

    return g_shell.last_exit_status;
}
