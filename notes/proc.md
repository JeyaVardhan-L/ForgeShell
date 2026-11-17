# Linux `/proc` Filesystem & Kernel Observability

This document explains the structure and parsing of Linux's virtual `/proc` pseudo-filesystem, which ForgeShell uses for the `inspect`, `monitor`, and `ps` features.

---

## 1. What is `/proc`?

The `/proc` filesystem is a virtual pseudo-filesystem created by the Linux kernel in memory. It contains no real physical disk files; rather, reading from `/proc` queries internal kernel data structures directly.

---

## 2. Key Process Files Inspected by ForgeShell

For any process with ID `<pid>`, ForgeShell inspects:

### 1. `/proc/<pid>/stat`
A single line containing status metrics. Important fields extracted:
- **Field 1 (`pid`)**: Process ID.
- **Field 2 (`comm`)**: Executable filename in parentheses `(comm)`.
- **Field 3 (`state`)**: Process state character (`R` = Running, `S` = Sleeping, `D` = Disk Sleep, `Z` = Zombie, `T` = Stopped).
- **Field 4 (`ppid`)**: Parent Process ID.
- **Field 5 (`pgrp`)**: Process group ID.
- **Field 6 (`session`)**: Session ID.
- **Field 14 (`utime`)**: Number of clock ticks this process has scheduled in user mode.
- **Field 15 (`stime`)**: Number of clock ticks scheduled in kernel mode.
- **Field 20 (`num_threads`)**: Number of threads in this process.
- **Field 22 (`starttime`)**: Time the process started after system boot in clock ticks.

### 2. `/proc/<pid>/status`
A human-readable text file with key-value pairs:
- `VmSize`: Virtual memory size of the process (in kB).
- `VmRSS`: Resident Set Size — physical RAM currently mapped by the process (in kB).
- `VmData`: Size of the data segment (heap).
- `VmStk`: Size of the stack segment.
- `VmExe`: Size of the text segment (binary code).
- `Threads`: Thread count.

### 3. `/proc/<pid>/cmdline`
The complete command-line invocation arguments separated by NUL (`\0`) bytes.

### 4. `/proc/<pid>/exe`
A symbolic link pointing directly to the real path of the executable binary on disk, resolved via `readlink()`.

### 5. `/proc/<pid>/cwd`
A symbolic link pointing to the process's current working directory.

### 6. `/proc/<pid>/fd/`
A directory containing symlinks for every open file descriptor held by the process. Counting the entries reveals the exact number of open descriptors.

---

## 3. Metric Calculations

### Calculating Real CPU Usage %
CPU usage cannot be measured from an instantaneous snapshot; it requires computing the change over time:

$$\text{CPU \%} = \frac{(\Delta\text{utime} + \Delta\text{stime}) / \text{CLK\_TCK}}{\Delta\text{wall\_time\_seconds}} \times 100$$

Where $\text{CLK\_TCK}$ is retrieved via POSIX `sysconf(_SC_CLK_TCK)` (typically 100 ticks per second on x86_64 Linux).

### Process Wall Runtime
$$\text{Runtime} = \text{System Uptime} - \left(\frac{\text{starttime}}{\text{CLK\_TCK}}\right)$$
Where System Uptime is parsed from `/proc/uptime`.
