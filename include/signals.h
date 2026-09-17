#ifndef FORGESHELL_SIGNALS_H
#define FORGESHELL_SIGNALS_H

#include "common.h"
#include <signal.h>

extern volatile sig_atomic_t g_sigchld_flag;

/* Set up signal disposition for the interactive shell process */
void signals_init_shell(void);

/* Reset signal dispositions to default in child process prior to exec */
void signals_reset_child(void);

#endif /* FORGESHELL_SIGNALS_H */
