#include "executor.h"

ShellState g_shell = {
    .last_exit_status = 0,
    .is_interactive = false,
    .shell_pgid = 0,
    .shell_terminal = STDIN_FILENO
};

void shell_init(void) {
    g_shell.shell_terminal = STDIN_FILENO;
    g_shell.is_interactive = isatty(g_shell.shell_terminal);
    g_shell.last_exit_status = 0;

    if (g_shell.is_interactive) {
        /* Loop until we are in the foreground process group */
        while (tcgetpgrp(g_shell.shell_terminal) != (g_shell.shell_pgid = getpgrp())) {
            kill(-g_shell.shell_pgid, SIGTTIN);
        }

        /* Set up signal dispositions for interactive shell */
        signals_init_shell();

        /* Place shell into its own process group. A session leader (e.g. a
         * shell started directly by a terminal emulator) already leads its
         * group, and setpgid() on a session leader fails with EPERM. */
        g_shell.shell_pgid = getpid();
        if (getpgrp() != g_shell.shell_pgid &&
            setpgid(g_shell.shell_pgid, g_shell.shell_pgid) < 0) {
            forge_perror("setpgid");
        }

        /* Acquire terminal control */
        tcsetpgrp(g_shell.shell_terminal, g_shell.shell_pgid);

        /* Save default terminal attributes */
        tcgetattr(g_shell.shell_terminal, &g_shell.shell_tmodes);
    }

    jobs_init();
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

static int execute_single_builtin(Command *cmd) {
    /* Save standard file descriptors */
    int saved_stdin = dup(STDIN_FILENO);
    int saved_stdout = dup(STDOUT_FILENO);
    int saved_stderr = dup(STDERR_FILENO);

    int status = 0;
    if (apply_redirections(cmd) < 0) {
        status = 1;
    } else {
        status = execute_builtin(cmd->argc, cmd->argv);
    }

    /* Restore file descriptors */
    dup2(saved_stdin, STDIN_FILENO);
    dup2(saved_stdout, STDOUT_FILENO);
    dup2(saved_stderr, STDERR_FILENO);

    close(saved_stdin);
    close(saved_stdout);
    close(saved_stderr);

    g_shell.last_exit_status = status;
    return status;
}

int execute_pipeline(JobPipeline *pipeline) {
    if (!pipeline || !pipeline->first_cmd) {
        return 0;
    }

    /* Count commands in the pipeline */
    int num_cmds = 0;
    for (Command *c = pipeline->first_cmd; c; c = c->next) {
        num_cmds++;
    }

    /* If it's a single command and it's a builtin, run in-process (unless background) */
    if (num_cmds == 1 && !pipeline->is_background && is_builtin(pipeline->first_cmd->argv[0])) {
        return execute_single_builtin(pipeline->first_cmd);
    }

    /* Allocate Job entry for tracking */
    Job *job = job_create(0, pipeline->raw_line);

    pid_t pgid = 0;
    int prev_pipe_read = -1;
    Command *cmd = pipeline->first_cmd;

    for (int i = 0; i < num_cmds; i++, cmd = cmd->next) {
        int pipefds[2] = {-1, -1};
        if (i < num_cmds - 1) {
            if (pipe(pipefds) < 0) {
                forge_perror("pipe");
                g_shell.last_exit_status = 1;
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
            return 1;
        }

        if (pid == 0) {
            /* Child process */
            pid_t my_pid = getpid();
            if (pgid == 0) pgid = my_pid;

            /* Put child in job's process group */
            setpgid(0, pgid);

            /* If foreground and interactive, assign terminal control */
            if (!pipeline->is_background && g_shell.is_interactive) {
                tcsetpgrp(g_shell.shell_terminal, pgid);
            }

            /* Restore default signal handlers */
            signals_reset_child();

            /* Wire pipeline input */
            if (prev_pipe_read != -1) {
                if (dup2(prev_pipe_read, STDIN_FILENO) < 0) {
                    forge_perror("dup2 pipe in");
                    _exit(1);
                }
                close(prev_pipe_read);
            }

            /* Wire pipeline output */
            if (i < num_cmds - 1) {
                close(pipefds[0]);
                if (dup2(pipefds[1], STDOUT_FILENO) < 0) {
                    forge_perror("dup2 pipe out");
                    _exit(1);
                }
                close(pipefds[1]);
            }

            /* Apply file descriptor redirections */
            if (apply_redirections(cmd) < 0) {
                _exit(1);
            }

            /* Execute builtin if part of a pipeline */
            if (is_builtin(cmd->argv[0])) {
                int code = execute_builtin(cmd->argc, cmd->argv);
                _exit(code);
            }

            /* Execute external command */
            execvp(cmd->argv[0], cmd->argv);

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
        if (pgid == 0) {
            pgid = pid;
            job->pgid = pgid;
        }

        /* Setpgid in parent as well to eliminate race conditions */
        setpgid(pid, pgid);

        /* Add process to job */
        job_add_process(job, pid);

        if (prev_pipe_read != -1) {
            close(prev_pipe_read);
        }

        if (i < num_cmds - 1) {
            close(pipefds[1]);
            prev_pipe_read = pipefds[0];
        } else {
            prev_pipe_read = -1;
        }
    }

    if (pipeline->is_background) {
        return put_job_in_background(job, false);
    } else {
        return put_job_in_foreground(job, false);
    }
}
