#include "signals.h"

volatile sig_atomic_t g_sigchld_flag = 0;

static void handle_sigchld(int sig) {
    (void)sig;
    /* Signal handler performs only async-signal-safe flag setting */
    g_sigchld_flag = 1;
}

void signals_init_shell(void) {
    struct sigaction sa_chld;
    memset(&sa_chld, 0, sizeof(sa_chld));
    sa_chld.sa_handler = handle_sigchld;
    sa_chld.sa_flags = SA_RESTART | SA_NOCLDSTOP;
    sigemptyset(&sa_chld.sa_mask);
    if (sigaction(SIGCHLD, &sa_chld, NULL) < 0) {
        forge_perror("sigaction SIGCHLD");
    }

    /* Ignore interactive job control and terminal signals in the shell */
    signal(SIGINT, SIG_IGN);
    signal(SIGTSTP, SIG_IGN);
    signal(SIGQUIT, SIG_IGN);
    signal(SIGTTIN, SIG_IGN);
    signal(SIGTTOU, SIG_IGN);
}

void signals_reset_child(void) {
    /* Restore standard POSIX signal handlers in child process */
    signal(SIGINT, SIG_DFL);
    signal(SIGTSTP, SIG_DFL);
    signal(SIGQUIT, SIG_DFL);
    signal(SIGTTIN, SIG_DFL);
    signal(SIGTTOU, SIG_DFL);
    signal(SIGCHLD, SIG_DFL);

    /* Unblock all signals */
    sigset_t mask;
    sigemptyset(&mask);
    sigprocmask(SIG_SETMASK, &mask, NULL);
}
