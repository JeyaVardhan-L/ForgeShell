#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <signal.h>
#include <stdbool.h>

static volatile sig_atomic_t g_running = 1;

static void sig_handler(int sig) {
    if (sig == SIGINT) {
        printf("\n[spin] Received SIGINT (PID %d), exiting gracefully.\n", (int)getpid());
        g_running = 0;
    } else if (sig == SIGTERM) {
        printf("\n[spin] Received SIGTERM (PID %d), exiting.\n", (int)getpid());
        g_running = 0;
    }
}

int main(int argc, char **argv) {
    signal(SIGINT, sig_handler);
    signal(SIGTERM, sig_handler);

    int seconds = (argc > 1) ? atoi(argv[1]) : 10;
    bool burn_cpu = (argc > 2 && atoi(argv[2]) == 1);

    printf("[spin] Started PID %d (duration: %ds, mode: %s)\n",
           (int)getpid(), seconds, burn_cpu ? "burn CPU" : "sleep");
    fflush(stdout);

    for (int i = 0; i < seconds && g_running; i++) {
        if (burn_cpu) {
            /* Burn CPU for ~1 second */
            for (volatile unsigned long j = 0; j < 250000000UL && g_running; j++) {
                /* busy loop */
            }
        } else {
            sleep(1);
        }
    }

    printf("[spin] PID %d finished.\n", (int)getpid());
    return 0;
}
