#include "common.h"
#include "executor.h"
#include <ctype.h>

static void print_prompt(void) {
    if (g_shell.is_interactive) {
        if (isatty(STDOUT_FILENO)) {
            printf("%sforge>%s ", COLOR_BOLD COLOR_BLUE, COLOR_RESET);
        } else {
            printf("forge> ");
        }
        fflush(stdout);
    }
}

static bool is_all_whitespace(const char *str) {
    while (*str) {
        if (!isspace((unsigned char)*str)) {
            return false;
        }
        str++;
    }
    return true;
}

/* Simple whitespace tokenizer for milestone 2 core execution */
static char **tokenize_simple(const char *input, int *argc_out) {
    size_t capacity = 16;
    size_t count = 0;
    char **argv = xmalloc(capacity * sizeof(char *));

    char *copy = xstrdup(input);
    char *token = strtok(copy, " \t\r\n");
    while (token) {
        if (count + 1 >= capacity) {
            capacity *= 2;
            argv = xrealloc(argv, capacity * sizeof(char *));
        }
        argv[count++] = xstrdup(token);
        token = strtok(NULL, " \t\r\n");
    }
    argv[count] = NULL;
    free(copy);

    if (argc_out) {
        *argc_out = (int)count;
    }
    return argv;
}

static void free_simple_argv(char **argv) {
    if (!argv) return;
    for (int i = 0; argv[i]; i++) {
        free(argv[i]);
    }
    free(argv);
}

int main(int argc, char **argv) {
    (void)argc;
    (void)argv;

    shell_init();

    char *line = NULL;
    size_t len = 0;

    while (1) {
        print_prompt();

        ssize_t nread = getline(&line, &len, stdin);
        if (nread == -1) {
            /* EOF reached (e.g. Ctrl+D or end of script/pipe) */
            if (g_shell.is_interactive) {
                printf("\n");
            }
            break;
        }

        /* Check for empty line or whitespace only */
        if (is_all_whitespace(line)) {
            continue;
        }

        int cmd_argc = 0;
        char **cmd_argv = tokenize_simple(line, &cmd_argc);
        if (cmd_argc > 0) {
            /* Simple exit check for milestone 2 */
            if (strcmp(cmd_argv[0], "exit") == 0) {
                int exit_code = (cmd_argc > 1) ? atoi(cmd_argv[1]) : g_shell.last_exit_status;
                free_simple_argv(cmd_argv);
                free(line);
                return exit_code;
            }

            execute_command_args(cmd_argv);
        }
        free_simple_argv(cmd_argv);
    }

    free(line);
    return g_shell.last_exit_status;
}
