#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <signal.h>

static volatile sig_atomic_t g_count = 0;

static void sig_handler(int sig) {
    if (sig == SIGINT) {
        printf("[sigtrap] Interrupted with SIGINT! Count: %d\n", ++g_count);
        fflush(stdout);
        if (g_count >= 2) {
            printf("[sigtrap] Exiting after 2 SIGINTs.\n");
            exit(0);
        }
    } else if (sig == SIGTSTP) {
        printf("[sigtrap] Caught SIGTSTP! (Terminal suspend signal)\n");
        fflush(stdout);
    }
}

int main(void) {
    signal(SIGINT, sig_handler);
    signal(SIGTSTP, sig_handler);

    printf("[sigtrap] PID %d listening for SIGINT and SIGTSTP. Send signals or Ctrl+C / Ctrl+Z.\n", (int)getpid());
    fflush(stdout);

    while (1) {
        pause();
    }
    return 0;
}
