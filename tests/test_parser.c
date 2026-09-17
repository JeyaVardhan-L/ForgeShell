#include "parser.h"
#include <assert.h>

static int g_tests_run = 0;
static int g_tests_passed = 0;

#define TEST(name) \
    do { \
        printf("  [RUN ] %s\n", name); \
        g_tests_run++; \
    } while (0)

#define PASS(name) \
    do { \
        printf("  [PASS] %s\n", name); \
        g_tests_passed++; \
    } while (0)

static void test_simple_command(void) {
    TEST("test_simple_command");
    JobPipeline *p = parse_pipeline("ls");
    assert(p != NULL);
    assert(!p->is_background);
    assert(p->first_cmd != NULL);
    assert(p->first_cmd->argc == 1);
    assert(strcmp(p->first_cmd->argv[0], "ls") == 0);
    assert(p->first_cmd->next == NULL);
    free_pipeline(p);
    PASS("test_simple_command");
}

static void test_arguments_and_spaces(void) {
    TEST("test_arguments_and_spaces");
    JobPipeline *p = parse_pipeline("   echo    one   two    three   ");
    assert(p != NULL);
    assert(!p->is_background);
    assert(p->first_cmd->argc == 4);
    assert(strcmp(p->first_cmd->argv[0], "echo") == 0);
    assert(strcmp(p->first_cmd->argv[1], "one") == 0);
    assert(strcmp(p->first_cmd->argv[2], "two") == 0);
    assert(strcmp(p->first_cmd->argv[3], "three") == 0);
    free_pipeline(p);
    PASS("test_arguments_and_spaces");
}

static void test_single_quotes(void) {
    TEST("test_single_quotes");
    JobPipeline *p = parse_pipeline("echo 'hello   world   $NOT_EXPANDED'");
    assert(p != NULL);
    assert(p->first_cmd->argc == 2);
    assert(strcmp(p->first_cmd->argv[0], "echo") == 0);
    assert(strcmp(p->first_cmd->argv[1], "hello   world   $NOT_EXPANDED") == 0);
    free_pipeline(p);
    PASS("test_single_quotes");
}

static void test_double_quotes_and_escapes(void) {
    TEST("test_double_quotes_and_escapes");
    JobPipeline *p = parse_pipeline("echo \"hello \\\"quoted\\\" world\"");
    assert(p != NULL);
    assert(p->first_cmd->argc == 2);
    assert(strcmp(p->first_cmd->argv[0], "echo") == 0);
    assert(strcmp(p->first_cmd->argv[1], "hello \"quoted\" world") == 0);
    free_pipeline(p);
    PASS("test_double_quotes_and_escapes");
}

static void test_redirections(void) {
    TEST("test_redirections");
    JobPipeline *p = parse_pipeline("sort < input.txt > output.txt 2> error.log");
    assert(p != NULL);
    assert(p->first_cmd->argc == 1);
    assert(strcmp(p->first_cmd->argv[0], "sort") == 0);
    assert(p->first_cmd->input_file != NULL);
    assert(strcmp(p->first_cmd->input_file, "input.txt") == 0);
    assert(p->first_cmd->output_file != NULL);
    assert(strcmp(p->first_cmd->output_file, "output.txt") == 0);
    assert(!p->first_cmd->append_output);
    assert(p->first_cmd->error_file != NULL);
    assert(strcmp(p->first_cmd->error_file, "error.log") == 0);
    free_pipeline(p);

    /* Test append redirection */
    JobPipeline *p2 = parse_pipeline("log_tool >> append.log");
    assert(p2 != NULL);
    assert(p2->first_cmd->output_file != NULL);
    assert(strcmp(p2->first_cmd->output_file, "append.log") == 0);
    assert(p2->first_cmd->append_output);
    free_pipeline(p2);
    PASS("test_redirections");
}

static void test_pipeline(void) {
    TEST("test_pipeline");
    JobPipeline *p = parse_pipeline("cat file.txt | grep error | wc -l");
    assert(p != NULL);
    assert(!p->is_background);

    Command *cmd1 = p->first_cmd;
    assert(cmd1 != NULL);
    assert(cmd1->argc == 2);
    assert(strcmp(cmd1->argv[0], "cat") == 0);
    assert(strcmp(cmd1->argv[1], "file.txt") == 0);

    Command *cmd2 = cmd1->next;
    assert(cmd2 != NULL);
    assert(cmd2->argc == 2);
    assert(strcmp(cmd2->argv[0], "grep") == 0);
    assert(strcmp(cmd2->argv[1], "error") == 0);

    Command *cmd3 = cmd2->next;
    assert(cmd3 != NULL);
    assert(cmd3->argc == 2);
    assert(strcmp(cmd3->argv[0], "wc") == 0);
    assert(strcmp(cmd3->argv[1], "-l") == 0);
    assert(cmd3->next == NULL);

    free_pipeline(p);
    PASS("test_pipeline");
}

static void test_background_job(void) {
    TEST("test_background_job");
    JobPipeline *p = parse_pipeline("sleep 100 &");
    assert(p != NULL);
    assert(p->is_background);
    assert(p->first_cmd->argc == 2);
    assert(strcmp(p->first_cmd->argv[0], "sleep") == 0);
    assert(strcmp(p->first_cmd->argv[1], "100") == 0);
    free_pipeline(p);
    PASS("test_background_job");
}

static void test_syntax_errors(void) {
    TEST("test_syntax_errors");
    assert(parse_pipeline("") == NULL);
    assert(parse_pipeline("   \t  \n") == NULL);
    assert(parse_pipeline("| echo hello") == NULL);
    assert(parse_pipeline("echo hello |") == NULL);
    assert(parse_pipeline("cat <") == NULL);
    assert(parse_pipeline("cat >") == NULL);
    assert(parse_pipeline("cat 2>") == NULL);
    assert(parse_pipeline("echo 'unclosed quote") == NULL);
    assert(parse_pipeline("echo \"unclosed quote") == NULL);
    PASS("test_syntax_errors");
}

int main(void) {
    printf("\n=== ForgeShell Parser Unit Tests ===\n");
    test_simple_command();
    test_arguments_and_spaces();
    test_single_quotes();
    test_double_quotes_and_escapes();
    test_redirections();
    test_pipeline();
    test_background_job();
    test_syntax_errors();

    printf("\nSummary: %d / %d tests passed successfully.\n\n", g_tests_passed, g_tests_run);
    return (g_tests_passed == g_tests_run) ? 0 : 1;
}
