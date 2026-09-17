# POSIX Job Control & Terminal Management

This document details the mechanics of process groups, terminal ownership, and job control state transitions (`fg`, `bg`, `jobs`) in ForgeShell.

---

## 1. Process Groups and Sessions

In Unix, processes are organized into a hierarchy:
- **Process**: Identified by PID.
- **Process Group**: A collection of related processes (e.g. all commands in a pipeline `cat | grep | wc`), identified by a **PGID** (Process Group ID). Signals sent to a process group (via `kill(-pgid, sig)`) affect all member processes simultaneously.
- **Session**: A collection of process groups tied to a controlling terminal, led by a session leader.

---

## 2. Terminal Control: `tcsetpgrp()`

A controlling terminal has at most **one foreground process group** at any given moment:
- The foreground process group receives terminal input and terminal-generated signals (`Ctrl+C` -> `SIGINT`, `Ctrl+Z` -> `SIGTSTP`).
- All other process groups in the session are in the **background**.
- If a background process tries to read from the controlling terminal, the kernel suspends it with `SIGTTIN`.

ForgeShell manages terminal control using:
```c
tcsetpgrp(int fd, pid_t pgrp);
```

### Protocol for Running a Foreground Command:
1. Shell creates process group for child pipeline: `setpgid(pid, pgid)`.
2. Both child and parent call `setpgid` to prevent race conditions.
3. Hand terminal to child group: `tcsetpgrp(STDIN_FILENO, pgid)`.
4. Parent waits with `waitpid(-pgid, &status, WUNTRACED)`.
5. When child completes or stops, shell reclaims terminal:
   ```c
   tcsetpgrp(STDIN_FILENO, g_shell.shell_pgid);
   tcsetattr(STDIN_FILENO, TCSADRAIN, &g_shell.shell_tmodes);
   ```

---

## 3. Job State Transitions

```
                 command &
   [New Command] ----------> (JOB_RUNNING: Background)
        |                              |
        | foreground                   | fg %id
        v                              v
(JOB_RUNNING: Foreground) <------------+
        |
        | Ctrl+Z (SIGTSTP)
        v
(JOB_STOPPED)
        |
        +--------> bg %id --------> (JOB_RUNNING: Background)
        |
        +--------> fg %id --------> (JOB_RUNNING: Foreground)
```

### Builtin Actions:
- `jobs`: Inspects job table and lists active and suspended jobs with their IDs and state.
- `fg [%id]`: Gives terminal control to the job, sends `SIGCONT` to wake it up if stopped, and blocks until finished or suspended.
- `bg [%id]`: Sends `SIGCONT` to a stopped job, allowing it to continue running asynchronously in the background.
