#!/usr/bin/env python3
"""Record the README demo GIF by driving bin/forge in a real pseudo-terminal.

The script starts ForgeShell under a pty (so it runs interactively, with job
control), types commands into it, reads PIDs back off the screen, and renders
each screen state to a GIF frame with Pillow.

    make && python3 tools/record_demo.py [--font DIR] [--out docs/assets/demo.gif]

--font should point at a directory containing JetBrainsMono-Regular.ttf and
JetBrainsMono-Bold.ttf. Without it, DejaVu Sans Mono is used.

The local checkout path is shown as /home/dev/ForgeShell so the recording does
not leak the recorder's username or folder layout.
"""
import argparse
import fcntl
import os
import re
import select
import signal
import struct
import termios
import time

from PIL import Image, ImageDraw, ImageFont

COLS, ROWS = 96, 34
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DISPLAY_REPO = "/home/dev/ForgeShell"

# Light palette, matching the guide website.
BG = (250, 250, 250)
FG = (24, 24, 27)
MUTED = (140, 140, 148)
BORDER = (226, 226, 230)
SGR_COLORS = {
    31: (201, 42, 42),    # red
    32: (43, 138, 62),    # green
    33: (176, 120, 0),    # yellow
    34: (44, 76, 230),    # blue
    36: (44, 76, 230),    # cyan, drawn in the same accent blue
}


class Screen:
    """A tiny terminal emulator: enough for ForgeShell's output."""

    def __init__(self, cols, rows):
        self.cols, self.rows = cols, rows
        self.lines = [[] for _ in range(rows)]
        self.x = self.y = 0
        self.style = (FG, False)
        self.pending = ""

    def _newline(self):
        self.y += 1
        if self.y >= self.rows:
            self.lines.pop(0)
            self.lines.append([])
            self.y = self.rows - 1

    def _put(self, ch):
        if self.x >= self.cols:
            self.x = 0
            self._newline()
        line = self.lines[self.y]
        while len(line) <= self.x:
            line.append((" ", (FG, False)))
        line[self.x] = (ch, self.style)
        self.x += 1

    def _sgr(self, params):
        color, bold = self.style
        for p in (params or [0]):
            if p == 0:
                color, bold = FG, False
            elif p == 1:
                bold = True
            elif p == 2:
                color = MUTED
            elif p in SGR_COLORS:
                color = SGR_COLORS[p]
            elif p == 39:
                color = FG
        self.style = (color, bold)

    def feed(self, data):
        data = (self.pending + data).replace(REPO, DISPLAY_REPO)
        self.pending = ""
        # Hold back a tail that could be the start of a split-up REPO path.
        for k in range(min(len(REPO) - 1, len(data)), 0, -1):
            if REPO.startswith(data[-k:]):
                self.pending, data = data[-k:], data[:-k]
                break
        i = 0
        while i < len(data):
            ch = data[i]
            if ch == "\x1b":
                m = re.match(r"\x1b\[([0-9;?]*)([A-Za-z])", data[i:])
                if not m:
                    if len(data) - i < 16:
                        self.pending = data[i:] + self.pending
                        return
                    i += 1
                    continue
                params = [int(p) for p in m.group(1).split(";") if p.isdigit()]
                if m.group(2) == "m":
                    self._sgr(params)
                elif m.group(2) == "K":
                    del self.lines[self.y][self.x:]
                i += m.end()
                continue
            if ch == "\r":
                self.x = 0
            elif ch == "\n":
                self._newline()
            elif ch == "\b":
                self.x = max(0, self.x - 1)
            elif ch == "\x07":
                pass
            elif ch >= " ":
                self._put(ch)
            i += 1

    def text(self):
        return "\n".join("".join(c for c, _ in line) for line in self.lines)

    def snapshot(self):
        return [list(line) for line in self.lines], (self.x, self.y)


class Recorder:
    def __init__(self, fonts):
        self.screen = Screen(COLS, ROWS)
        self.frames = []  # (timestamp, snapshot)
        self.fd = None
        self.font, self.bold = fonts
        self.start = time.monotonic()

    def capture(self):
        snap = self.screen.snapshot()
        if self.frames and self.frames[-1][1] == snap:
            return
        self.frames.append((time.monotonic(), snap))

    def pump(self, seconds):
        end = time.monotonic() + seconds
        while True:
            left = end - time.monotonic()
            if left <= 0:
                break
            r, _, _ = select.select([self.fd], [], [], min(left, 0.03))
            if r:
                try:
                    chunk = os.read(self.fd, 65536)
                except OSError:
                    break
                self.screen.feed(chunk.decode("utf-8", "replace"))
                self.capture()

    def type(self, text, delay=0.045):
        for ch in text:
            os.write(self.fd, ch.encode())
            self.pump(delay)
        os.write(self.fd, b"\r")
        self.pump(0.15)

    def wait_for(self, pattern, timeout=10):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            m = re.search(pattern, self.screen.text())
            if m:
                return m
            self.pump(0.05)
        raise RuntimeError(f"timed out waiting for {pattern!r}")

    # ---- rendering -------------------------------------------------------
    def render(self, out_path):
        size = 15
        cw = int(self.font.getlength("M") + 0.5)
        lh = int(size * 1.55)
        pad_x, pad_top, pad_bottom = 28, 54, 24
        width = pad_x * 2 + cw * COLS
        height = pad_top + lh * ROWS + pad_bottom

        def draw_frame(snap, cursor_on):
            lines, (cx, cy) = snap
            img = Image.new("RGB", (width, height), BG)
            d = ImageDraw.Draw(img)
            d.rounded_rectangle([0, 0, width - 1, height - 1], radius=10, outline=BORDER, width=1)
            d.line([0, 38, width, 38], fill=BORDER, width=1)
            d.text((pad_x, 12), "FORGESHELL  /  bin/forge", font=self.font, fill=MUTED)
            for row, line in enumerate(lines):
                y = pad_top + row * lh
                for col, (ch, (color, bold)) in enumerate(line):
                    if ch != " ":
                        d.text((pad_x + col * cw, y), ch, font=self.bold if bold else self.font, fill=color)
            if cursor_on:
                x = pad_x + cx * cw
                y = pad_top + cy * lh
                d.rectangle([x, y + 2, x + cw - 2, y + lh - 4], fill=SGR_COLORS[34])
            return img

        images, durations = [], []
        for i, (ts, snap) in enumerate(self.frames):
            nxt = self.frames[i + 1][0] if i + 1 < len(self.frames) else ts + 4.0
            dur = max(0.02, nxt - ts)
            # Long pauses get a blinking cursor so the GIF never looks frozen.
            if dur > 1.2:
                blinks = int(dur / 0.55)
                for b in range(blinks):
                    images.append(draw_frame(snap, b % 2 == 0))
                    durations.append(int(dur / blinks * 1000))
            else:
                images.append(draw_frame(snap, True))
                durations.append(int(dur * 1000))

        images = [im.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for im in images]
        images[0].save(out_path, save_all=True, append_images=images[1:], duration=durations,
                       loop=0, optimize=True, disposal=1)
        print(f"wrote {out_path}: {len(images)} frames, {width}x{height}")


def load_fonts(font_dir):
    if font_dir:
        return (ImageFont.truetype(os.path.join(font_dir, "JetBrainsMono-Regular.ttf"), 15),
                ImageFont.truetype(os.path.join(font_dir, "JetBrainsMono-Bold.ttf"), 15))
    base = "/usr/share/fonts/truetype/dejavu/"
    return (ImageFont.truetype(base + "DejaVuSansMono.ttf", 15),
            ImageFont.truetype(base + "DejaVuSansMono-Bold.ttf", 15))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", help="directory with JetBrains Mono TTFs")
    ap.add_argument("--out", default=os.path.join(REPO, "docs", "assets", "demo.gif"))
    args = ap.parse_args()

    rec = Recorder(load_fonts(args.font))

    pid, fd = os.forkpty()
    if pid == 0:
        os.chdir(REPO)
        env = dict(os.environ, TERM="xterm", PATH="/usr/local/bin:/usr/bin:/bin")
        os.execve(os.path.join(REPO, "bin", "forge"), ["forge"], env)
    rec.fd = fd
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))

    rec.pump(0.8)

    # 1. A pipeline.
    rec.type('printf "cherry\\napple\\nbanana\\n" | sort | head -n 2')
    rec.pump(1.4)

    # 2. A background job that holds 300 MB of memory.
    rec.type("./bin/leak 300 60 > /dev/null &")
    leak_pid = rec.wait_for(r"\[1\] (\d+)").group(1)
    rec.pump(1.0)
    rec.type("jobs")
    rec.pump(1.2)

    # 3. Job control: suspend a CPU-bound job, resume it in the background.
    rec.type("./bin/spin 600 1")
    spin_pid = rec.wait_for(r"\[spin\] Started PID (\d+)").group(1)
    rec.pump(1.4)
    os.write(fd, b"\x1a")
    rec.wait_for(r"Stopped")
    rec.pump(1.2)
    rec.type("bg")
    rec.pump(0.8)
    rec.type("jobs")
    rec.pump(1.6)

    # 4. Watch the CPU-bound job live through /proc, then stop with Ctrl+C.
    rec.type(f"monitor {spin_pid}")
    rec.pump(4.4)
    os.write(fd, b"\x03")
    rec.pump(1.4)

    # 5. Full /proc report for the memory hog.
    rec.type(f"inspect {leak_pid}")
    rec.pump(5.0)

    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    for child in (leak_pid, spin_pid):
        try:
            os.kill(int(child), signal.SIGKILL)
        except ProcessLookupError:
            pass
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    rec.render(args.out)


if __name__ == "__main__":
    main()
