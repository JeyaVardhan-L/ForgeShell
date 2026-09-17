#include "common.h"
#include "parser.h"
#include "executor.h"
#include "jobs.h"
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

int main(int argc, char **argv) {
    (void)argc;
    (void)argv;

    shell_init();

    char *line = NULL;
    size_t len = 0;

    while (1) {
        check_and_notify_jobs();
        print_prompt();

        ssize_t nread = getline(&line, &len, stdin);
        if (nread == -1) {
            /* EOF reached (e.g. Ctrl+D or end of pipe) */
            if (g_shell.is_interactive) {
                printf("\n");
            }
            break;
        }

        if (is_all_whitespace(line)) {
            continue;
        }

        JobPipeline *pipeline = parse_pipeline(line);
        if (pipeline) {
            execute_pipeline(pipeline);
            free_pipeline(pipeline);
        }
    }

    free(line);
    return g_shell.last_exit_status;
}
