#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
    int mb = (argc > 1) ? atoi(argv[1]) : 20;
    int hold_sec = (argc > 2) ? atoi(argv[2]) : 5;

    printf("[leak] Started PID %d: allocating %d MB and holding for %ds...\n",
           (int)getpid(), mb, hold_sec);
    fflush(stdout);

    size_t bytes = (size_t)mb * 1024 * 1024;
    /* volatile: the writes below are never read back, so without it an
     * optimizing compiler (-O2) is allowed to delete the malloc, the writes
     * and the free entirely, and the process would never grow. */
    volatile char *buf = malloc(bytes);
    if (!buf) {
        perror("malloc");
        return 1;
    }

    /* Touch every page so the kernel actually backs it with RAM (VmRSS) */
    for (size_t i = 0; i < bytes; i += 4096) {
        buf[i] = 0x42;
    }

    printf("[leak] Memory touched. Check VmRSS in /proc/%d/status now!\n", (int)getpid());
    fflush(stdout);

    sleep(hold_sec);

    free((void *)buf);
    printf("[leak] PID %d done.\n", (int)getpid());
    return 0;
}
