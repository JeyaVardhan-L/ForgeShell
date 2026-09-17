#include "builtins.h"
#include "jobs.h"
#include "executor.h"

extern char **environ;

/* Forward declarations for proc observability builtins (implemented in Milestone 5) */
int builtin_inspect(int argc, char **argv) __attribute__((weak));
int builtin_monitor(int argc, char **argv) __attribute__((weak));
int builtin_ps(int argc, char **argv) __attribute__((weak));

bool is_builtin(const char *name) {
    if (!name) return false;
    return (strcmp(name, "cd") == 0 ||
            strcmp(name, "pwd") == 0 ||
            strcmp(name, "exit") == 0 ||
            strcmp(name, "export") == 0 ||
            strcmp(name, "unset") == 0 ||
            strcmp(name, "jobs") == 0 ||
            strcmp(name, "fg") == 0 ||
            strcmp(name, "bg") == 0 ||
            strcmp(name, "help") == 0 ||
            strcmp(name, "inspect") == 0 ||
            strcmp(name, "monitor") == 0 ||
            strcmp(name, "ps") == 0);
}

int builtin_cd(int argc, char **argv) {
    const char *target = NULL;
    char cwd_buf[PATH_MAX];

    if (argc == 1 || strcmp(argv[1], "~") == 0) {
        target = getenv("HOME");
        if (!target) {
            forge_error("cd: HOME not set");
            return 1;
        }
    } else if (strcmp(argv[1], "-") == 0) {
        target = getenv("OLDPWD");
        if (!target) {
            forge_error("cd: OLDPWD not set");
            return 1;
        }
        printf("%s\n", target);
    } else {
        target = argv[1];
    }

    if (!getcwd(cwd_buf, sizeof(cwd_buf))) {
        cwd_buf[0] = '\0';
    }

    if (chdir(target) != 0) {
        forge_perror(target);
        return 1;
    }

    if (cwd_buf[0] != '\0') {
        setenv("OLDPWD", cwd_buf, 1);
    }

    char new_cwd[PATH_MAX];
    if (getcwd(new_cwd, sizeof(new_cwd))) {
        setenv("PWD", new_cwd, 1);
    }

    return 0;
}

int builtin_pwd(int argc, char **argv) {
    (void)argc;
    (void)argv;
    char cwd_buf[PATH_MAX];
    if (getcwd(cwd_buf, sizeof(cwd_buf))) {
        printf("%s\n", cwd_buf);
        return 0;
    } else {
        forge_perror("pwd");
        return 1;
    }
}

int builtin_exit(int argc, char **argv) {
    int code = g_shell.last_exit_status;
    if (argc > 1) {
        code = atoi(argv[1]);
    }
    exit(code);
}

int builtin_export(int argc, char **argv) {
    if (argc == 1) {
        /* Print all environment variables */
        for (char **env = environ; *env; env++) {
            printf("declare -x %s\n", *env);
        }
        return 0;
    }

    for (int i = 1; i < argc; i++) {
        char *eq = strchr(argv[i], '=');
        if (eq) {
            *eq = '\0';
            const char *key = argv[i];
            const char *val = eq + 1;
            if (setenv(key, val, 1) != 0) {
                forge_perror("export");
                *eq = '=';
                return 1;
            }
            *eq = '=';
        } else {
            /* If no equals sign, keep existing value or export empty */
            const char *val = getenv(argv[i]);
            if (val) {
                setenv(argv[i], val, 1);
            }
        }
    }
    return 0;
}

int builtin_unset(int argc, char **argv) {
    if (argc < 2) {
        forge_error("unset: not enough arguments");
        return 1;
    }

    for (int i = 1; i < argc; i++) {
        if (unsetenv(argv[i]) != 0) {
            forge_perror("unset");
            return 1;
        }
    }
    return 0;
}

int builtin_help(int argc, char **argv) {
    (void)argc;
    (void)argv;

    printf("\n%sForgeShell v%s - Resource-Aware Unix Shell%s\n", COLOR_BOLD, FORGE_VERSION, COLOR_RESET);
    printf("Built for systems programming, process management, and Linux observability.\n\n");
    printf("%sBuiltin Commands:%s\n", COLOR_BOLD COLOR_BLUE, COLOR_RESET);
    printf("  cd [dir]            Change directory (supports HOME, -, ~)\n");
    printf("  pwd                 Print current working directory\n");
    printf("  export KEY=VAL      Set environment variable\n");
    printf("  unset KEY           Unset environment variable\n");
    printf("  jobs                List background and stopped jobs\n");
    printf("  fg [%%id]            Bring job to foreground\n");
    printf("  bg [%%id]            Resume stopped job in background\n");
    printf("  inspect <pid>       Deep Linux /proc inspection of process\n");
    printf("  monitor <pid> [sec] Live CPU and RSS memory monitor\n");
    printf("  ps                  Process status overview\n");
    printf("  help                Display this reference guide\n");
    printf("  exit [code]         Exit ForgeShell\n\n");
    printf("%sJob Control & Operators:%s\n", COLOR_BOLD COLOR_BLUE, COLOR_RESET);
    printf("  cmd &               Execute command in background\n");
    printf("  cmd1 | cmd2         Pipeline stdout to stdin\n");
    printf("  cmd < in > out      File descriptor redirection\n");
    printf("  cmd >> out 2> err   Append stdout and redirect stderr\n");
    printf("  Ctrl+C              Interrupt foreground process group\n");
    printf("  Ctrl+Z              Suspend foreground process group\n\n");
    return 0;
}

int execute_builtin(int argc, char **argv) {
    if (argc <= 0 || !argv[0]) return 0;
    const char *name = argv[0];

    if (strcmp(name, "cd") == 0) return builtin_cd(argc, argv);
    if (strcmp(name, "pwd") == 0) return builtin_pwd(argc, argv);
    if (strcmp(name, "exit") == 0) return builtin_exit(argc, argv);
    if (strcmp(name, "export") == 0) return builtin_export(argc, argv);
    if (strcmp(name, "unset") == 0) return builtin_unset(argc, argv);
    if (strcmp(name, "jobs") == 0) return builtin_jobs(argc, argv);
    if (strcmp(name, "fg") == 0) return builtin_fg(argc, argv);
    if (strcmp(name, "bg") == 0) return builtin_bg(argc, argv);
    if (strcmp(name, "help") == 0) return builtin_help(argc, argv);

    if (strcmp(name, "inspect") == 0 && builtin_inspect) return builtin_inspect(argc, argv);
    if (strcmp(name, "monitor") == 0 && builtin_monitor) return builtin_monitor(argc, argv);
    if (strcmp(name, "ps") == 0 && builtin_ps) return builtin_ps(argc, argv);

    forge_error("%s: builtin not yet implemented", name);
    return 1;
}
