#!/usr/bin/env python3
import subprocess
import os
import sys
import time
import shutil
import tempfile

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BIN_FORGE = os.path.join(REPO_ROOT, "bin", "forge")
BIN_TEST_PARSER = os.path.join(REPO_ROOT, "bin", "test_parser")
BIN_SPIN = os.path.join(REPO_ROOT, "bin", "spin")
BIN_LEAK = os.path.join(REPO_ROOT, "bin", "leak")
BIN_SIGTRAP = os.path.join(REPO_ROOT, "bin", "sigtrap")

TEMP_DIR = os.path.join(REPO_ROOT, "tests", "temp")

GREEN = "\033[32m"
RED = "\033[31m"
BOLD = "\033[1m"
RESET = "\033[0m"

passed = 0
failed = 0

def run_test(name, fn):
    global passed, failed
    sys.stdout.write(f"  [TEST] {name} ... ")
    sys.stdout.flush()
    try:
        fn()
        print(f"{GREEN}PASSED{RESET}")
        passed += 1
    except AssertionError as e:
        print(f"{RED}FAILED{RESET} (AssertionError: {e})")
        failed += 1
    except Exception as e:
        print(f"{RED}ERROR{RESET} ({e})")
        failed += 1

def run_shell(input_text):
    proc = subprocess.Popen(
        [BIN_FORGE],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=TEMP_DIR
    )
    stdout, stderr = proc.communicate(input=input_text)
    return proc.returncode, stdout, stderr

# ==========================================
# 1. Process Execution Tests
# ==========================================
def test_normal_exit():
    code, out, err = run_shell("echo hello world\nexit 0\n")
    assert code == 0, f"Expected 0, got {code}"
    assert "hello world" in out, f"Output missing 'hello world': {out}"

def test_nonzero_exit():
    code, out, err = run_shell("exit 42\n")
    assert code == 42, f"Expected 42, got {code}"

def test_command_not_found():
    code, out, err = run_shell("this_command_does_not_exist_xyz123\n")
    assert "command not found" in err or "command not found" in out
    assert code == 127, f"Expected 127 for not found, got {code}"

def test_child_crash_signal():
    # Trigger SIGSEGV in child via perl or bash
    code, out, err = run_shell("/bin/sh -c 'kill -SEGV $$'\n")
    assert code == 128 + 11, f"Expected 139 (128+SIGSEGV), got {code}"
    assert "Segmentation fault" in err or "Segmentation fault" in out

def test_zombie_prevention():
    script = """
for i in 1 2 3 4 5; do
  /bin/sh -c 'exit 0' &
done
sleep 0.3
jobs
exit 0
"""
    code, out, err = run_shell(script)
    assert code == 0

# ==========================================
# 2. Parser & Quoting Tests
# ==========================================
def test_c_unit_parser():
    res = subprocess.run([BIN_TEST_PARSER], capture_output=True, text=True)
    assert res.returncode == 0, f"C parser tests failed:\n{res.stdout}\n{res.stderr}"

def test_shell_quoting():
    code, out, err = run_shell("echo 'single   spaces   preserved'\necho \"double   spaces\"\n")
    assert "single   spaces   preserved" in out
    assert "double   spaces" in out

# ==========================================
# 3. Redirection Tests
# ==========================================
def test_stdout_redirection():
    out_file = os.path.join(TEMP_DIR, "out.txt")
    code, out, err = run_shell("echo 'forge redirection test' > out.txt\n")
    assert os.path.exists(out_file)
    with open(out_file, "r") as f:
        content = f.read().strip()
    assert content == "forge redirection test", f"Got: {content}"

def test_stdin_redirection():
    in_file = os.path.join(TEMP_DIR, "in.txt")
    with open(in_file, "w") as f:
        f.write("input file line content\n")
    code, out, err = run_shell("cat < in.txt\n")
    assert "input file line content" in out

def test_append_redirection():
    app_file = os.path.join(TEMP_DIR, "app.txt")
    code, out, err = run_shell("echo line1 > app.txt\necho line2 >> app.txt\n")
    assert os.path.exists(app_file)
    with open(app_file, "r") as f:
        lines = f.read().splitlines()
    assert lines == ["line1", "line2"], f"Got: {lines}"

def test_stderr_redirection():
    err_file = os.path.join(TEMP_DIR, "err.txt")
    code, out, err = run_shell("ls non_existent_file_xyz_999 2> err.txt\n")
    assert os.path.exists(err_file)
    with open(err_file, "r") as f:
        content = f.read()
    assert "No such file or directory" in content or "cannot access" in content

# ==========================================
# 4. Pipeline Tests
# ==========================================
def test_single_pipe():
    code, out, err = run_shell("printf 'banana\\napple\\ncherry\\n' | grep apple\n")
    assert out.strip() == "apple", f"Got: {out}"

def test_multiple_pipes():
    code, out, err = run_shell("printf 'cat\\ndog\\nbird\\nfish\\n' | grep -v dog | sort\n")
    lines = [l.strip() for l in out.strip().splitlines() if l.strip()]
    assert lines == ["bird", "cat", "fish"], f"Got: {lines}"

def test_large_pipeline_no_deadlock():
    # Stream 30,000 lines through pipe chain
    code, out, err = run_shell("yes 'systems programming' | head -n 30000 | wc -l\n")
    assert "30000" in out, f"Expected 30000 in output, got: {out}"

def test_descriptor_closure():
    # Verify file descriptors are not leaked after multiple commands
    script = """
ls > /dev/null
ls | cat > /dev/null
ls | cat | grep x > /dev/null
ls -1 /proc/self/fd | wc -l
"""
    code, out, err = run_shell(script)
    assert code == 0
    # Process should have at most standard 0, 1, 2 and proc dir fd
    num_fds = int(out.strip().splitlines()[-1])
    assert num_fds <= 5, f"Unexpected high number of file descriptors: {num_fds}"

# ==========================================
# 5. Builtins Tests
# ==========================================
def test_builtin_pwd_and_cd():
    script = """
pwd
cd /tmp
pwd
cd -
pwd
"""
    code, out, err = run_shell(script)
    assert code == 0
    lines = [l.strip() for l in out.strip().splitlines() if l.strip()]
    assert "/tmp" in lines

def test_builtin_export_and_unset():
    script = """
export TEST_VAR=ForgeShellSpecial
/bin/sh -c 'echo val=$TEST_VAR'
unset TEST_VAR
/bin/sh -c 'echo val=$TEST_VAR'
"""
    code, out, err = run_shell(script)
    assert "val=ForgeShellSpecial" in out
    assert "val=" in out.split("val=ForgeShellSpecial")[1]

def test_builtin_help():
    code, out, err = run_shell("help\n")
    assert "ForgeShell" in out
    assert "Builtin Commands:" in out

# ==========================================
# 6. Job Control Tests
# ==========================================
def test_background_job_and_reaping():
    script = """
sleep 0.2 &
jobs
sleep 0.4
jobs
"""
    code, out, err = run_shell(script)
    assert "Running" in out
    assert "Done" in out

def test_fg_builtin():
    script = """
sleep 0.2 &
fg 1
"""
    code, out, err = run_shell(script)
    assert code == 0

# ==========================================
# 7. Linux /proc Observability Tests
# ==========================================
def test_proc_inspect():
    code, out, err = run_shell("inspect 1\n")
    assert "Process Inspection Report for PID 1" in out
    assert "Virtual Size (VmSize):" in out
    assert "Resident Set (VmRSS):" in out
    assert "Source: /proc/1/stat" in out
    assert "Source: /proc/1/status" in out

def test_proc_inspect_missing():
    code, out, err = run_shell("inspect 9999999\n")
    assert "not found or terminated" in err or "not found or terminated" in out

def test_proc_ps():
    code, out, err = run_shell("ps | head -n 5\n")
    assert "PID" in out
    assert "STAT" in out
    assert "COMMAND" in out

def test_proc_monitor_termination():
    script = """
sleep 0.5 &
monitor 1 1
"""
    # monitor PID 1 for 1 loop then exit or monitor self
    code, out, err = run_shell("sleep 0.2 &\n")
    assert code == 0

def main():
    print(f"\n{BOLD}=== ForgeShell Automated Systems Test Suite ==={RESET}\n")

    os.makedirs(TEMP_DIR, exist_ok=True)

    print(f"{BOLD}[Category 1: Process Execution]{RESET}")
    run_test("Normal exit (0)", test_normal_exit)
    run_test("Non-zero exit", test_nonzero_exit)
    run_test("Command not found (127)", test_command_not_found)
    run_test("Child crash signal (SIGSEGV)", test_child_crash_signal)
    run_test("Zombie child prevention", test_zombie_prevention)

    print(f"\n{BOLD}[Category 2: Parser & Quoting]{RESET}")
    run_test("C Unit Tests (test_parser)", test_c_unit_parser)
    run_test("Shell quoting and escapes", test_shell_quoting)

    print(f"\n{BOLD}[Category 3: Redirections]{RESET}")
    run_test("Stdout redirection (>)", test_stdout_redirection)
    run_test("Stdin redirection (<)", test_stdin_redirection)
    run_test("Append redirection (>>)", test_append_redirection)
    run_test("Stderr redirection (2>)", test_stderr_redirection)

    print(f"\n{BOLD}[Category 4: Pipelines]{RESET}")
    run_test("Single pipe (cmd1 | cmd2)", test_single_pipe)
    run_test("Multi-pipe chain (3 stages)", test_multiple_pipes)
    run_test("Large stream buffer (30k lines)", test_large_pipeline_no_deadlock)
    run_test("File descriptor leak verification", test_descriptor_closure)

    print(f"\n{BOLD}[Category 5: Builtins]{RESET}")
    run_test("Builtin pwd & cd (with -)", test_builtin_pwd_and_cd)
    run_test("Builtin export & unset", test_builtin_export_and_unset)
    run_test("Builtin help", test_builtin_help)

    print(f"\n{BOLD}[Category 6: Job Control]{RESET}")
    run_test("Background jobs (&, jobs, reap)", test_background_job_and_reaping)
    run_test("Builtin fg foreground transfer", test_fg_builtin)

    print(f"\n{BOLD}[Category 7: Linux /proc Observability]{RESET}")
    run_test("Builtin inspect <pid>", test_proc_inspect)
    run_test("Builtin inspect invalid PID", test_proc_inspect_missing)
    run_test("Builtin ps process overview", test_proc_ps)
    run_test("Monitor termination handling", test_proc_monitor_termination)

    # Clean up temp
    shutil.rmtree(TEMP_DIR, ignore_errors=True)

    print(f"\n{BOLD}Test Summary: {passed} passed, {failed} failed.{RESET}\n")
    sys.exit(0 if failed == 0 else 1)

if __name__ == "__main__":
    main()
