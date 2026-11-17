# POSIX Process Lifecycle & Management in Unix

This document explains the core systems programming concepts governing processes in Linux and how ForgeShell implements them.

---

## 1. What is a Process?

In Unix/Linux, a **process** is an executing instance of a program. It encompasses:
- An isolated virtual address space (text, data, BSS, heap, stack).
- Kernel resources: file descriptor table, process credentials (UID/GID), signal dispositions, and scheduling attributes.
- Identifier metrics: **PID** (Process ID) and **PPID** (Parent Process ID).

---

## 2. Process Creation: `fork()`

Linux uses the `fork()` system call to spawn new processes:

```c
pid_t pid = fork();
```

When `fork()` is called:
1. The kernel duplicates the calling process (the parent) to create the child process.
2. Under modern Linux, this duplication uses **Copy-on-Write (CoW)**: physical memory pages are shared read-only between parent and child until one of them writes to a page, triggering a page fault that allocates a private copy.
3. Return values distinguish the processes:
   - In the **parent**: `fork()` returns the PID of the newly created child (> 0).
   - In the **child**: `fork()` returns `0`.
   - On **failure**: `fork()` returns `-1` and sets `errno` (e.g. `EAGAIN` if process limit is reached).

---

## 3. Program Execution: `execvp()`

The `fork()` call creates a duplicate clone, but shells execute different programs via the `exec` family of system calls (ForgeShell uses `execvp`):

```c
int execvp(const char *file, char *const argv[]);
```

- `execvp` searches the directories in the `PATH` environment variable for `file` if it does not contain a slash `/`.
- If found, the kernel replaces the current process image (code, stack, heap, data) with the new executable.
- **The PID does not change**.
- Open file descriptors remain open across `exec` unless the `FD_CLOEXEC` flag is set.
- If `execvp()` succeeds, it **never returns**. If it returns `-1`, an error occurred (e.g. `ENOENT` for command not found [exit code 127], or `EACCES` for permission denied [exit code 126]).

---

## 4. Reaping and Synchronization: `waitpid()`

When a child process terminates, it does not immediately disappear from the system. It enters the **Zombie** state (`Z`).

```c
pid_t waitpid(pid_t pid, int *status, int options);
```

### Why Zombies Happen
The kernel keeps the process table entry and exit status of a terminated child around until its parent calls `wait()` or `waitpid()`. If the parent never reaps the child, it remains a zombie, leaking a PID in the system process table.

### Exit Status Inspection
`waitpid` stores status information in an integer that is decoded using standard POSIX macros:
- `WIFEXITED(status)`: Evaluates to true if the child terminated normally (via `exit()` or `return` from `main`).
  - `WEXITSTATUS(status)`: Extracts the 8-bit exit code (0 to 255).
- `WIFSIGNALED(status)`: Evaluates to true if the child was killed by an uncaught signal.
  - `WTERMSIG(status)`: Extracts the signal number (e.g. `SIGSEGV`, `SIGINT`). Shells report exit code as `128 + WTERMSIG(status)`.
- `WIFSTOPPED(status)`: Evaluates to true if the child process was suspended (e.g. via `SIGTSTP` / Ctrl+Z).
  - `WSTOPSIG(status)`: Extracts the stop signal.

### Non-blocking State Observation
When managing background jobs or periodic maintenance, ForgeShell uses:
```c
waitpid(-1, &status, WNOHANG | WUNTRACED | WCONTINUED);
```
- `WNOHANG`: Returns immediately (0) if no child has changed state, preventing the shell from blocking.
- `WUNTRACED`: Reports children that have stopped (suspended).
- `WCONTINUED`: Reports children that were resumed via `SIGCONT`.
