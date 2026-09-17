#ifndef FORGESHELL_BUILTINS_H
#define FORGESHELL_BUILTINS_H

#include "common.h"

/* Returns true if the command name is a ForgeShell builtin */
bool is_builtin(const char *name);

/* Execute a builtin command in-process. Returns exit status (0 for success). */
int execute_builtin(int argc, char **argv);

/* Builtin command handlers */
int builtin_cd(int argc, char **argv);
int builtin_pwd(int argc, char **argv);
int builtin_exit(int argc, char **argv);
int builtin_export(int argc, char **argv);
int builtin_unset(int argc, char **argv);
int builtin_help(int argc, char **argv);

#endif /* FORGESHELL_BUILTINS_H */
