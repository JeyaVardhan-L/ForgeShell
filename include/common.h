#ifndef FORGESHELL_COMMON_H
#define FORGESHELL_COMMON_H

#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#endif

#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <stdbool.h>
#include <errno.h>
#include <sys/types.h>

#define FORGE_VERSION "0.1.0"
#define FORGE_DEFAULT_PROMPT "forge> "
#define FORGE_MAX_INPUT 8192

/* ANSI Terminal Colors (used when stdout/stderr isatty) */
#define COLOR_RESET   "\033[0m"
#define COLOR_BOLD    "\033[1m"
#define COLOR_DIM     "\033[2m"
#define COLOR_RED     "\033[31m"
#define COLOR_GREEN   "\033[32m"
#define COLOR_YELLOW  "\033[33m"
#define COLOR_BLUE    "\033[34m"
#define COLOR_CYAN    "\033[36m"

/* Diagnostic and error helpers */
void forge_log(const char *fmt, ...);
void forge_error(const char *fmt, ...);
void forge_perror(const char *msg);
void forge_debug(const char *fmt, ...);


#include <stdarg.h>

/* Safe memory management helpers */
static inline void *xmalloc(size_t size) {
    void *ptr = malloc(size);
    if (!ptr && size > 0) {
        forge_error("out of memory (malloc failed for %zu bytes)", size);
        exit(EXIT_FAILURE);
    }
    return ptr;
}

static inline void *xrealloc(void *ptr, size_t size) {
    void *new_ptr = realloc(ptr, size);
    if (!new_ptr && size > 0) {
        forge_error("out of memory (realloc failed for %zu bytes)", size);
        exit(EXIT_FAILURE);
    }
    return new_ptr;
}

static inline char *xstrdup(const char *s) {
    if (!s) return NULL;
    char *dup = strdup(s);
    if (!dup) {
        forge_error("out of memory (strdup failed)");
        exit(EXIT_FAILURE);
    }
    return dup;
}

static inline void safe_free(void **ptr) {
    if (ptr && *ptr) {
        free(*ptr);
        *ptr = NULL;
    }
}

#endif /* FORGESHELL_COMMON_H */
