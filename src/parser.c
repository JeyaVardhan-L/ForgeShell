#include "parser.h"
#include <ctype.h>

typedef enum {
    TOKEN_WORD,
    TOKEN_PIPE,           /* | */
    TOKEN_IN_REDIR,       /* < */
    TOKEN_OUT_REDIR,      /* > */
    TOKEN_APPEND_REDIR,   /* >> */
    TOKEN_ERR_REDIR,      /* 2> */
    TOKEN_BACKGROUND,     /* & */
    TOKEN_EOF
} TokenType;

typedef struct {
    TokenType type;
    char *text;
} Token;

typedef struct {
    Token *tokens;
    size_t count;
    size_t capacity;
} TokenList;

static void token_list_init(TokenList *list) {
    list->capacity = 16;
    list->count = 0;
    list->tokens = xmalloc(list->capacity * sizeof(Token));
}

static void token_list_add(TokenList *list, TokenType type, const char *text) {
    if (list->count >= list->capacity) {
        list->capacity *= 2;
        list->tokens = xrealloc(list->tokens, list->capacity * sizeof(Token));
    }
    list->tokens[list->count].type = type;
    list->tokens[list->count].text = text ? xstrdup(text) : NULL;
    list->count++;
}

static void token_list_free(TokenList *list) {
    if (!list || !list->tokens) return;
    for (size_t i = 0; i < list->count; i++) {
        if (list->tokens[i].text) {
            free(list->tokens[i].text);
        }
    }
    free(list->tokens);
    list->tokens = NULL;
    list->count = 0;
    list->capacity = 0;
}

/* Lexical scanner: convert raw line into token list */
static bool tokenize(const char *input, TokenList *list) {
    token_list_init(list);
    const char *p = input;

    while (*p) {
        /* Skip whitespace */
        if (isspace((unsigned char)*p)) {
            p++;
            continue;
        }

        /* Check for operators */
        if (*p == '|') {
            token_list_add(list, TOKEN_PIPE, "|");
            p++;
            continue;
        }

        if (*p == '&') {
            token_list_add(list, TOKEN_BACKGROUND, "&");
            p++;
            continue;
        }

        if (*p == '<') {
            token_list_add(list, TOKEN_IN_REDIR, "<");
            p++;
            continue;
        }

        if (*p == '>') {
            if (*(p + 1) == '>') {
                token_list_add(list, TOKEN_APPEND_REDIR, ">>");
                p += 2;
            } else {
                token_list_add(list, TOKEN_OUT_REDIR, ">");
                p++;
            }
            continue;
        }

        if (*p == '2' && *(p + 1) == '>') {
            token_list_add(list, TOKEN_ERR_REDIR, "2>");
            p += 2;
            continue;
        }

        /* Parse word (including quotes and escapes) */
        size_t buf_cap = 64;
        size_t buf_len = 0;
        char *buf = xmalloc(buf_cap);

        bool in_word = true;
        while (in_word && *p) {
            if (*p == '\'') {
                /* Single quotes: preserve everything literally until closing quote */
                p++;
                while (*p && *p != '\'') {
                    if (buf_len + 1 >= buf_cap) {
                        buf_cap *= 2;
                        buf = xrealloc(buf, buf_cap);
                    }
                    buf[buf_len++] = *p++;
                }
                if (*p != '\'') {
                    forge_error("syntax error: unclosed single quote");
                    free(buf);
                    token_list_free(list);
                    return false;
                }
                p++; /* consume closing single quote */
            } else if (*p == '"') {
                /* Double quotes: preserve spaces, handle basic escapes */
                p++;
                while (*p && *p != '"') {
                    if (*p == '\\' && (*(p + 1) == '"' || *(p + 1) == '\\')) {
                        p++;
                    }
                    if (buf_len + 1 >= buf_cap) {
                        buf_cap *= 2;
                        buf = xrealloc(buf, buf_cap);
                    }
                    buf[buf_len++] = *p++;
                }
                if (*p != '"') {
                    forge_error("syntax error: unclosed double quote");
                    free(buf);
                    token_list_free(list);
                    return false;
                }
                p++; /* consume closing double quote */
            } else if (*p == '\\' && *(p + 1) != '\0') {
                /* Escape next character */
                p++;
                if (buf_len + 1 >= buf_cap) {
                    buf_cap *= 2;
                    buf = xrealloc(buf, buf_cap);
                }
                buf[buf_len++] = *p++;
            } else if (isspace((unsigned char)*p) || *p == '|' || *p == '&' || *p == '<' || *p == '>' ||
                       (*p == '2' && *(p + 1) == '>')) {
                /* End of unquoted word */
                in_word = false;
            } else {
                if (buf_len + 1 >= buf_cap) {
                    buf_cap *= 2;
                    buf = xrealloc(buf, buf_cap);
                }
                buf[buf_len++] = *p++;
            }
        }

        buf[buf_len] = '\0';
        token_list_add(list, TOKEN_WORD, buf);
        free(buf);
    }

    token_list_add(list, TOKEN_EOF, NULL);
    return true;
}

static Command *create_command(void) {
    Command *cmd = xmalloc(sizeof(Command));
    cmd->argc = 0;
    cmd->argv = xmalloc(8 * sizeof(char *));
    cmd->argv[0] = NULL;
    cmd->input_file = NULL;
    cmd->output_file = NULL;
    cmd->append_output = false;
    cmd->error_file = NULL;
    cmd->next = NULL;
    return cmd;
}

static void command_add_arg(Command *cmd, const char *arg) {
    cmd->argv = xrealloc(cmd->argv, (cmd->argc + 2) * sizeof(char *));
    cmd->argv[cmd->argc] = xstrdup(arg);
    cmd->argc++;
    cmd->argv[cmd->argc] = NULL;
}

static void free_command(Command *cmd) {
    if (!cmd) return;
    if (cmd->argv) {
        for (int i = 0; i < cmd->argc; i++) {
            if (cmd->argv[i]) free(cmd->argv[i]);
        }
        free(cmd->argv);
    }
    if (cmd->input_file) free(cmd->input_file);
    if (cmd->output_file) free(cmd->output_file);
    if (cmd->error_file) free(cmd->error_file);
    free(cmd);
}

void free_pipeline(JobPipeline *pipeline) {
    if (!pipeline) return;
    Command *curr = pipeline->first_cmd;
    while (curr) {
        Command *next = curr->next;
        free_command(curr);
        curr = next;
    }
    if (pipeline->raw_line) {
        free(pipeline->raw_line);
    }
    free(pipeline);
}

JobPipeline *parse_pipeline(const char *input_line) {
    if (!input_line) return NULL;

    TokenList list;
    if (!tokenize(input_line, &list)) {
        return NULL;
    }

    if (list.count <= 1 || list.tokens[0].type == TOKEN_EOF) {
        token_list_free(&list);
        return NULL;
    }

    JobPipeline *pipeline = xmalloc(sizeof(JobPipeline));
    pipeline->first_cmd = NULL;
    pipeline->is_background = false;
    pipeline->raw_line = xstrdup(input_line);

    /* Strip trailing newline from raw_line for clean jobs output */
    size_t raw_len = strlen(pipeline->raw_line);
    if (raw_len > 0 && pipeline->raw_line[raw_len - 1] == '\n') {
        pipeline->raw_line[raw_len - 1] = '\0';
    }

    Command *current_cmd = create_command();
    pipeline->first_cmd = current_cmd;

    size_t i = 0;
    while (i < list.count && list.tokens[i].type != TOKEN_EOF) {
        TokenType type = list.tokens[i].type;

        if (type == TOKEN_WORD) {
            command_add_arg(current_cmd, list.tokens[i].text);
            i++;
        } else if (type == TOKEN_IN_REDIR) {
            i++;
            if (i >= list.count || list.tokens[i].type != TOKEN_WORD) {
                forge_error("syntax error near unexpected token '<'");
                free_pipeline(pipeline);
                token_list_free(&list);
                return NULL;
            }
            if (current_cmd->input_file) free(current_cmd->input_file);
            current_cmd->input_file = xstrdup(list.tokens[i].text);
            i++;
        } else if (type == TOKEN_OUT_REDIR || type == TOKEN_APPEND_REDIR) {
            bool append = (type == TOKEN_APPEND_REDIR);
            i++;
            if (i >= list.count || list.tokens[i].type != TOKEN_WORD) {
                forge_error("syntax error near unexpected token '>'");
                free_pipeline(pipeline);
                token_list_free(&list);
                return NULL;
            }
            if (current_cmd->output_file) free(current_cmd->output_file);
            current_cmd->output_file = xstrdup(list.tokens[i].text);
            current_cmd->append_output = append;
            i++;
        } else if (type == TOKEN_ERR_REDIR) {
            i++;
            if (i >= list.count || list.tokens[i].type != TOKEN_WORD) {
                forge_error("syntax error near unexpected token '2>'");
                free_pipeline(pipeline);
                token_list_free(&list);
                return NULL;
            }
            if (current_cmd->error_file) free(current_cmd->error_file);
            current_cmd->error_file = xstrdup(list.tokens[i].text);
            i++;
        } else if (type == TOKEN_PIPE) {
            if (current_cmd->argc == 0) {
                forge_error("syntax error near unexpected token '|'");
                free_pipeline(pipeline);
                token_list_free(&list);
                return NULL;
            }
            i++;
            if (i >= list.count || list.tokens[i].type == TOKEN_EOF || list.tokens[i].type == TOKEN_PIPE) {
                forge_error("syntax error near unexpected token '|'");
                free_pipeline(pipeline);
                token_list_free(&list);
                return NULL;
            }
            Command *next_cmd = create_command();
            current_cmd->next = next_cmd;
            current_cmd = next_cmd;
        } else if (type == TOKEN_BACKGROUND) {
            i++;
            /* & must be the last meaningful token */
            if (i < list.count && list.tokens[i].type != TOKEN_EOF) {
                forge_error("syntax error: '&' must be at end of command");
                free_pipeline(pipeline);
                token_list_free(&list);
                return NULL;
            }
            pipeline->is_background = true;
            break;
        }
    }

    token_list_free(&list);

    if (!pipeline->first_cmd || pipeline->first_cmd->argc == 0) {
        free_pipeline(pipeline);
        return NULL;
    }

    /* Every later stage needs a command too: "ls | > out.txt" has none after
     * the pipe, and running it would mean execvp(NULL). */
    for (Command *c = pipeline->first_cmd->next; c; c = c->next) {
        if (c->argc == 0) {
            forge_error("syntax error: missing command after '|'");
            free_pipeline(pipeline);
            return NULL;
        }
    }

    return pipeline;
}
