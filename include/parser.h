#ifndef FORGESHELL_PARSER_H
#define FORGESHELL_PARSER_H

#include "common.h"

/* Single command in a pipeline */
typedef struct Command {
    char **argv;           /* NULL-terminated argument vector */
    int argc;
    char *input_file;      /* < file */
    char *output_file;     /* > or >> file */
    bool append_output;    /* true if >>, false if > */
    char *error_file;      /* 2> file */
    struct Command *next;  /* next command in pipeline (connected via |) */
} Command;

/* Complete parsed pipeline representing a job */
typedef struct JobPipeline {
    Command *first_cmd;    /* linked list of commands */
    bool is_background;    /* trailing & */
    char *raw_line;        /* original line text for job reporting */
} JobPipeline;

/* Parse an input line into a JobPipeline. Returns NULL on syntax error or empty input. */
JobPipeline *parse_pipeline(const char *input_line);

/* Free an allocated JobPipeline and all its commands and arguments */
void free_pipeline(JobPipeline *pipeline);

#endif /* FORGESHELL_PARSER_H */
