# ForgeShell 🛡️

[![CI](https://github.com/JeyaVardhan-L/ForgeShell/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JeyaVardhan-L/ForgeShell/actions/workflows/ci.yml)
![Language: C11](https://img.shields.io/badge/language-C11-blue)
![Platform: Linux](https://img.shields.io/badge/platform-Linux-lightgrey)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**A resource-aware Unix shell built from scratch in C.** It runs pipelines, redirections and background/foreground jobs using raw POSIX system calls, and adds built-in commands that read live process data straight from the Linux kernel's `/proc` filesystem.

- **Shell core:** `fork`/`execvp`/`waitpid`, multi-stage pipes, `<` `>` `>>` `2>` redirection, quoting.
- **Job control:** process groups, terminal hand-off (`tcsetpgrp`), `Ctrl+Z`, `&`, `jobs`, `fg`, `bg`.
- **Observability:** `inspect <pid>`, `monitor <pid>` and `ps`, reporting memory, CPU, threads and open files, with the `/proc` source of every number.
- **Tested:** 24 integration and unit test suites, run in CI under gcc and clang, including AddressSanitizer and UBSan builds.

ForgeShell isn't a Bash clone. It's a small, readable implementation that shows how Linux actually runs processes, shares the terminal, delivers signals and accounts for resources.

## ⚡ Try it in 60 seconds

```bash
git clone https://github.com/JeyaVardhan-L/ForgeShell.git
cd ForgeShell
make            # builds bin/forge plus the demo workloads
./bin/forge
```

Then, inside ForgeShell:

```text
forge> printf "cherry\napple\nbanana\n" | sort | head -n 2
forge> ./bin/leak 200 60 &          # allocates 200 MB and holds it for 60s, prints [1] <PID>
forge> jobs
forge> monitor <PID>                # live CPU % and resident memory; Ctrl+C to stop
forge> inspect <PID>                # full /proc report for the process
forge> ./bin/spin 30 1              # burns CPU for 30s: press Ctrl+Z, then try `jobs`, `bg`, `fg`
forge> exit
```

Requirements: Linux, GCC or Clang, GNU Make, and Python 3 (for the tests only).

---

## 🏛️ Architecture Overview

```
                      +-----------------------------+
                      |      Interactive REPL       |
                      |   (Prompt, Input Reading)   |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |      Tokenizer / Lexer      |
                      |  (Quotes, Escapes, Tokens)  |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |      Pipeline AST Parser    |
                      | (Commands, Redir, Pipelines)|
                      +--------------+--------------+
                                     |
              +----------------------+----------------------+
              |                                             |
   [Single Builtin Command]                       [Pipeline or External]
              |                                             |
              v                                             v
+-----------------------------+               +-----------------------------+
|    Builtin Dispatcher       |               |    Pipeline Fork & Exec     |
| (cd, pwd, export, unset,    |               |  - Pipe creation (pipe)     |
|  jobs, fg, bg, help, exit)  |               |  - Group mgmt (setpgid)     |
+-----------------------------+               |  - FD wireup (dup2)         |
                                              |  - Terminal handoff         |
                                              |    (tcsetpgrp)              |
                                              +--------------+--------------+
                                                             |
                                                             v
+-----------------------------+               +-----------------------------+
|   Linux /proc Observability | <============ |      POSIX Job Control      |
|  - inspect <pid>            |   Inspect /   |  - Job table & process tracking
|  - monitor <pid> [sec]      |   Monitor     |  - Async signal handling    |
|  - ps overview              |   State       |  - WNOHANG reaping          |
+-----------------------------+               +-----------------------------+
```

---

## ✨ Features

- **Process Lifecycle Management**: Direct `fork()`, `execvp()`, and `waitpid()` execution with accurate exit status extraction (`WIFEXITED`, `WEXITSTATUS`, `WIFSIGNALED`, `WTERMSIG`) and zombie prevention.
- **Robust Multi-Character Parser**: Full support for single quotes `'...'` (raw literal), double quotes `"..."` (preserving whitespace and escaped quotes `\"`), and whitespace normalization without relying on naive `strtok()` hacks.
- **File Descriptor Redirections**: Input (`<`), output truncation (`>`), output append (`>>`), and standard error redirection (`2>`) via `open()`, `close()`, and `dup2()`.
- **Multi-Stage Unix Pipelines**: Arbitrary command piping (`cmd1 | cmd2 | ... | cmdN`) with non-blocking kernel buffers, safe descriptor closure, and EOF propagation.
- **True POSIX Job Control**:
  - Process group creation (`setpgid()`) in both child and parent to avoid race conditions.
  - Controlling terminal arbitration (`tcsetpgrp()`) and terminal attribute preservation (`tcgetattr()` / `tcsetattr()`).
  - Interactive signals (`SIGINT`, `SIGTSTP`, `SIGQUIT`, `SIGTTIN`, `SIGTTOU`) safely ignored in the shell and restored to `SIG_DFL` in child process groups.
  - Job management commands: `jobs`, `fg [%id]`, `bg [%id]`, and background execution operator (`&`).
  - Asynchronous, signal-safe child state tracking via `SIGCHLD` and non-blocking `waitpid(WNOHANG)`.
- **Linux `/proc` Observability & Diagnostics**:
  - `inspect <pid>`: In-depth diagnostic report showing process identity, parentage, thread count, open file descriptors, memory footprint (VmSize, VmRSS, VmData, VmStk, VmExe), and CPU ticks, with exact Linux `/proc` source citations.
  - `monitor <pid> [interval]`: Real-time text-based monitoring loop displaying calculated CPU usage percentage, resident memory (VmRSS), and runtime, safely interruptible with `Ctrl+C`.
  - `ps`: Custom process status overview scanning the `/proc` tree directly.
- **Builtin Commands**: `cd` (with `$HOME`, `~`, and `-` support), `pwd`, `export`, `unset`, `jobs`, `fg`, `bg`, `inspect`, `monitor`, `ps`, `help`, and `exit`.

---

## 🛠️ Build and Installation

### Requirements
- Linux kernel 3.x or later (for `/proc` interfaces)
- GCC or Clang with C11 support
- GNU Make
- Python 3 (for automated test suite runner)

### Compilation Commands

```bash
# Clone the repository
git clone https://github.com/JeyaVardhan-L/ForgeShell.git
cd ForgeShell

# Build release binary (optimized -O2, strict warnings)
make

# Build debug binary with symbols and DEBUG macro
make debug

# Build with AddressSanitizer and UndefinedBehaviorSanitizer
make asan

# Run automated test suite
make test

# Clean all build outputs
make clean
```

The compiled shell binary is located at `bin/forge`.

---

## 🚀 Quickstart & Example Session

Launch ForgeShell:
```bash
./bin/forge
```

```
forge> pwd
/home/developer/ForgeShell

forge> echo "hello world" > greeting.txt
forge> cat < greeting.txt
hello world

forge> printf "cherry\napple\nbanana\n" | sort | head -n 2
apple
banana

forge> export SHELL_MODE=ResourceAware
forge> /bin/sh -c 'echo Subprocess environment: $SHELL_MODE'
Subprocess environment: ResourceAware

forge> sleep 20 &
[1] 15420

forge> jobs
[1]+ Running    sleep 20 &

forge> inspect 15420

Process Inspection Report for PID 15420
------------------------------------------------------------
[General Identity]
  Command Name:       sleep                 (Source: /proc/15420/stat [comm])
  Process ID (PID):   15420                 (Source: /proc/15420/stat [pid])
  Parent PID (PPID):  15300                 (Source: /proc/15420/stat [ppid])
  Process Group PGID: 15420                 (Source: /proc/15420/stat [pgrp])
  Process State:      Sleeping in interruptible wait (S)  (Source: /proc/15420/status [State])
  Thread Count:       1                     (Source: /proc/15420/status [Threads])
  Open File Descr.:   3                     (Source: /proc/15420/fd/ directory count)

[Memory Footprint]
  Virtual Size (VmSize):     8420 kB (  8.22 MB) (Source: /proc/15420/status [VmSize])
  Resident Set (VmRSS):      2140 kB (  2.09 MB) (Source: /proc/15420/status [VmRSS])

[Paths & Invocation]
  Executable Binary:  /usr/bin/sleep  (Source: readlink /proc/15420/exe)
  Command Line:       sleep 20  (Source: /proc/15420/cmdline)
------------------------------------------------------------

forge> fg 1
sleep 20
# (Press Ctrl+Z)
[1]+ Stopped    sleep 20

forge> bg 1
[1]+ sleep 20 &

forge> exit
```

---

## 🧪 Testing

ForgeShell includes both C unit tests and an automated Python integration test harness:

```bash
make test
```

### Test Coverage (24 Test Suites)
1. **Process Execution**: Normal exit codes, non-zero exits, command not found (127), permission denied (126), child crashes (`SIGSEGV` core dumps / code 139), zombie child reaping.
2. **Parser & Quoting**: C unit tests (`tests/test_parser.c`), literal single quotes, double quote whitespace preservation, escapes, syntax error detection.
3. **Redirections**: Stdout (`>`), stdin (`<`), append (`>>`), stderr (`2>`), descriptor isolation.
4. **Pipelines**: Single pipe, 3-stage pipe, high-volume dataflow (30,000+ lines without pipe deadlock), file descriptor leak verification via `/proc/self/fd`.
5. **Builtins**: `cd`, `pwd`, `export`, `unset`, `help`, `exit`.
6. **Job Control**: Background job launching (`&`), job table reporting (`jobs`), foreground terminal transfer (`fg`), background continuation (`bg`).
7. **`/proc` Observability**: Live inspection of running processes (`inspect`), nonexistent PID handling, `/proc` directory scanning (`ps`), process termination detection (`monitor`).

---

## 📚 Systems Programming Concepts

ForgeShell was constructed deliberately to demonstrate key POSIX and Linux systems concepts:

| Concept | Systems Call / Interface | How ForgeShell Uses It |
|---|---|---|
| **Process Creation** | `fork()` | Creates child copy with Copy-on-Write semantics |
| **Program Execution** | `execvp()` | Replaces address space with target binary using PATH lookup |
| **Child Synchronization** | `waitpid()` | Reaps children, extracts exit codes, tracks stopped/resumed jobs |
| **Stream Redirection** | `dup2()`, `open()`, `close()` | Duplicates FDs over STDIN (0), STDOUT (1), STDERR (2) |
| **Pipes & IPC** | `pipe()` | Unidirectional byte streams; enforces write-end closure for EOF |
| **Terminal Signals** | `signal()`, `sigaction()` | Ignores `SIGINT`/`SIGTSTP` in shell; resets `SIG_DFL` in children |
| **Terminal Control** | `tcsetpgrp()`, `setpgid()` | Hands foreground terminal control to child process group |
| **Kernel Introspection** | `/proc/<pid>/{stat,status,cmdline,fd}` | Reads virtual kernel stats directly without synthetic heuristics |

Comprehensive documentation for each topic is available in the [`docs/`](docs/) directory:
- [Processes & Lifecycle (`docs/processes.md`)](docs/processes.md)
- [File Descriptors & Redirection (`docs/file-descriptors.md`)](docs/file-descriptors.md)
- [Pipes & Inter-Process Communication (`docs/pipes.md`)](docs/pipes.md)
- [Signals & Async Safety (`docs/signals.md`)](docs/signals.md)
- [POSIX Job Control (`docs/job-control.md`)](docs/job-control.md)
- [Linux `/proc` Observability (`docs/proc.md`)](docs/proc.md)
- [Full Step-by-Step Walkthrough (`docs/walkthrough.md`)](docs/walkthrough.md)

---

## ⚖️ Design Decisions & Tradeoffs

1. **Direct System Calls vs High-Level Libraries**: ForgeShell relies strictly on standard POSIX system calls (`fork`, `execvp`, `dup2`, `pipe`, `tcsetpgrp`) rather than wrapper libraries to keep low-level systems mechanics explicit and educational.
2. **Signal-Safe Reaping**: Child reaping is performed synchronously in the main loop and job management routines rather than executing non-reentrant I/O calls inside asynchronous signal handlers.
3. **Double `setpgid()`**: Both the parent shell and the child process invoke `setpgid(pid, pgid)` immediately after `fork()`. This prevents a classical race condition where the parent might attempt to call `tcsetpgrp()` before the child has successfully created or joined the process group.
4. **Clean Lexer/Parser Separation**: Tokens are scanned into a clean linked list before AST construction, properly separating lexical analysis from pipeline execution without relying on `strtok()`.

---

## ⚠️ Limitations

- **No Shell Scripting Control Flow**: Does not support Bash syntax such as `if`, `for`, `while`, or function declarations.
- **No Wildcard / Globbing**: Does not expand `*.c` (can be passed directly to programs like `ls` or `grep` which handle their own arguments).
- **No Variable Expansion**: `$VAR` is not expanded inline inside unquoted commands (child processes inherit exported variables via standard `environ`).
- **No Here-Documents (`<<`)**: Standard file redirection (`<`) is supported, but in-memory heredocs are omitted.

---

## 🔮 Future Work

- [ ] Command history and interactive line editing using terminal raw mode.
- [ ] Filename globbing (`glob()` integration).
- [ ] Variable expansion syntax (`$VAR`, `$?`, `$$`).
- [ ] Compound commands (`&&`, `||`, `;`).
- [ ] Network socket redirection (`/dev/tcp/host/port`).

---

## 📜 License

ForgeShell is open-source software licensed under the [MIT License](LICENSE).
