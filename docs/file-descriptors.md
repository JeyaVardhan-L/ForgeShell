# Unix File Descriptors & I/O Redirection

This document explains file descriptor architecture in the Linux kernel and how ForgeShell implements input/output redirection.

---

## 1. The File Descriptor Table

In Unix, a **file descriptor (FD)** is a small non-negative integer used by process system calls to refer to an open file, socket, pipe, or device.

By convention, every standard process starts with three descriptors:
- `FD 0`: `STDIN_FILENO` (Standard Input, default: terminal keyboard)
- `FD 1`: `STDOUT_FILENO` (Standard Output, default: terminal screen)
- `FD 2`: `STDERR_FILENO` (Standard Error, default: terminal screen)

Inside the Linux kernel, descriptors are indices into a per-process **file descriptor table**. Each entry points to an **Open File Description** in the system-wide open file table, which in turn references the filesystem **vnode/inode**.

---

## 2. Redirection Mechanics: `dup2()`

To redirect standard I/O streams, ForgeShell uses `dup2()`:

```c
int dup2(int oldfd, int newfd);
```

- `dup2()` makes `newfd` be a copy of `oldfd`, closing `newfd` first if it was already open.
- If `oldfd` is a valid open file and `newfd` is `STDOUT_FILENO` (1), any subsequent writes to stdout by the process (or any program it execs) will be directed into `oldfd`.

---

## 3. Implementing Redirections in ForgeShell

### 1. Output Redirection (`command > file`)
Truncates or creates the destination file and maps it to stdout:
```c
int fd = open("file", O_WRONLY | O_CREAT | O_TRUNC, 0644);
dup2(fd, STDOUT_FILENO);
close(fd); /* Close the extra descriptor; FD 1 remains open pointing to file */
```

### 2. Append Redirection (`command >> file`)
Appends output without truncating:
```c
int fd = open("file", O_WRONLY | O_CREAT | O_APPEND, 0644);
dup2(fd, STDOUT_FILENO);
close(fd);
```

### 3. Input Redirection (`command < file`)
Reads standard input from file:
```c
int fd = open("file", O_RDONLY);
dup2(fd, STDIN_FILENO);
close(fd);
```

### 4. Stderr Redirection (`command 2> file`)
Redirects standard error stream:
```c
int fd = open("file", O_WRONLY | O_CREAT | O_TRUNC, 0644);
dup2(fd, STDERR_FILENO);
close(fd);
```

---

## 4. Descriptor Inheritance & Leaks

- File descriptors opened before `fork()` are inherited across `fork()`.
- After `dup2(fd, STDOUT_FILENO)`, the original `fd` must be closed in the child so that only FD 1 refers to the file.
- In parent shell builtins (e.g. `pwd > out.txt`), the shell saves original descriptors with `dup(STDIN_FILENO)`, applies redirection, executes the builtin, and restores the original descriptors with `dup2(saved_fd, STDIN_FILENO)`.
