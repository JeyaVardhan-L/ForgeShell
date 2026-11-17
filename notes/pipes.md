# Unix Pipelines and Inter-Process Communication (IPC)

This document details the mechanics of Unix pipes, buffer management, write-end closure, and EOF semantics in ForgeShell.

---

## 1. What is a Pipe?

A **pipe** is a unidirectional byte stream provided by the Unix kernel for inter-process communication:

```c
int pipefds[2];
pipe(pipefds);
```

- `pipefds[0]`: Read end of the pipe.
- `pipefds[1]`: Write end of the pipe.
- Data written to `pipefds[1]` is buffered by the kernel (typically 64 KB on modern Linux) until read from `pipefds[0]`.

---

## 2. Pipeline Wiring: `cmd1 | cmd2 | cmd3`

To connect processes into a pipeline, ForgeShell executes the following sequence:

```
[cmd1 stdout]  ===> (write end pipe 1) ===> [Kernel Buffer] ===> (read end pipe 1) ===> [cmd2 stdin]
[cmd2 stdout]  ===> (write end pipe 2) ===> [Kernel Buffer] ===> (read end pipe 2) ===> [cmd3 stdin]
```

### Steps for each command $i$:
1. If $i < N - 1$, allocate a new pipe `pipe(pipefds)`.
2. `fork()` child process $i$:
   - **Child**:
     - If $i > 0$: connect standard input to `prev_pipe_read` using `dup2(prev_pipe_read, STDIN_FILENO)` and close `prev_pipe_read`.
     - If $i < N - 1$: close `pipefds[0]` (child never reads from its own output pipe), connect stdout to `pipefds[1]` using `dup2(pipefds[1], STDOUT_FILENO)` and close `pipefds[1]`.
     - Execute the command (`execvp`).
   - **Parent**:
     - If $i > 0$: close `prev_pipe_read` (the parent does not read from previous pipe).
     - If $i < N - 1$: close `pipefds[1]` (the parent does not write to the pipe; **CRITICAL** for EOF detection).
     - Save `pipefds[0]` as `prev_pipe_read` for the next child.

---

## 3. The Critical Importance of Closing Unused Write Ends

A process reading from a pipe only receives **EOF** (0 bytes returned by `read()`) when **every file descriptor referencing the write end of the pipe has been closed across the entire system**.

If the parent shell forgets to close `pipefds[1]`:
- The child reader (`cmd2`) will wait indefinitely for more input because the parent shell still holds an open write descriptor to the pipe.
- The pipeline hangs in an unrecoverable deadlock!

Closing unused pipe descriptors in both the child and the parent immediately after `fork()` ensures that once `cmd1` terminates, all write ends are closed, delivering EOF to `cmd2`.
