#include "common.h"

void forge_log(const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    fprintf(stderr, "forge: ");
    vfprintf(stderr, fmt, args);
    fprintf(stderr, "\n");
    va_end(args);
}

void forge_error(const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    if (isatty(STDERR_FILENO)) {
        fprintf(stderr, "%sforge: error: %s", COLOR_RED, COLOR_RESET);
    } else {
        fprintf(stderr, "forge: error: ");
    }
    vfprintf(stderr, fmt, args);
    fprintf(stderr, "\n");
    va_end(args);
}

void forge_perror(const char *msg) {
    if (isatty(STDERR_FILENO)) {
        fprintf(stderr, "%sforge: %s: %s%s\n", COLOR_RED, msg, strerror(errno), COLOR_RESET);
    } else {
        fprintf(stderr, "forge: %s: %s\n", msg, strerror(errno));
    }
}

void forge_debug(const char *fmt, ...) {
#ifdef DEBUG
    va_list args;
    va_start(args, fmt);
    if (isatty(STDERR_FILENO)) {
        fprintf(stderr, "%s[debug] ", COLOR_DIM);
        vfprintf(stderr, fmt, args);
        fprintf(stderr, "%s\n", COLOR_RESET);
    } else {
        fprintf(stderr, "[debug] ");
        vfprintf(stderr, fmt, args);
        fprintf(stderr, "\n");
    }
    va_end(args);
#else
    (void)fmt;
#endif
}
