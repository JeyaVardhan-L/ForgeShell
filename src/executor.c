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

int apply_redirections(const Command *cmd) {
    if (!cmd) return 0;

    /* Stdin redirection: < input_file */
    if (cmd->input_file) {
        int fd = open(cmd->input_file, O_RDONLY);
        if (fd < 0) {
            forge_perror(cmd->input_file);
            return -1;
        }
        if (dup2(fd, STDIN_FILENO) < 0) {
            forge_perror("dup2 stdin");
            close(fd);
            return -1;
        }
        close(fd);
    }

    /* Stdout redirection: > or >> output_file */
    if (cmd->output_file) {
        int flags = O_WRONLY | O_CREAT | (cmd->append_output ? O_APPEND : O_TRUNC);
        int fd = open(cmd->output_file, flags, 0644);
        if (fd < 0) {
            forge_perror(cmd->output_file);
            return -1;
        }
        if (dup2(fd, STDOUT_FILENO) < 0) {
            forge_perror("dup2 stdout");
            close(fd);
            return -1;
        }
        close(fd);
    }

    /* Stderr redirection: 2> error_file */
    if (cmd->error_file) {
        int fd = open(cmd->error_file, O_WRONLY | O_CREAT | O_TRUNC, 0644);
        if (fd < 0) {
            forge_perror(cmd->error_file);
            return -1;
        }
        if (dup2(fd, STDERR_FILENO) < 0) {
            forge_perror("dup2 stderr");
            close(fd);
            return -1;
        }
        close(fd);
    }

    return 0;
}

int execute_pipeline(JobPipeline *pipeline) {
    if (!pipeline || !pipeline->first_cmd) {
        return 0;
    }

    /* Count commands */
    int num_cmds = 0;
    for (Command *c = pipeline->first_cmd; c; c = c->next) {
        num_cmds++;
    }

    /* Check for single builtin 'exit' (expanded in Milestone 4) */
    if (num_cmds == 1 && pipeline->first_cmd->argc > 0 &&
        strcmp(pipeline->first_cmd->argv[0], "exit") == 0) {
        int code = (pipeline->first_cmd->argc > 1) ? atoi(pipeline->first_cmd->argv[1]) : g_shell.last_exit_status;
        exit(code);
    }

    pid_t *pids = xmalloc(num_cmds * sizeof(pid_t));
    int prev_pipe_read = -1;
    Command *cmd = pipeline->first_cmd;

    for (int i = 0; i < num_cmds; i++, cmd = cmd->next) {
        int pipefds[2] = {-1, -1};
        if (i < num_cmds - 1) {
            if (pipe(pipefds) < 0) {
                forge_perror("pipe");
                g_shell.last_exit_status = 1;
                free(pids);
                return 1;
            }
        }

        pid_t pid = fork();
        if (pid < 0) {
            forge_perror("fork");
            if (pipefds[0] != -1) {
                close(pipefds[0]);
                close(pipefds[1]);
            }
            if (prev_pipe_read != -1) {
                close(prev_pipe_read);
            }
            g_shell.last_exit_status = 1;
            free(pids);
            return 1;
        }

        if (pid == 0) {
            /* Child process */
            if (prev_pipe_read != -1) {
                if (dup2(prev_pipe_read, STDIN_FILENO) < 0) {
                    forge_perror("dup2 prev pipe");
                    _exit(1);
                }
                close(prev_pipe_read);
            }

            if (i < num_cmds - 1) {
                close(pipefds[0]); /* Child does not read from current pipe */
                if (dup2(pipefds[1], STDOUT_FILENO) < 0) {
                    forge_perror("dup2 pipe write");
                    _exit(1);
                }
                close(pipefds[1]);
            }

            /* Apply file descriptor redirections */
            if (apply_redirections(cmd) < 0) {
                _exit(1);
            }

            /* Execute external command */
            execvp(cmd->argv[0], cmd->argv);

            /* Error handling if execvp returns */
            if (errno == ENOENT) {
                fprintf(stderr, "forge: %s: command not found\n", cmd->argv[0]);
                _exit(127);
            } else if (errno == EACCES) {
                fprintf(stderr, "forge: %s: Permission denied\n", cmd->argv[0]);
                _exit(126);
            } else {
                forge_perror(cmd->argv[0]);
                _exit(126);
            }
        }

        /* Parent process */
        pids[i] = pid;

        if (prev_pipe_read != -1) {
            close(prev_pipe_read);
        }

        if (i < num_cmds - 1) {
            close(pipefds[1]); /* Parent does not write to pipe */
            prev_pipe_read = pipefds[0];
        } else {
            prev_pipe_read = -1;
        }
    }

    /* Wait for all child processes in pipeline */
    int last_status = 0;
    for (int i = 0; i < num_cmds; i++) {
        int status = 0;
        pid_t wpid;
        do {
            wpid = waitpid(pids[i], &status, 0);
        } while (wpid == -1 && errno == EINTR);

        if (i == num_cmds - 1) {
            last_status = status;
        }
    }

    free(pids);

    if (WIFEXITED(last_status)) {
        g_shell.last_exit_status = WEXITSTATUS(last_status);
    } else if (WIFSIGNALED(last_status)) {
        int sig = WTERMSIG(last_status);
        g_shell.last_exit_status = 128 + sig;
        if (sig == SIGSEGV) {
            fprintf(stderr, "forge: Segmentation fault (core dumped)\n");
        } else if (sig == SIGABRT) {
            fprintf(stderr, "forge: Aborted (core dumped)\n");
        }
    }

    return g_shell.last_exit_status;
}
