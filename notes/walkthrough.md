# ForgeShell Developer Walkthrough

This copy-paste friendly walkthrough guides you through cloning, building, testing, using, and debugging ForgeShell.

---

## 1. Prerequisites & Toolchain Verification

ForgeShell requires a standard Linux development environment with GCC and Make:

```bash
# Verify C compiler and Make
gcc --version
make --version

# On Ubuntu/Debian, install build-essential and gdb if needed:
sudo apt-get update && sudo apt-get install -y build-essential gdb python3
```

---

## 2. Clone and Build

```bash
# Clone the repository
git clone https://github.com/JeyaVardhan-L/ForgeShell.git
cd ForgeShell

# Clean build
make clean
make

# Binaries produced in bin/:
#   bin/forge        - Interactive ForgeShell binary
#   bin/test_parser  - C unit test for tokenizer and AST
#   bin/spin         - Workload generator for CPU/job control tests
#   bin/leak         - Workload generator for VmRSS memory tests
#   bin/sigtrap      - Workload generator for signal routing tests
```

---

## 3. Running ForgeShell

Launch the interactive shell:

```bash
./bin/forge
```

You will be greeted with the interactive prompt:
```
forge> 
```

---

## 4. Hands-on Feature Walkthrough

Execute the following commands inside ForgeShell to explore each subsystem:

### A. External Command Execution & PATH Resolution
```bash
forge> whoami
forge> uname -a
forge> ls -la
```

### B. Shell Builtins (`cd`, `pwd`, `export`, `unset`)
```bash
# Print working directory
forge> pwd

# Change directory
forge> cd /tmp
forge> pwd

# Jump back to previous directory using '-'
forge> cd -
forge> pwd

# Environment variable export and inheritance
forge> export DEMO_VAR=SystemsProgramming
forge> /bin/sh -c 'echo Subprocess received: $DEMO_VAR'
forge> unset DEMO_VAR
forge> /bin/sh -c 'echo After unset: $DEMO_VAR'
```

### C. File Descriptor Redirection (`<`, `>`, `>>`, `2>`)
```bash
# Stdout redirection (truncate)
forge> echo "ForgeShell systems project" > test_out.txt

# Stdin redirection
forge> cat < test_out.txt

# Append redirection
forge> echo "Second line appended" >> test_out.txt
forge> cat test_out.txt

# Stderr redirection
forge> ls non_existent_file_path 2> test_err.txt
forge> cat test_err.txt

# Cleanup
forge> rm test_out.txt test_err.txt
```

### D. Multi-Stage Pipelines (`|`)
```bash
# Two-stage pipeline
forge> ps aux | grep root

# Three-stage pipeline with sorting and truncation
forge> printf "banana\napple\ncherry\ndate\n" | sort | head -n 3

# High-volume streaming without buffer deadlock
forge> yes "hello pipeline" | head -n 50000 | wc -l
```

### E. Job Control (`&`, `jobs`, `fg`, `bg`, `Ctrl+C`, `Ctrl+Z`)
```bash
# 1. Start a background job using '&'
forge> ./bin/spin 30 0 &
[1] 14502

# 2. View running background jobs
forge> jobs

# 3. Bring job to the foreground
forge> fg 1

# 4. While in foreground, press Ctrl+Z to suspend the job:
# Output: [1]+ Stopped ./bin/spin 30 0

# 5. Check job status:
forge> jobs

# 6. Resume job in background using 'bg':
forge> bg 1
# Output: [1]+ ./bin/spin 30 0 &

# 7. Bring it back to foreground and interrupt with Ctrl+C:
forge> fg 1
# Press Ctrl+C: job terminates, shell safely returns to prompt!
```

---

## 5. Linux `/proc` Observability & Monitoring

### A. Deep Process Inspection (`inspect <pid>`)
```bash
# Inspect systemd (PID 1)
forge> inspect 1

# Start a background workload and inspect its memory and open FDs
forge> ./bin/leak 50 10 &
[1] 14850
forge> inspect 14850
```
Notice the exact source files cited for every metric:
- `/proc/<pid>/stat` (PID, state, CPU ticks)
- `/proc/<pid>/status` (VmSize, VmRSS, threads)
- `/proc/<pid>/cmdline` (arguments)
- `/proc/<pid>/fd/` (open descriptors)

### B. Live Process Monitoring (`monitor <pid> [interval_sec]`)
```bash
# Launch a CPU burning workload in background
forge> ./bin/spin 30 1 &
[2] 14920

# Live monitor CPU %, RSS memory, and thread count
forge> monitor 14920 1
```
*Press `Ctrl+C` at any time to cleanly stop monitoring and return to the prompt without terminating the shell or the process.*

### C. Process Table Overview (`ps`)
```bash
forge> ps | head -n 15
```

---

## 6. Running Automated Tests & Sanitizers

Run the comprehensive test suite (26 checks covering process execution, quoting, redirection, pipelines, job control, and `/proc` metrics):

```bash
# Run release test suite
make test

# Run test suite with AddressSanitizer and UndefinedBehaviorSanitizer
make asan
make test
```

---

## 7. Debugging with GDB

To debug ForgeShell under GDB:

```bash
# Build with debug symbols (-g3 -O0 -DDEBUG)
make debug

# Start GDB
gdb ./bin/forge

# Inside GDB:
(gdb) break execute_pipeline
(gdb) run
forge> echo "hello gdb" | cat
(gdb) print *pipeline
(gdb) next
(gdb) continue
(gdb) quit
```
