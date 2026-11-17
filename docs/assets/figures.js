/* Interactive figures for the ForgeShell guide. Plain DOM + SVG, no libraries. */
(function () {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    setAttrs(node, attrs);
    append(node, kids);
    return node;
  }
  function sv(tag, attrs, ...kids) {
    const node = document.createElementNS(SVGNS, tag);
    setAttrs(node, attrs);
    append(node, kids);
    return node;
  }
  function setAttrs(node, attrs) {
    if (!attrs) return;
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
  }
  function append(node, kids) {
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* A prev / step n of m / next bar. */
  function stepper(container, count, render, opts = {}) {
    let i = 0;
    const prev = el("button", { class: "btn", type: "button", text: "← Prev" });
    const next = el("button", { class: "btn", type: "button", text: "Next →" });
    const label = el("span", { class: "step-count" });
    const bar = el("div", { class: "controls" }, prev, label, next, el("span", { class: "spacer" }), opts.extra || null);
    container.appendChild(bar);
    function go(n) {
      i = Math.max(0, Math.min(count() - 1, n));
      label.textContent = `${i + 1} / ${count()}`;
      prev.disabled = i === 0;
      next.disabled = i === count() - 1;
      render(i);
    }
    prev.addEventListener("click", () => go(i - 1));
    next.addEventListener("click", () => go(i + 1));
    return { go, reset: () => go(0), get index() { return i; } };
  }

  /* Tween helper for SVG paths. */
  function tween(from, to, ms, onFrame) {
    const t0 = performance.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function frame(now) {
      let t = reduce ? 1 : Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      onFrame(from.map((f, k) => f + (to[k] - f) * e));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  const figures = {};

  /* ================================================================ */
  /* FIG_001: the loop                                                 */
  /* ================================================================ */
  figures.loop = function (body) {
    const steps = [
      { fn: "check_and_notify_jobs()", file: "jobs.c", text: "Reap any background job that finished or stopped, without blocking (<code>waitpid</code> with <code>WNOHANG</code>), and print <code>[1]+ Done</code> lines. This is why finished jobs are announced just before a prompt." },
      { fn: "print_prompt()", file: "main.c", text: "Print <code>forge&gt; </code>, but only if stdin is a terminal. Then <code>fflush</code>, because the prompt has no newline and would otherwise sit in the buffer." },
      { fn: "getline()", file: "main.c", text: "Block until a whole line arrives. It returns -1 at end of input (Ctrl+D, or the end of a piped script), and that ends the loop." },
      { fn: "parse_pipeline()", file: "parser.c", text: "Tokenize, then build a linked list of <code>Command</code>s. <code>NULL</code> means a syntax error or an empty line, and the loop simply goes round again." },
      { fn: "execute_pipeline()", file: "executor.c", text: "Run a lone builtin inside the shell, or fork one process per stage, wire up pipes and redirects, then wait for the job or leave it in the background." },
      { fn: "free_pipeline()", file: "parser.c", text: "Free every string and struct the parser allocated, so the shell's memory stays flat however many commands you run." },
    ];
    const W = 1000, H = 250, bw = 148, bh = 58, y = 50;
    const xs = steps.map((_, i) => 14 + i * 163);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Diagram of the shell's main loop" });

    // arrows between boxes
    for (let i = 0; i < steps.length - 1; i++) {
      const x1 = xs[i] + bw, x2 = xs[i + 1];
      svg.appendChild(sv("line", { x1, y1: y + bh / 2, x2: x2 - 4, y2: y + bh / 2, class: "s-line" }));
      svg.appendChild(sv("path", { d: `M ${x2 - 9} ${y + bh / 2 - 4} L ${x2 - 2} ${y + bh / 2} L ${x2 - 9} ${y + bh / 2 + 4}`, class: "s-line" }));
    }
    // return path
    const cx0 = xs[0] + bw / 2, cx5 = xs[5] + bw / 2, ry = 190;
    svg.appendChild(sv("path", { d: `M ${cx5} ${y + bh} L ${cx5} ${ry - 14} Q ${cx5} ${ry} ${cx5 - 14} ${ry} L ${cx0 + 14} ${ry} Q ${cx0} ${ry} ${cx0} ${ry - 14} L ${cx0} ${y + bh + 6}`, class: "s-dash" }));
    svg.appendChild(sv("path", { d: `M ${cx0 - 4} ${y + bh + 13} L ${cx0} ${y + bh + 5} L ${cx0 + 4} ${y + bh + 13}`, class: "s-line" }));
    svg.appendChild(sv("text", { x: (cx0 + cx5) / 2, y: ry + 22, "text-anchor": "middle", class: "s-text-sm", text: "REPEAT UNTIL END OF INPUT" }));

    const boxes = steps.map((s, i) => {
      const g = sv("g", { tabindex: 0, role: "button", style: "cursor:pointer" },
        sv("rect", { x: xs[i], y, width: bw, height: bh, rx: 4, class: "s-box anim" }),
        sv("text", { x: xs[i] + bw / 2, y: y + 25, "text-anchor": "middle", class: "s-text", style: "font-size:11px", text: s.fn.replace("()", "") }),
        sv("text", { x: xs[i] + bw / 2, y: y + 43, "text-anchor": "middle", class: "s-text-sm", text: s.file }),
        sv("text", { x: xs[i] + 4, y: y - 10, class: "s-text-sm", text: "0" + (i + 1) }),
      );
      svg.appendChild(g);
      return g;
    });

    const dot = sv("circle", { r: 5, class: "s-fill" });
    svg.appendChild(dot);
    // invisible motion path
    const motion = sv("path", { d: `M ${cx0} ${y + bh / 2} L ${cx5} ${y + bh / 2} L ${cx5} ${ry} L ${cx0} ${ry} Z`, fill: "none", stroke: "none" });
    svg.appendChild(motion);

    const readout = el("div", { class: "readout" });
    body.append(svg, readout);

    let active = -1, pinned = false;
    function show(i) {
      if (i === active) return;
      active = i;
      boxes.forEach((g, k) => {
        const r = g.querySelector("rect");
        r.setAttribute("class", "anim " + (k === i ? "s-box-soft" : "s-box"));
      });
      const s = steps[i];
      readout.innerHTML = `<span class="tag">${String(i + 1).padStart(2, "0")} &middot; ${esc(s.file)}</span><code>${esc(s.fn)}</code>&nbsp; ${s.text}`;
    }
    boxes.forEach((g, i) => {
      g.addEventListener("mouseenter", () => { pinned = true; show(i); });
      g.addEventListener("focus", () => { pinned = true; show(i); });
      g.addEventListener("click", () => { pinned = true; show(i); });
    });
    svg.addEventListener("mouseleave", () => { pinned = false; });

    const len = motion.getTotalLength();
    const topLen = cx5 - cx0;
    let t0 = performance.now();
    const period = 7000;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function frame(now) {
      const f = ((now - t0) % period) / period;
      const d = f * len;
      const p = motion.getPointAtLength(d);
      dot.setAttribute("cx", p.x);
      dot.setAttribute("cy", p.y);
      if (!pinned && d <= topLen) {
        let k = 0;
        for (let j = 0; j < xs.length; j++) if (p.x >= xs[j] - 10) k = j;
        show(k);
      }
      requestAnimationFrame(frame);
    }
    show(0);
    if (!reduce) requestAnimationFrame(frame);
    else { dot.setAttribute("cx", cx0); dot.setAttribute("cy", y + bh / 2); }
  };

  /* ================================================================ */
  /* FIG_002: parser playground (a faithful port of src/parser.c)      */
  /* ================================================================ */
  const isSpace = (c) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\v" || c === "\f";

  function tokenize(s) {
    const toks = [];
    const add = (type, text) => toks.push({ type, text });
    let p = 0;
    while (p < s.length) {
      const c = s[p];
      if (isSpace(c)) { p++; continue; }
      if (c === "|") { add("PIPE", "|"); p++; continue; }
      if (c === "&") { add("BACKGROUND", "&"); p++; continue; }
      if (c === "<") { add("IN_REDIR", "<"); p++; continue; }
      if (c === ">") {
        if (s[p + 1] === ">") { add("APPEND_REDIR", ">>"); p += 2; }
        else { add("OUT_REDIR", ">"); p++; }
        continue;
      }
      if (c === "2" && s[p + 1] === ">") { add("ERR_REDIR", "2>"); p += 2; continue; }

      let buf = "";
      let inWord = true;
      while (inWord && p < s.length) {
        const ch = s[p];
        if (ch === "'") {
          p++;
          while (p < s.length && s[p] !== "'") buf += s[p++];
          if (s[p] !== "'") return { tokens: toks, error: "syntax error: unclosed single quote" };
          p++;
        } else if (ch === '"') {
          p++;
          while (p < s.length && s[p] !== '"') {
            if (s[p] === "\\" && (s[p + 1] === '"' || s[p + 1] === "\\")) p++;
            buf += s[p++];
          }
          if (s[p] !== '"') return { tokens: toks, error: "syntax error: unclosed double quote" };
          p++;
        } else if (ch === "\\" && p + 1 < s.length) {
          p++;
          buf += s[p++];
        } else if (isSpace(ch) || ch === "|" || ch === "&" || ch === "<" || ch === ">" || (ch === "2" && s[p + 1] === ">")) {
          inWord = false;
        } else {
          buf += s[p++];
        }
      }
      add("WORD", buf);
    }
    add("EOF", null);
    return { tokens: toks };
  }

  function parse(tokens) {
    const newCmd = () => ({ argv: [], input: null, output: null, append: false, error: null });
    if (tokens.length <= 1 || tokens[0].type === "EOF") return { empty: "the line has no tokens" };
    const cmds = [newCmd()];
    let cur = cmds[0], bg = false, i = 0;
    const fail = (msg) => ({ error: msg });
    while (i < tokens.length && tokens[i].type !== "EOF") {
      const t = tokens[i].type;
      if (t === "WORD") { cur.argv.push(tokens[i].text); i++; }
      else if (t === "IN_REDIR") {
        i++;
        if (i >= tokens.length || tokens[i].type !== "WORD") return fail("syntax error near unexpected token '<'");
        cur.input = tokens[i].text; i++;
      } else if (t === "OUT_REDIR" || t === "APPEND_REDIR") {
        const append = t === "APPEND_REDIR";
        i++;
        if (i >= tokens.length || tokens[i].type !== "WORD") return fail("syntax error near unexpected token '>'");
        cur.output = tokens[i].text; cur.append = append; i++;
      } else if (t === "ERR_REDIR") {
        i++;
        if (i >= tokens.length || tokens[i].type !== "WORD") return fail("syntax error near unexpected token '2>'");
        cur.error = tokens[i].text; i++;
      } else if (t === "PIPE") {
        if (cur.argv.length === 0) return fail("syntax error near unexpected token '|'");
        i++;
        if (i >= tokens.length || tokens[i].type === "EOF" || tokens[i].type === "PIPE") return fail("syntax error near unexpected token '|'");
        cur = newCmd(); cmds.push(cur);
      } else if (t === "BACKGROUND") {
        i++;
        if (i < tokens.length && tokens[i].type !== "EOF") return fail("syntax error: '&' must be at end of command");
        bg = true;
        break;
      }
    }
    if (cmds[0].argv.length === 0) return { empty: "no command name, only redirects" };
    for (let k = 1; k < cmds.length; k++) {
      if (cmds[k].argv.length === 0) return fail("syntax error: missing command after '|'");
    }
    return { cmds, bg };
  }

  const BUILTINS = ["cd", "pwd", "exit", "export", "unset", "jobs", "fg", "bg", "help", "inspect", "monitor", "ps"];

  figures.parser = function (body) {
    const presets = [
      "sort < in.txt | head -n 2 > out.txt",
      "echo \"a | b\" 'c   d' e\\ f",
      "ls | grep .c | wc -l",
      "sleep 100 &",
      "cd /tmp",
      "echo a2>f",
      "cat <",
      "| wc",
      "echo 'unclosed",
      "a & b",
      "ls | > out.txt",
    ];
    const input = el("input", { class: "field", type: "text", value: presets[0], spellcheck: "false", autocomplete: "off", "aria-label": "Command line to parse" });
    const chips = el("div", { class: "controls" }, presets.map((p) => el("button", { class: "chip", type: "button", text: p, onclick: () => { input.value = p; run(); } })));
    const tokWrap = el("div", { class: "tokens", "aria-live": "polite" });
    const out = el("div", { style: "margin-top:18px" });
    body.append(el("div", { class: "s-text-sm", style: "font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:.06em;margin-bottom:8px", text: "FORGE>" }), input, el("div", { style: "height:12px" }), chips,
      el("div", { style: "font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:.06em;margin:6px 0 8px", text: "1. TOKENS" }), tokWrap,
      el("div", { style: "font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:.06em;margin:22px 0 8px", text: "2. PARSED PIPELINE" }), out);

    const KIND = { WORD: "WORD", PIPE: "PIPE", IN_REDIR: "IN", OUT_REDIR: "OUT", APPEND_REDIR: "APPEND", ERR_REDIR: "ERR", BACKGROUND: "BG", EOF: "EOF" };
    function show(v) { return v === null ? el("span", { class: "null", text: "NULL" }) : el("span", { text: JSON.stringify(v) }); }

    function run() {
      const res = tokenize(input.value);
      tokWrap.replaceChildren(...res.tokens.map((t) => el("span", { class: "tok" + (t.type === "WORD" ? "" : t.type === "EOF" ? " eof" : " op") },
        el("span", { class: "k", text: KIND[t.type] }), el("span", { class: "v", text: t.type === "EOF" ? "∅" : t.text === "" ? '""' : t.text }))));
      out.replaceChildren();
      if (res.error) {
        tokWrap.appendChild(el("span", { class: "err-line", style: "align-self:center", text: "✗ lexer stopped" }));
        out.append(el("div", { class: "err-line", text: "forge: error: " + res.error }), el("div", { class: "ok-line", text: "tokenize() returns false, frees the partial token list, and parse_pipeline() returns NULL." }));
        return;
      }
      const p = parse(res.tokens);
      if (p.error) {
        out.append(el("div", { class: "err-line", text: "forge: error: " + p.error }), el("div", { class: "ok-line", text: "Everything allocated so far is freed and parse_pipeline() returns NULL. Nothing runs." }));
        return;
      }
      if (p.empty) {
        out.append(el("div", { class: "ok-line", text: `parse_pipeline() returns NULL quietly: ${p.empty}. Nothing runs, no message.` }));
        return;
      }
      const row = el("div", { class: "cmds" });
      p.cmds.forEach((c, k) => {
        if (k > 0) row.appendChild(el("span", { class: "pipe-arrow", text: "| →" }));
        const argv = el("span", {}, "[", c.argv.map((a, j) => [j ? ", " : "", JSON.stringify(a)]), ", ", el("span", { class: "null", text: "NULL" }), "]");
        row.appendChild(el("div", { class: "cmd" },
          el("h4", { text: `COMMAND ${k + 1}` }),
          el("dl", {},
            el("dt", { text: "argv" }), el("dd", {}, argv),
            el("dt", { text: "argc" }), el("dd", { text: String(c.argv.length) }),
            el("dt", { text: "input_file" }), el("dd", {}, show(c.input)),
            el("dt", { text: "output_file" }), el("dd", {}, show(c.output), c.output ? el("span", { class: "null", text: c.append ? "  (append)" : "  (truncate)" }) : null),
            el("dt", { text: "error_file" }), el("dd", {}, show(c.error)))));
      });
      out.appendChild(row);
      const single = p.cmds.length === 1, builtin = BUILTINS.includes(p.cmds[0].argv[0]);
      let plan;
      if (single && builtin && !p.bg) plan = `is_background = false · "${p.cmds[0].argv[0]}" is a builtin: it runs inside the shell, no fork.`;
      else plan = `is_background = ${p.bg} · fork ${p.cmds.length} process${p.cmds.length > 1 ? "es" : ""} into one process group` +
        (p.cmds.length > 1 ? `, joined by ${p.cmds.length - 1} pipe${p.cmds.length > 2 ? "s" : ""}` : "") +
        (p.bg ? " · print [n] pgid and return to the prompt." : " · hand over the terminal and wait.");
      out.appendChild(el("div", { class: "ok-line", style: "margin-top:12px", text: plan }));
    }
    input.addEventListener("input", run);
    run();
  };

  /* ================================================================ */
  /* FIG_003: fork / exec / wait                                       */
  /* ================================================================ */
  figures.forkexec = function (body) {
    const base = { pid: "4100", program: "forge", pgid: "4100", fd0: "/dev/pts/0 (terminal)", sigint: "ignored", state: "running" };
    const S = [];
    const P = (o) => Object.assign({}, base, o);
    let child = null;
    S.push({ code: "JobPipeline *pipeline = parse_pipeline(line);", text: "The shell has parsed <code>sort &lt; names.txt</code>: one command, not a builtin, foreground. Only one process exists so far.", parent: P({}), child: null, tty: "4100", ch: [] });
    child = { pid: "4101", program: "forge (a copy)", pgid: "4100", fd0: "/dev/pts/0 (terminal)", sigint: "ignored", state: "running" };
    S.push({ code: "pid_t pid = fork();", text: "<code>fork()</code> returns twice: <strong>4101</strong> in the parent and <strong>0</strong> in the child. The child is a copy, so it's running shell code, with the shell's descriptors and the shell's signal settings.", parent: P({ state: "running (fork returned 4101)" }), child: Object.assign({}, child, { state: "running (fork returned 0)" }), tty: "4100", ch: ["c:*"] });
    child = Object.assign({}, child, { pgid: "4101" });
    S.push({ code: "setpgid(0, pgid);   /* the parent also calls setpgid(pid, pgid) */", text: "The child moves into a new process group named after its own PID. The parent makes the same call for it, so the group exists whichever process runs first (chapter 08).", parent: P({}), child: Object.assign({}, child), tty: "4100", ch: ["c:pgid"] });
    S.push({ code: "tcsetpgrp(g_shell.shell_terminal, pgid);", text: "The child's group becomes the terminal's foreground group. From now on Ctrl+C goes to group 4101, not the shell. This works because the child still ignores <code>SIGTTOU</code>, inherited from the shell.", parent: P({}), child: Object.assign({}, child), tty: "4101", ch: ["tty"] });
    child = Object.assign({}, child, { sigint: "default (terminate)" });
    S.push({ code: "signals_reset_child();", text: "Ignored signals stay ignored across <code>exec</code>, so the child resets them. Without this, Ctrl+C couldn't stop <code>sort</code>.", parent: P({}), child: Object.assign({}, child), tty: "4101", ch: ["c:sigint"] });
    child = Object.assign({}, child, { fd0: "names.txt" });
    S.push({ code: "dup2(fd, STDIN_FILENO);", text: "<code>&lt; names.txt</code>: open the file, <code>dup2</code> it onto descriptor 0, close the spare. The child's stdin is now the file.", parent: P({}), child: Object.assign({}, child), tty: "4101", ch: ["c:fd0"] });
    child = Object.assign({}, child, { program: "sort" });
    S.push({ code: "execvp(cmd->argv[0], cmd->argv);", text: "<code>exec</code> replaces the program. The code, heap and stack are now <code>sort</code>'s. The PID, process group, descriptors and default signal settings carry over, so <code>sort</code> starts already set up.", parent: P({}), child: Object.assign({}, child), tty: "4101", ch: ["c:program"] });
    S.push({ code: "waitpid(-job->pgid, &status, WUNTRACED);", text: "Meanwhile the parent blocks until something in group 4101 exits or stops. It reads no input while it waits.", parent: P({ state: "blocked in waitpid" }), child: Object.assign({}, child), tty: "4101", ch: ["p:state"] });
    S.push({ code: "/* sort calls exit(0) */", text: "<code>sort</code> finishes. Its memory is released, but its process-table entry stays as a <strong>zombie</strong>, holding the exit status for the parent to collect.", parent: P({ state: "blocked in waitpid" }), child: Object.assign({}, child, { state: "zombie: exit status 0" }), tty: "4101", ch: ["c:state"] });
    S.push({ code: "tcsetpgrp(g_shell.shell_terminal, g_shell.shell_pgid);", text: "<code>waitpid</code> returns with the status, and the zombie is gone. The shell records exit status 0, takes the terminal back, restores its terminal settings, and prints the next prompt.", parent: P({ state: "running, exit status = 0" }), child: null, tty: "4100", ch: ["p:state", "tty"] });

    const rows = [["pid", "PID"], ["program", "program"], ["pgid", "process group"], ["fd0", "fd 0 (stdin)"], ["sigint", "SIGINT"], ["state", "state"]];
    const ttyBar = el("div", { class: "readout", style: "margin:0 0 14px;font-family:var(--mono);font-size:12.5px" });
    const grid = el("div", { class: "split" });
    const codeLine = el("div", { class: "excerpt", style: "margin:16px 0 0" }, el("pre", {}));
    const text = el("div", { class: "readout" });
    const st = stepper(body, () => S.length, render);
    body.append(ttyBar, grid, codeLine, text);

    function card(title, data, side, changes) {
      if (!data) return el("div", { class: "cmd", style: "opacity:.35;border-style:dashed" }, el("h4", { text: title }), el("p", { class: "ok-line", style: "margin:0", text: side === "c" ? "(no child process)" : "" }));
      const all = changes.includes(side + ":*");
      return el("div", { class: "cmd" }, el("h4", { text: title }), el("dl", {}, rows.map(([k, label]) => {
        const hot = all || changes.includes(side + ":" + k);
        const style = hot ? "background:var(--blue-wash);color:var(--blue);border-radius:3px;padding:0 4px;margin-left:-4px" : "";
        return [el("dt", { text: label }), el("dd", { style, text: data[k] })];
      })));
    }
    function render(i) {
      const s = S[i];
      const hot = s.ch.includes("tty");
      ttyBar.innerHTML = `<span class="tag">terminal</span>foreground process group = <strong style="color:${hot ? "var(--blue)" : "inherit"}">${s.tty}</strong>${s.tty === "4100" ? " (the shell)" : " (the job)"}`;
      grid.replaceChildren(card("PARENT · THE SHELL", s.parent, "p", s.ch), card("CHILD", s.child, "c", s.ch));
      codeLine.querySelector("pre").textContent = s.code;
      text.innerHTML = s.text;
    }
    st.go(0);
  };

  /* ================================================================ */
  /* FIG_004: wait status decoder                                      */
  /* ================================================================ */
  figures.status = function (body) {
    const SIGS = { 1: "SIGHUP", 2: "SIGINT", 3: "SIGQUIT", 6: "SIGABRT", 9: "SIGKILL", 11: "SIGSEGV", 13: "SIGPIPE", 15: "SIGTERM", 19: "SIGSTOP", 20: "SIGTSTP", 21: "SIGTTIN", 22: "SIGTTOU" };
    let mode = "exit", code = 42, sig = 11, core = true, stopSig = 20;
    const modes = [["exit", "exited"], ["signal", "killed by a signal"], ["stop", "stopped"]];
    const modeBtns = modes.map(([m, label]) => el("button", { class: "btn", type: "button", text: label, onclick: () => { mode = m; render(); } }));
    const params = el("div", { style: "margin:4px 0 8px" });
    const hex = el("div", { style: "font-family:var(--mono);font-size:13px;margin-top:8px" });
    const bits = el("div", { class: "bits" });
    const labels = el("div", { class: "bitlabels" });
    for (let b = 15; b >= 0; b--) labels.appendChild(el("span", { text: String(b) }));
    const bands = el("div", { class: "bitbands" }, el("span", { text: "bits 15-8: exit code or stop signal" }), el("span", { text: "core" }), el("span", { text: "bits 6-0: signal (0x7f = stopped)" }));
    const macros = el("div", { class: "macro-row" });
    const out = el("div", { class: "readout" });
    body.append(el("div", { class: "controls" }, modeBtns), params, hex, bits, labels, bands, macros, out);

    function sigSelect(list, value, onchange) {
      const s = el("select", { class: "btn", style: "text-transform:none", onchange: (e) => onchange(+e.target.value) },
        list.map((n) => el("option", { value: n, selected: n === value ? "selected" : null, text: `${SIGS[n]} (${n})` })));
      return s;
    }
    function render() {
      modeBtns.forEach((b, k) => b.setAttribute("aria-pressed", modes[k][0] === mode));
      params.replaceChildren();
      if (mode === "exit") {
        const r = el("input", { type: "range", min: 0, max: 255, value: code, "aria-label": "exit code" });
        const o = el("output", { text: String(code) });
        r.addEventListener("input", () => { code = +r.value; o.textContent = code; update(); });
        params.append(el("div", { class: "slider-row" }, el("label", { text: "exit(code)" }), r, o));
      } else if (mode === "signal") {
        params.append(el("div", { class: "controls" }, sigSelect([2, 3, 6, 9, 11, 13, 15], sig, (v) => { sig = v; update(); }),
          el("label", { style: "font-family:var(--mono);font-size:12px;display:flex;gap:6px;align-items:center" },
            el("input", { type: "checkbox", checked: core ? "checked" : null, onchange: (e) => { core = e.target.checked; update(); } }), "core dumped")));
      } else {
        params.append(el("div", { class: "controls" }, sigSelect([19, 20, 21, 22], stopSig, (v) => { stopSig = v; update(); })));
      }
      update();
    }
    function update() {
      let status;
      if (mode === "exit") status = (code & 0xff) << 8;
      else if (mode === "signal") status = (sig & 0x7f) | (core ? 0x80 : 0);
      else status = ((stopSig & 0xff) << 8) | 0x7f;
      hex.innerHTML = `status = <strong>${status}</strong> &nbsp;=&nbsp; 0x${status.toString(16).padStart(4, "0")}`;
      bits.replaceChildren();
      for (let b = 15; b >= 0; b--) {
        const one = (status >> b) & 1;
        bits.appendChild(el("span", { class: "bit" + (one ? " one" : "") + (b === 7 ? " hi" : ""), text: String(one) }));
      }
      const low7 = status & 0x7f;
      const exited = low7 === 0;
      const stopped = (status & 0xff) === 0x7f;
      const signaled = !exited && !stopped;
      const m = [
        ["WIFEXITED", exited, exited ? `WEXITSTATUS = ${(status >> 8) & 0xff}` : null],
        ["WIFSIGNALED", signaled, signaled ? `WTERMSIG = ${low7}` : null],
        ["WCOREDUMP", signaled && !!(status & 0x80), null],
        ["WIFSTOPPED", stopped, stopped ? `WSTOPSIG = ${(status >> 8) & 0xff}` : null],
      ];
      macros.replaceChildren(...m.map(([n, v, extra]) => el("span", { class: "macro" + (v ? " true" : ""), text: `${n}(s) ${v ? "✓" : "✗"}${extra ? "  " + extra : ""}` })));
      let msg;
      if (exited) msg = `ForgeShell records exit status <strong>${(status >> 8) & 0xff}</strong>. A normal exit passes the code through, keeping only the low 8 bits, which is why <code>exit 300</code> gives 44.`;
      else if (signaled) {
        const n = low7, name = SIGS[n] || "signal " + n;
        let extra = "";
        if (n === 11) extra = " It also prints <code>forge: Segmentation fault (core dumped)</code>.";
        if (n === 6) extra = " It also prints <code>forge: Aborted (core dumped)</code>.";
        if (n === 2) extra = " It prints a newline so the next prompt starts on a fresh line.";
        msg = `Killed by ${name}: ForgeShell records <strong>128 + ${n} = ${128 + n}</strong>.${extra}`;
      } else msg = `Stopped by ${SIGS[(status >> 8) & 0xff]}: the job stays in the table, <code>[1]+ Stopped</code> is printed, and the status is <strong>148</strong> (128 + SIGTSTP), whichever stop signal it was.`;
      out.innerHTML = msg;
    }
    render();
  };

  /* ================================================================ */
  /* FIG_005: file descriptor table                                    */
  /* ================================================================ */
  figures.fds = function (body) {
    const opts = [
      { label: "sort < in.txt", target: 0, file: "in.txt", flags: "O_RDONLY", prog: "sort" },
      { label: "ls > out.txt", target: 1, file: "out.txt", flags: "O_WRONLY | O_CREAT | O_TRUNC, 0644", prog: "ls" },
      { label: "ls >> out.txt", target: 1, file: "out.txt", flags: "O_WRONLY | O_CREAT | O_APPEND, 0644", prog: "ls" },
      { label: "ls nope 2> err.txt", target: 2, file: "err.txt", flags: "O_WRONLY | O_CREAT | O_TRUNC, 0644", prog: "ls" },
    ];
    let cur = opts[1];
    const optBtns = opts.map((o) => el("button", { class: "chip", type: "button", text: o.label, onclick: () => { cur = o; st.go(0); } }));
    body.append(el("div", { class: "controls" }, optBtns));

    const W = 760, H = 250;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "File descriptor table of the child process" });
    const names = ["stdin", "stdout", "stderr", ""];
    const rowY = (i) => 34 + i * 50;
    const title = sv("text", { x: 30, y: 16, class: "s-text-sm", text: "CHILD'S DESCRIPTOR TABLE" });
    const progLabel = sv("text", { x: 196, y: 16, class: "s-text-sm" });
    svg.append(title, progLabel, sv("text", { x: 480, y: 16, class: "s-text-sm", text: "OPEN FILES (IN THE KERNEL)" }));
    const rows = [0, 1, 2, 3].map((i) => {
      const g = sv("g", { class: "anim" },
        sv("rect", { x: 30, y: rowY(i), width: 160, height: 36, rx: 3, class: "s-box" }),
        sv("text", { x: 44, y: rowY(i) + 23, class: "s-text", text: "fd " + i }),
        sv("text", { x: 96, y: rowY(i) + 23, class: "s-text-sm", text: names[i] }));
      svg.appendChild(g);
      return g;
    });
    const objTty = { x: 480, y: 40, h: 64 };
    const objFile = { x: 480, y: 150, h: 64 };
    const ttyG = sv("g", {}, sv("rect", { x: objTty.x, y: objTty.y, width: 250, height: objTty.h, rx: 4, class: "s-box" }),
      sv("text", { x: objTty.x + 14, y: objTty.y + 27, class: "s-text", text: "/dev/pts/0" }),
      sv("text", { x: objTty.x + 14, y: objTty.y + 46, class: "s-text-sm", text: "the terminal · read/write" }));
    const fileName = sv("text", { x: objFile.x + 14, y: objFile.y + 27, class: "s-text" });
    const fileFlags = sv("text", { x: objFile.x + 14, y: objFile.y + 46, class: "s-text-sm" });
    const fileG = sv("g", { class: "anim" }, sv("rect", { x: objFile.x, y: objFile.y, width: 250, height: objFile.h, rx: 4, class: "s-box-soft" }), fileName, fileFlags);
    svg.append(ttyG, fileG);
    const paths = [0, 1, 2, 3].map(() => { const p = sv("path", { class: "s-line" }); svg.insertBefore(p, svg.firstChild); return p; });
    const ends = [null, null, null, null];

    function curve(x1, y1, x2, y2) { return `M ${x1} ${y1} C ${x1 + 120} ${y1}, ${x2 - 120} ${y2}, ${x2} ${y2}`; }
    function setLink(i, target, visible) {
      const y1 = rowY(i) + 18, x1 = 190;
      const to = target === "tty" ? [objTty.x, objTty.y + 22 + i * 8] : [objFile.x, objFile.y + objFile.h / 2];
      const from = ends[i] || to;
      ends[i] = to;
      paths[i].style.opacity = visible ? 1 : 0;
      paths[i].style.transition = "opacity .35s";
      tween(from, to, 450, ([x, y]) => paths[i].setAttribute("d", curve(x1, y1, x, y)));
    }

    const codeBox = el("div", { class: "excerpt", style: "margin:12px 0 0" }, el("pre", {}));
    const text = el("div", { class: "readout" });
    const st = stepper(body, () => 5, render);
    body.append(svg, codeBox, text);

    function render(i) {
      optBtns.forEach((b, k) => b.setAttribute("aria-pressed", opts[k] === cur));
      optBtns.forEach((b, k) => { b.style.borderStyle = opts[k] === cur ? "solid" : ""; b.style.color = opts[k] === cur ? "var(--blue)" : ""; b.style.borderColor = opts[k] === cur ? "var(--blue)" : ""; });
      const t = cur.target;
      const links = [["tty", true], ["tty", true], ["tty", true], ["file", false]];
      let code, msg, fileVis = false, row3 = false;
      progLabel.textContent = i >= 4 ? `· NOW RUNNING ${cur.prog.toUpperCase()}` : "· STILL RUNNING SHELL CODE";
      if (i === 0) { code = "pid_t pid = fork();   /* in the child */"; msg = "Right after <code>fork</code>, the child has the shell's table: 0, 1 and 2 all point at the terminal."; }
      if (i >= 1) { fileVis = true; row3 = true; links[3] = ["file", true]; }
      if (i === 1) { code = `int fd = open("${cur.file}", ${cur.flags});   /* returns 3 */`; msg = `<code>open</code> always returns the lowest free descriptor. 0, 1 and 2 are taken, so the file gets <strong>3</strong>.`; }
      if (i >= 2) links[t] = ["file", true];
      if (i === 2) { code = `dup2(fd, ${t});   /* ${["STDIN", "STDOUT", "STDERR"][t]}_FILENO */`; msg = `<code>dup2(3, ${t})</code> closes ${t} and makes it point at the same open file as 3. Two descriptors, one file.`; }
      if (i >= 3) { row3 = false; links[3] = ["file", false]; }
      if (i === 3) { code = "close(fd);"; msg = "The spare descriptor 3 is closed. If it weren't, the program would start with an extra open file it doesn't know about."; }
      if (i === 4) { code = `execvp("${cur.prog}", argv);`; msg = `<code>exec</code> replaces the program but keeps the table. <code>${cur.prog}</code> uses fd ${t} as it always would, and the data goes ${t === 0 ? "from" : "to"} <code>${cur.file}</code>.`; }
      fileName.textContent = cur.file;
      fileFlags.textContent = cur.flags.split(",")[0];
      fileG.style.opacity = fileVis ? 1 : 0;
      rows[3].style.opacity = row3 ? 1 : 0;
      rows.forEach((g, k) => g.querySelector("rect").setAttribute("class", (i >= 2 && k === t) ? "s-box-soft" : "s-box"));
      links.forEach(([target, vis], k) => setLink(k, target, vis));
      codeBox.querySelector("pre").textContent = code;
      text.innerHTML = msg;
    }
    st.go(0);
  };

  /* ================================================================ */
  /* FIG_006: pipes and who holds which end                           */
  /* ================================================================ */
  figures.pipes = function (body) {
    const NAMES = ["ls", "grep c", "sort", "head -n 3"];
    let n = 3, bug = false;
    const nBtns = [2, 3, 4].map((k) => el("button", { class: "btn", type: "button", text: `${k} commands`, onclick: () => { n = k; rebuild(); } }));
    const bugBtn = el("button", { class: "btn", type: "button", text: "Bug: parent keeps the write end", onclick: () => { bug = !bug; rebuild(); } });
    body.append(el("div", { class: "controls" }, nBtns, el("span", { class: "spacer" }), bugBtn));

    function simulate() {
      const steps = [];
      const shell = new Set();
      const kids = [];
      let prev = null;
      const snap = (title, code, text) => steps.push({
        title, code, text,
        shell: new Set(shell),
        kids: kids.map((k) => ({ name: k.name, holds: new Set(k.holds), stdin: k.stdin, stdout: k.stdout, wired: k.wired })),
      });
      const list = (set) => [...set].map((e) => `p${e.slice(1)}.${e[0] === "w" ? "write" : "read"}`).join(", ") || "nothing";
      for (let i = 0; i < n; i++) {
        if (i < n - 1) {
          shell.add("w" + i); shell.add("r" + i);
          snap(`pipe() for p${i}`, "pipe(pipefds);", `Pipe <strong>p${i}</strong> is created <em>before</em> forking, so the child about to be made inherits it. The shell holds both ends.`);
          steps[steps.length - 1].created = [i];
        }
        const kid = { name: NAMES[i], holds: new Set(shell), stdin: "tty", stdout: "tty", wired: false };
        kids.push(kid);
        snap(`fork() child ${i + 1}`, "pid_t pid = fork();", `<code>${NAMES[i]}</code>'s process starts as a copy of the shell and inherits every descriptor the shell holds: ${list(kid.holds)}.`);
        if (i > 0) kid.stdin = "r" + (i - 1);
        if (i < n - 1) { kid.holds.delete("r" + i); kid.stdout = "w" + i; }
        kid.wired = true;
        const parts = [];
        if (i > 0) parts.push(`<code>dup2</code> p${i - 1}.read onto stdin`);
        if (i < n - 1) parts.push(`close p${i}.read (it never reads its own output) and <code>dup2</code> p${i}.write onto stdout`);
        const extra = [...kid.holds].filter((e) => e !== kid.stdin && e !== kid.stdout);
        snap(`child ${i + 1} wires itself`, i < n - 1 ? "dup2(pipefds[1], STDOUT_FILENO);" : "dup2(prev_pipe_read, STDIN_FILENO);",
          (parts.length ? parts.join(", then ") + ". " : "") + (extra.length ? `It still holds <strong>${list(new Set(extra))}</strong>, inherited and never closed.` : "It holds nothing it doesn't use.") + " Then it calls <code>exec</code>.");
        const closed = [];
        if (prev !== null) { shell.delete("r" + prev); closed.push(`p${prev}.read`); }
        if (i < n - 1) {
          if (!bug) { shell.delete("w" + i); closed.push(`p${i}.write`); }
          prev = i;
        }
        snap("parent closes its copies", i < n - 1 ? (bug ? "/* close(pipefds[1]) forgotten */" : "close(pipefds[1]);   prev_pipe_read = pipefds[0];") : "close(prev_pipe_read);",
          (closed.length ? `The shell closes ${closed.join(" and ")}. ` : "") + (i < n - 1 ? `It keeps p${i}.read for the next command.` : "") + ` It now holds: ${list(shell)}.`);
      }
      // verdict
      const last = steps[steps.length - 1];
      const verdicts = [];
      for (let k = 0; k < n - 1; k++) {
        const holders = [];
        if (last.shell.has("w" + k)) holders.push("the shell");
        last.kids.forEach((c, j) => { if (j !== k && c.holds.has("w" + k)) holders.push(`<code>${c.name}</code>`); });
        verdicts.push(holders.length
          ? `<span style="color:var(--red)">p${k}: when <code>${NAMES[k]}</code> exits, ${holders.join(" and ")} still hold${holders.length > 1 ? "" : "s"} the write end, so <code>${NAMES[k + 1]}</code> never sees end-of-file. The pipeline hangs.</span>`
          : `p${k}: once <code>${NAMES[k]}</code> exits, no write end is left, so <code>${NAMES[k + 1]}</code> reads end-of-file and finishes.`);
      }
      snap("all stages running", "return put_job_in_foreground(job, false);", verdicts.join("<br>"));
      return steps;
    }

    let steps = simulate();
    const svgWrap = el("div");
    const table = el("div", { style: "overflow-x:auto;margin-top:12px" });
    const codeBox = el("div", { class: "excerpt", style: "margin:12px 0 0" }, el("pre", {}));
    const text = el("div", { class: "readout" });
    const st = stepper(body, () => steps.length, render);
    body.append(svgWrap, table, codeBox, text);

    function rebuild() {
      nBtns.forEach((b, k) => b.setAttribute("aria-pressed", [2, 3, 4][k] === n));
      bugBtn.setAttribute("aria-pressed", bug);
      steps = simulate();
      st.go(0);
    }

    function render(i) {
      const s = steps[i];
      const W = 900, H = 170;
      const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Pipeline processes and pipes" });
      const bw = 128, gap = (W - 40 - n * bw) / Math.max(1, n - 1);
      const kx = (k) => 20 + k * (bw + gap);
      svg.appendChild(sv("rect", { x: 20, y: 6, width: 150, height: 40, rx: 4, class: "s-box" }));
      svg.appendChild(sv("text", { x: 34, y: 31, class: "s-text", text: "forge (shell)" }));
      for (let k = 0; k < n - 1; k++) {
        const px = kx(k) + bw + gap / 2 - 30;
        const exists = s.shell.has("w" + k) || s.shell.has("r" + k) || s.kids.some((c) => c.holds.has("w" + k) || c.holds.has("r" + k));
        if (!exists && !steps.slice(0, i + 1).some((x) => x.created && x.created.includes(k))) continue;
        svg.appendChild(sv("rect", { x: px, y: 112, width: 60, height: 22, rx: 11, class: "s-box-soft" }));
        svg.appendChild(sv("text", { x: px + 30, y: 127, "text-anchor": "middle", class: "s-text-blue", text: "p" + k }));
        const writer = s.kids[k], reader = s.kids[k + 1];
        if (writer && writer.stdout === "w" + k) svg.appendChild(sv("line", { x1: kx(k) + bw, y1: 123, x2: px, y2: 123, class: "s-line" }));
        if (reader && reader.stdin === "r" + k) svg.appendChild(sv("line", { x1: px + 60, y1: 123, x2: kx(k + 1), y2: 123, class: "s-line" }));
        if (s.shell.has("w" + k) || s.shell.has("r" + k)) svg.appendChild(sv("path", { d: `M 170 26 C ${px + 30} 26, ${px + 30} 60, ${px + 30} 112`, class: "s-faint" }));
      }
      s.kids.forEach((c, k) => {
        svg.appendChild(sv("path", { d: `M 95 46 C 95 80, ${kx(k) + bw / 2} 70, ${kx(k) + bw / 2} 100`, class: "s-faint" }));
        svg.appendChild(sv("rect", { x: kx(k), y: 100, width: bw, height: 46, rx: 4, class: "s-box" }));
        svg.appendChild(sv("text", { x: kx(k) + bw / 2, y: 128, "text-anchor": "middle", class: "s-text", text: c.wired ? c.name : "(copy of shell)" }));
      });
      svg.appendChild(sv("text", { x: W - 20, y: 24, "text-anchor": "end", class: "s-text-sm", text: s.title.toUpperCase() }));
      svgWrap.replaceChildren(svg);

      // matrix
      const ends = [];
      for (let k = 0; k < n - 1; k++) ends.push("w" + k, "r" + k);
      const head = el("tr", {}, el("th", { text: "process" }), ends.map((e) => el("th", { text: `p${e.slice(1)} ${e[0] === "w" ? "write" : "read"}` })));
      const mk = (name, holds, c) => el("tr", {}, el("td", { text: name }), ends.map((e) => {
        if (!holds.has(e)) return el("td", { style: "color:var(--faint)", text: "·" });
        let label = "held", color = "var(--blue)";
        if (c && c.stdin === e) label = "fd 0";
        else if (c && c.stdout === e) label = "fd 1";
        else if (c && c.wired) { label = "leaked"; color = "var(--red)"; }
        else if (!c && i === steps.length - 1) { label = "leaked"; color = "var(--red)"; }
        return el("td", { style: `color:${color};font-family:var(--mono);font-size:12px`, text: "● " + label });
      }));
      table.replaceChildren(el("table", { class: "sigtable", style: "cursor:default" }, el("thead", {}, head),
        el("tbody", {}, mk("shell", s.shell, null), s.kids.map((c) => mk(c.name, c.holds, c)))));
      table.querySelectorAll("tr").forEach((tr) => (tr.style.cursor = "default"));
      codeBox.querySelector("pre").textContent = s.code;
      text.innerHTML = s.text;
    }
    rebuild();
  };

  /* ================================================================ */
  /* FIG_007: where cd runs                                            */
  /* ================================================================ */
  figures.builtin = function (body) {
    const HOME = "/home/dev/ForgeShell";
    let shellCwd = HOME, busy = false;
    const shellBox = el("div", { class: "cmd" });
    const childBox = el("div", { class: "cmd", style: "opacity:.3;border-style:dashed" });
    const log = el("div", { class: "terminal", style: "height:150px" });
    const a = el("button", { class: "btn", type: "button", text: "cd /tmp as a builtin", onclick: () => run(true) });
    const b = el("button", { class: "btn", type: "button", text: "cd /tmp as a child process", onclick: () => run(false) });
    const r = el("button", { class: "btn", type: "button", text: "Reset", onclick: () => { if (busy) return; shellCwd = HOME; log.textContent = ""; draw(null); } });
    body.append(el("div", { class: "controls" }, a, b, el("span", { class: "spacer" }), r), el("div", { class: "split" }, shellBox, childBox), el("div", { style: "height:14px" }), log);

    function draw(child) {
      shellBox.replaceChildren(el("h4", { text: "SHELL · PID 4100" }), el("dl", {}, el("dt", { text: "cwd" }), el("dd", { text: shellCwd })));
      if (child) {
        childBox.style.opacity = child.gone ? ".3" : "1";
        childBox.style.borderStyle = child.gone ? "dashed" : "solid";
        childBox.replaceChildren(el("h4", { text: "CHILD · PID 4101" + (child.gone ? " (exited)" : "") }), el("dl", {}, el("dt", { text: "cwd" }), el("dd", { text: child.cwd })));
      } else {
        childBox.style.opacity = ".3"; childBox.style.borderStyle = "dashed";
        childBox.replaceChildren(el("h4", { text: "CHILD" }), el("p", { class: "ok-line", style: "margin:0", text: "(none)" }));
      }
    }
    function say(line, cls) { log.appendChild(el("div", { class: cls || "", text: line })); log.scrollTop = log.scrollHeight; }
    function seq(fns) { busy = true; let k = 0; (function nx() { if (k >= fns.length) { busy = false; return; } fns[k++](); setTimeout(nx, 650); })(); }
    function run(inShell) {
      if (busy) return;
      shellCwd = HOME; log.textContent = ""; draw(null);
      if (inShell) {
        seq([
          () => say("forge> cd /tmp", "p"),
          () => { say("is_builtin(\"cd\") → true, single command: run in the shell, no fork", "m"); },
          () => { shellCwd = "/tmp"; draw(null); say("chdir(\"/tmp\") in PID 4100 → 0", "m"); },
          () => say("forge> pwd   → /tmp", "p"),
        ]);
      } else {
        const child = { cwd: HOME, gone: false };
        seq([
          () => say("forge> cd /tmp   (pretend cd were a program)", "p"),
          () => { draw(child); say("fork() → child 4101 inherits cwd " + HOME, "m"); },
          () => { child.cwd = "/tmp"; draw(child); say("chdir(\"/tmp\") in PID 4101 → 0", "m"); },
          () => { child.gone = true; draw(child); say("child exits; its cwd goes with it", "m"); },
          () => say("forge> pwd   → " + shellCwd + "   (unchanged)", "p"),
        ]);
      }
    }
    draw(null);
  };

  /* ================================================================ */
  /* FIG_008: signal dispositions                                      */
  /* ================================================================ */
  figures.signals = function (body) {
    const rows = [
      ["SIGINT", 2, "Ctrl+C", "terminate", "ign", "dfl", "Sent by the terminal to the foreground group. The shell ignores it. A child resets it, so Ctrl+C kills <code>sleep</code> and the shell records 130. During <code>monitor</code> the shell briefly installs a handler so Ctrl+C ends the monitor loop."],
      ["SIGQUIT", 3, "Ctrl+\\", "core dump", "ign", "dfl", "Like Ctrl+C but harsher: the default action also writes a core dump. Ignored by the shell, default in children."],
      ["SIGTSTP", 20, "Ctrl+Z", "stop", "ign", "dfl", "Stops the foreground group. <code>waitpid</code> with <code>WUNTRACED</code> returns, the shell prints <code>[1]+ Stopped</code> and takes the terminal back. A program may catch or ignore it, as <code>examples/sigtrap.c</code> does."],
      ["SIGTTIN", 21, "background read", "stop", "ign", "dfl", "Sent to a background group that reads from the terminal. This is how <code>cat &amp;</code> ends up stopped. The shell ignores it so it can never be stopped this way itself."],
      ["SIGTTOU", 22, "background tcsetpgrp", "stop", "ign", "dfl", "Sent to a background group that changes terminal settings or calls <code>tcsetpgrp</code>. The shell ignores it so it can take the terminal back. A child calls <code>tcsetpgrp</code> <em>before</em> resetting this signal, while it's still ignored."],
      ["SIGCHLD", 17, "child changed state", "ignore", "hdl", "dfl", "The shell installs a handler that only sets a flag (with <code>SA_RESTART</code> and <code>SA_NOCLDSTOP</code>). Reaping happens in the main loop. Leaving it at <code>SIG_IGN</code> would make Linux reap children automatically and lose their exit statuses."],
      ["SIGCONT", 18, "fg / bg", "continue", "dfl", "dfl", "Resumes a stopped process. <code>fg</code> and <code>bg</code> send it to the whole group with <code>kill(-pgid, SIGCONT)</code>. Sending it to a running process does nothing."],
      ["SIGPIPE", 13, "write to a closed pipe", "terminate", "dfl", "dfl", "Kills a writer whose readers are all gone. That's how <code>yes | head -n 1</code> ends: <code>head</code> exits, and the next write by <code>yes</code> raises SIGPIPE."],
      ["SIGSEGV", 11, "bad memory access", "core dump", "dfl", "dfl", "A crash. The shell reports <code>Segmentation fault (core dumped)</code> and status 139. The test suite triggers it with <code>kill -SEGV $$</code>."],
      ["SIGKILL", 9, "kill -9", "terminate", "fixed", "fixed", "Can't be caught, blocked or ignored. The kernel always delivers it."],
      ["SIGSTOP", 19, "kill -STOP", "stop", "fixed", "fixed", "The uncatchable version of SIGTSTP."],
    ];
    const PILL = { ign: ["ignored", "ign"], dfl: ["default", "dfl"], hdl: ["handler", "hdl"], fixed: ["can't change", "ign"] };
    const out = el("div", { class: "readout" });
    const tbody = el("tbody");
    const table = el("div", { style: "overflow-x:auto" }, el("table", { class: "sigtable" },
      el("thead", {}, el("tr", {}, ["signal", "comes from", "default action", "in the shell", "in a child"].map((h) => el("th", { text: h })))), tbody));
    rows.forEach((r, k) => {
      const tr = el("tr", { tabindex: 0 },
        el("td", { text: `${r[0]} (${r[1]})` }), el("td", { text: r[2] }), el("td", { text: r[3] }),
        el("td", {}, el("span", { class: "pill " + PILL[r[4]][1], text: PILL[r[4]][0] })),
        el("td", {}, el("span", { class: "pill " + PILL[r[5]][1], text: PILL[r[5]][0] })));
      const pick = () => { tbody.querySelectorAll("tr").forEach((x) => x.classList.remove("sel")); tr.classList.add("sel"); out.innerHTML = `<span class="tag">${r[0]}</span>${r[6]}`; };
      tr.addEventListener("click", pick);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      tbody.appendChild(tr);
      if (k === 0) setTimeout(pick, 0);
    });
    body.append(table, out);
  };

  /* ================================================================ */
  /* FIG_009: job control simulator                                    */
  /* ================================================================ */
  figures.jobsim = function (body) {
    const SHELL = 4100;
    let jobs, fg, nextPid, pending, lines, sys;
    const term = el("div", { class: "terminal", "aria-live": "polite" });
    const sysLine = el("div", { class: "readout", style: "font-family:var(--mono);font-size:12px;line-height:1.7" });
    const diagram = el("div");
    const B = (label, fn, title) => el("button", { class: "btn", type: "button", text: label, title: title || "", onclick: fn });
    const btn = {
      run: B("sleep 100", () => start(false)),
      bgrun: B("sleep 100 &", () => start(true)),
      ctrlz: B("Ctrl+Z", () => key("Z")),
      ctrlc: B("Ctrl+C", () => key("C")),
      jobs: B("jobs", () => cmdJobs()),
      fg: B("fg", () => cmdFg()),
      bg: B("bg", () => cmdBg()),
      time: B("100 s pass", () => pass()),
      reset: B("Reset", () => reset()),
    };
    body.append(el("div", { class: "controls" }, Object.values(btn)), el("div", { class: "split" }, term, diagram), sysLine);

    function reset() {
      jobs = []; fg = null; nextPid = 4123; pending = []; lines = []; sys = "The shell owns the terminal and is blocked in <code>getline()</code>, waiting for a command.";
      prompt(); draw();
    }
    function out(t, cls) { lines.push({ t, cls }); }
    function prompt() { out("forge> ", "p"); }
    function typed(cmd) { const last = lines[lines.length - 1]; last.t += cmd; }
    function nextId() { return jobs.reduce((m, j) => Math.max(m, j.id), 0) + 1; }
    function recent() { return jobs[jobs.length - 1]; }
    function notifyPending() {
      // check_and_notify_jobs() runs before every prompt
      const done = jobs.filter((j) => j.state === "Done");
      if (done.length) {
        lines.pop();
        done.forEach((j) => out(`[${j.id}]+ Done                    ${j.cmd}`));
        jobs = jobs.filter((j) => j.state !== "Done");
        prompt();
        return done;
      }
      return [];
    }
    function start(bg) {
      const reaped = notifyPending();
      const cmd = bg ? "sleep 100 &" : "sleep 100";
      typed(cmd);
      const job = { id: nextId(), pgid: nextPid++, cmd, state: "Running" };
      jobs.push(job);
      const pre = reaped.length ? `waitpid(-1, WNOHANG) reaped ${reaped.map((j) => j.pgid).join(", ")} · ` : "";
      if (bg) {
        out(`[${job.id}] ${job.pgid}`);
        prompt();
        sys = pre + `fork() → ${job.pgid} · setpgid(${job.pgid}, ${job.pgid}) in parent and child · execvp("sleep") · no wait: the shell keeps the terminal.`;
      } else {
        fg = job;
        sys = pre + `fork() → ${job.pgid} · setpgid(${job.pgid}, ${job.pgid}) · tcsetpgrp(tty, ${job.pgid}) · execvp("sleep") · waitpid(-${job.pgid}, WUNTRACED) blocks.`;
      }
      draw();
    }
    function key(k) {
      if (!fg) {
        const last = lines[lines.length - 1]; last.t += k === "C" ? "^C" : "^Z";
        prompt();
        sys = `The terminal sends ${k === "C" ? "SIGINT" : "SIGTSTP"} to the foreground group, which is the shell's (${SHELL}). The shell ignores it (SIG_IGN) and keeps waiting for input.`;
        draw(); return;
      }
      const j = fg;
      if (k === "Z") {
        j.state = "Stopped";
        out("^Z");
        out(`[${j.id}]+ Stopped                 ${j.cmd}`);
        sys = `tty → SIGTSTP to group ${j.pgid}: stopped · waitpid returns, WIFSTOPPED · tcsetpgrp(tty, ${SHELL}) · tcsetattr(saved modes) · status 148.`;
      } else {
        out("^C");
        jobs = jobs.filter((x) => x !== j);
        sys = `tty → SIGINT to group ${j.pgid}: terminated · waitpid returns, WIFSIGNALED, WTERMSIG = 2 · status 130 · tcsetpgrp(tty, ${SHELL}).`;
      }
      fg = null;
      prompt();
      draw();
    }
    function cmdJobs() {
      notifyPending();
      typed("jobs");
      const r = recent();
      jobs.forEach((j) => out(`[${j.id}]${j === r ? "+" : "-"} ${j.state.padEnd(10)} ${j.cmd}`));
      prompt();
      sys = "check_and_notify_jobs() reaps first, then the table is printed. A builtin, so no fork.";
      draw();
    }
    function cmdFg() {
      notifyPending();
      typed("fg");
      const j = recent();
      if (!j) { out("forge: error: fg: current: no such job"); prompt(); sys = "No jobs in the table."; draw(); return; }
      j.state = "Running"; j.cmd = j.cmd.replace(/ &$/, "");
      out(j.cmd);
      fg = j;
      sys = `tcsetpgrp(tty, ${j.pgid}) · kill(-${j.pgid}, SIGCONT) · waitpid(-${j.pgid}, WUNTRACED) blocks. The job has the terminal again.`;
      draw();
    }
    function cmdBg() {
      notifyPending();
      typed("bg");
      const j = recent();
      if (!j) { out("forge: error: bg: current: no such job"); prompt(); sys = "No jobs in the table."; draw(); return; }
      const was = j.state;
      j.state = "Running";
      out(`[${j.id}]+ ${j.cmd.replace(/ &$/, "")} &`);
      prompt();
      sys = `kill(-${j.pgid}, SIGCONT)` + (was === "Running" ? " (it was already running, so nothing changes)" : ": the job runs again, but the shell keeps the terminal.");
      draw();
    }
    function pass() {
      const running = jobs.filter((j) => j.state === "Running");
      if (!running.length) { sys = "Nothing is running. Stopped jobs don't make progress."; draw(); return; }
      running.forEach((j) => (j.state = "Done"));
      if (fg && fg.state === "Done") {
        const j = fg;
        jobs = jobs.filter((x) => x !== j);
        fg = null;
        prompt();
        sys = `sleep in group ${j.pgid} exits · waitpid returns, WIFEXITED, status 0 · tcsetpgrp(tty, ${SHELL}). Background jobs that finished are reported before the <em>next</em> prompt.`;
      } else {
        sys = "Background jobs finished. They're zombies until the shell reaps them in check_and_notify_jobs(), which runs before the next prompt, so run any command to see the Done line.";
      }
      draw();
    }
    function draw() {
      term.replaceChildren(...lines.map((l) => el("div", { class: l.cls || "", text: l.t })));
      term.scrollTop = term.scrollHeight;
      const blocked = !!fg;
      [btn.run, btn.bgrun, btn.jobs, btn.fg, btn.bg].forEach((b) => (b.disabled = blocked));
      const fgId = fg ? fg.pgid : SHELL;
      const card = (title, pgid, state, isFg) => el("div", { class: "cmd", style: `margin-bottom:8px;${isFg ? "box-shadow:inset 3px 0 0 var(--blue)" : "border-color:var(--rule)"}` },
        el("h4", { style: isFg ? "" : "color:var(--muted)", text: title + (isFg ? "  · FOREGROUND" : "") }),
        el("dl", {}, el("dt", { text: "pgid" }), el("dd", { text: String(pgid) }), el("dt", { text: "state" }), el("dd", { style: state === "Stopped" ? "color:var(--amber)" : state === "Done" ? "color:var(--muted)" : "", text: state })));
      diagram.replaceChildren(
        el("div", { class: "readout", style: "margin:0 0 10px;font-family:var(--mono);font-size:12px" }, el("span", { class: "tag", text: "terminal" }), `tcgetpgrp(tty) = ${fgId}`),
        card("FORGE (SHELL)", SHELL, blocked ? "blocked in waitpid" : "reading input", !fg),
        ...jobs.map((j) => card(`[${j.id}] ${j.cmd}`, j.pgid, j.state, fg === j)));
      sysLine.innerHTML = `<span class="tag">behind the scenes</span>${sys}`;
    }
    reset();
  };

  /* ================================================================ */
  /* FIG_010: the setpgid race                                         */
  /* ================================================================ */
  figures.race = function (body) {
    let order = "parent", both = true;
    const oBtns = [["parent", "parent runs first"], ["child", "child runs first"]].map(([k, l]) => el("button", { class: "btn", type: "button", text: l, onclick: () => { order = k; draw(); } }));
    const bBtn = el("button", { class: "btn", type: "button", text: "parent also calls setpgid", onclick: () => { both = !both; draw(); } });
    const svgWrap = el("div");
    const out = el("div", { class: "readout" });
    body.append(el("div", { class: "controls" }, oBtns, el("span", { class: "spacer" }), bBtn), svgWrap, out);

    function events() {
      const E = [];
      const ok = (lane, t) => E.push({ lane, t, ok: true });
      const bad = (lane, t, why) => E.push({ lane, t, ok: false, why });
      let group = false;
      const P = [], C = [];
      if (order === "parent") {
        if (both) { ok("P", "setpgid(4123, 4123)"); group = true; }
        if (group) { ok("P", "tcsetpgrp(tty, 4123)"); ok("P", "waitpid(-4123)"); }
        else { bad("P", "tcsetpgrp(tty, 4123)", "EPERM: no group 4123 yet"); bad("P", "waitpid(-4123)", "ECHILD: no child in group 4123"); }
        ok("C", group ? "setpgid(0, 4123) (already)" : "setpgid(0, 4123)"); group = true;
        ok("C", "tcsetpgrp(tty, 4123)");
        ok("C", "execvp(\"sort\")");
      } else {
        ok("C", "setpgid(0, 4123)"); group = true;
        ok("C", "tcsetpgrp(tty, 4123)");
        ok("C", "execvp(\"sort\")");
        if (both) ok("P", "setpgid(4123, 4123) (already)");
        ok("P", "tcsetpgrp(tty, 4123)");
        ok("P", "waitpid(-4123)");
      }
      return E;
    }
    function draw() {
      oBtns.forEach((b, k) => b.setAttribute("aria-pressed", ["parent", "child"][k] === order));
      bBtn.setAttribute("aria-pressed", both);
      const E = events();
      const W = 940, H = 230, x0 = 150, dx = (W - x0 - 90) / Math.max(1, E.length - 1);
      const laneY = { P: 80, C: 150 };
      const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Timeline of parent and child after fork" });
      svg.append(sv("text", { x: 10, y: laneY.P + 4, class: "s-text", text: "parent" }), sv("text", { x: 10, y: laneY.C + 4, class: "s-text", text: "child" }));
      svg.append(sv("line", { x1: x0 - 20, y1: laneY.P, x2: W - 20, y2: laneY.P, class: "s-faint" }), sv("line", { x1: x0 - 20, y1: laneY.C, x2: W - 20, y2: laneY.C, class: "s-faint" }));
      svg.append(sv("text", { x: x0 - 20, y: 20, class: "s-text-sm", text: "TIME →   (fork() just returned in both)" }));
      E.forEach((e, k) => {
        const x = x0 + k * dx, y = laneY[e.lane];
        svg.appendChild(sv("circle", { cx: x, cy: y, r: 6, class: e.ok ? "s-node" : "", fill: e.ok ? null : "var(--paper)", stroke: e.ok ? null : "var(--red)", "stroke-width": 1.6 }));
        if (!e.ok) svg.appendChild(sv("path", { d: `M ${x - 3} ${y - 3} L ${x + 3} ${y + 3} M ${x + 3} ${y - 3} L ${x - 3} ${y + 3}`, class: "s-red" }));
        const stagger = (k % 2) * 15;
        const ty = e.lane === "P" ? y - 14 - stagger : y + 24 + stagger;
        const label = e.t.replace(" (already)", "");
        svg.appendChild(sv("text", { x, y: ty, "text-anchor": "middle", class: e.ok ? "s-text-sm" : "s-text-red", text: label }));
        if (e.t.includes("(already)")) svg.appendChild(sv("text", { x, y: e.lane === "P" ? ty - 12 : ty + 12, "text-anchor": "middle", class: "s-text-sm", text: "no-op: already in group" }));
        if (!e.ok) svg.appendChild(sv("text", { x, y: ty - 13, "text-anchor": "middle", class: "s-text-red", text: e.why }));
      });
      svgWrap.replaceChildren(svg);
      const fails = E.filter((e) => !e.ok);
      out.innerHTML = fails.length
        ? `<span class="tag" style="color:var(--red)">broken</span>The parent ran first and group 4123 didn't exist yet. <code>tcsetpgrp</code> fails, and worse, <code>waitpid(-4123)</code> fails with <code>ECHILD</code>. <code>wait_for_job</code> treats that as "everything already reaped", so the shell would print a prompt while <code>sort</code> is still running.`
        : `<span class="tag">fine</span>${order === "parent" ? "The parent's own <code>setpgid</code> created the group before it needed it. The child's later call changes nothing." : "The child created the group first. The parent's call, if any, is a harmless no-op."} Every later call finds the group.`;
    }
    draw();
  };

  /* ================================================================ */
  /* FIG_011: /proc/<pid>/stat decoder                                 */
  /* ================================================================ */
  figures.stat = function (body) {
    const F = [
      ["pid", "25978", "Process ID. ForgeShell already knows it, since it's the argument to <code>inspect</code>."],
      ["comm", "leak", "Program name in parentheses, cut to 15 characters by the kernel. It can contain spaces and <code>)</code>."],
      ["state", "S", "R running, S sleeping, D disk sleep, Z zombie, T stopped, t traced, X dead, I idle."],
      ["ppid", "25877", "Parent's PID. For a job started by ForgeShell, this is the shell."],
      ["pgrp", "25978", "Process group. Equal to the PID, so this process leads its job's group."],
      ["session", "25877", "Session ID: the PID of the session leader, often the shell that owns the terminal."],
      ["tty_nr", "34816", "Controlling terminal, encoded as a device number."],
      ["tpgid", "25877", "Foreground process group of that terminal. Here it's the shell's group, because leak runs in the background."],
      ["flags", "4194304", "Kernel flags (PF_*)."],
      ["minflt", "76862", "Minor page faults: pages mapped without disk I/O. About 300 MB / 4 KB, one per page leak touched."],
      ["cminflt", "0", "Minor faults of waited-for children."],
      ["majflt", "0", "Major faults: pages that had to be read from disk."],
      ["cmajflt", "0", "Major faults of waited-for children."],
      ["utime", "0", "Ticks spent running the program's own code."],
      ["stime", "8", "Ticks spent in the kernel on its behalf. Here that's handling those page faults."],
      ["cutime", "0", "User ticks of waited-for children."],
      ["cstime", "0", "System ticks of waited-for children."],
      ["priority", "20", "Scheduling priority."],
      ["nice", "0", "Nice value, from -20 to 19."],
      ["num_threads", "1", "Number of threads."],
      ["itrealvalue", "0", "Obsolete, always 0."],
      ["starttime", "1234567", "Start time in ticks after boot. Runtime = uptime - starttime / ticks per second."],
      ["vsize", "317415424", "Virtual memory size in bytes, the same as VmSize."],
      ["rss", "77310", "Resident set size in pages: 77310 × 4 KB is about 302 MB, the same as VmRSS."],
      ["rsslim", "18446744073709551615", "RSS limit in bytes (here: unlimited)."],
      ["startcode", "94558270615552", "Address where the program's code starts."],
      ["endcode", "94558270618081", "Address where the program's code ends."],
      ["startstack", "140725926312864", "Bottom of the stack."],
      ["kstkesp", "0", "Saved stack pointer (hidden from unprivileged readers)."],
      ["kstkeip", "0", "Saved instruction pointer (hidden)."],
      ["signal", "0", "Obsolete pending-signal bitmap. Use /proc/pid/status instead."],
      ["blocked", "0", "Obsolete blocked-signal bitmap."],
      ["sigignore", "0", "Obsolete ignored-signal bitmap."],
      ["sigcatch", "0", "Obsolete caught-signal bitmap."],
      ["wchan", "0", "Kernel function the process is waiting in (hidden)."],
      ["nswap", "0", "Not maintained."],
      ["cnswap", "0", "Not maintained."],
      ["exit_signal", "17", "Signal sent to the parent on death: 17 is SIGCHLD."],
      ["processor", "3", "CPU it last ran on."],
      ["rt_priority", "0", "Real-time priority."],
      ["policy", "0", "Scheduling policy (0 = normal)."],
      ["delayacct_blkio_ticks", "0", "Ticks spent waiting for block I/O."],
      ["guest_time", "0", "Time running a virtual CPU for a guest."],
      ["cguest_time", "0", "Guest time of children."],
      ["start_data", "94558270626928", "Start of the data segment."],
      ["end_data", "94558270627632", "End of the data segment."],
      ["start_brk", "94558284472320", "Start of the heap."],
      ["arg_start", "140725926318603", "Where the arguments (cmdline) start in memory."],
      ["arg_end", "140725926318626", "Where the arguments end."],
      ["env_start", "140725926318626", "Where the environment starts."],
      ["env_end", "140725926322667", "Where the environment ends."],
      ["exit_code", "0", "Exit status, as returned by waitpid."],
    ];
    const USED = new Set([2, 3, 4, 5, 6, 14, 15, 20, 22]);
    let comm = "leak", sel = 2;
    const input = el("input", { class: "field", type: "text", value: comm, maxlength: 15, spellcheck: "false", "aria-label": "Program name" });
    const chips = el("div", { class: "controls", style: "margin:10px 0 0" }, ["leak", "my prog", "a) b", "evil) S 1 1"].map((v) => el("button", { class: "chip", type: "button", text: v, onclick: () => { input.value = v; comm = v; draw(); } })));
    const line = el("div", { class: "statline" });
    const info = el("div", { class: "readout" });
    const naive = el("div", { class: "readout", style: "font-size:15px" });
    body.append(el("div", { class: "slider-row", style: "grid-template-columns:170px 1fr" }, el("label", { text: "program name (comm)" }), input), chips, el("div", { style: "height:14px" }), line, info, naive);
    input.addEventListener("input", () => { comm = input.value; draw(); });

    function draw() {
      line.replaceChildren();
      F.forEach((f, k) => {
        const n = k + 1;
        const v = n === 2 ? `(${comm})` : f[1];
        const span = el("span", { class: "f " + (USED.has(n) ? "used" : n === 1 ? "" : "skip") + (sel === n ? " sel" : ""), text: v, tabindex: 0, role: "button" });
        const pick = () => { sel = n; draw(); };
        span.addEventListener("click", pick);
        span.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        line.append(span, " ");
      });
      const f = F[sel - 1];
      const val = sel === 2 ? comm : f[1];
      info.innerHTML = `<span class="tag">field ${sel} &middot; ${f[0]}</span><code>${esc(val)}</code>&nbsp; ${f[2]} ${USED.has(sel) ? "<strong>Read by ForgeShell.</strong>" : sel === 1 ? "" : '<span style="color:var(--muted)">Skipped with <code>%*</code> or never reached.</span>'}`;
      const raw = `25978 (${comm}) S 25877 25978`;
      const parts = raw.split(" ");
      const open = raw.indexOf("("), close = raw.lastIndexOf(")");
      const safeComm = raw.slice(open + 1, close);
      const safeState = raw.slice(close + 2).split(" ")[0];
      const broke = parts[2] !== "S";
      naive.innerHTML = `<span class="tag">split on spaces</span>field 3 (state) = <code>${esc(parts[2])}</code>, field 4 (ppid) = <code>${esc(parts[3])}</code>` +
        (broke ? ' <span style="color:var(--red)">wrong: every later field is shifted</span>' : ' <span style="color:var(--green)">ok, but only by luck</span>') +
        `<br><span class="tag">first ( and last )</span>comm = <code>${esc(safeComm)}</code>, state = <code>${esc(safeState)}</code> <span style="color:var(--green)">always correct</span>`;
    }
    draw();
  };

  /* ================================================================ */
  /* FIG_012: CPU percentage from two samples                         */
  /* ================================================================ */
  figures.cpu = function (body) {
    let dt = 100, sec = 1;
    const TCK = 100;
    const presets = [["spin, one busy thread", 100, 1], ["leak, sleeping", 0, 1], ["half busy", 50, 1], ["four busy threads", 400, 1], ["slow sampling, busy", 300, 3]];
    const chips = el("div", { class: "controls" }, presets.map(([l, a, b]) => el("button", { class: "chip", type: "button", text: l, onclick: () => { dt = a; sec = b; sync(); } })));
    const r1 = el("input", { type: "range", min: 0, max: 400, value: dt, "aria-label": "ticks used" });
    const o1 = el("output");
    const r2 = el("input", { type: "range", min: 0.5, max: 5, step: 0.5, value: sec, "aria-label": "seconds between samples" });
    const o2 = el("output");
    const formula = el("div", { class: "readout", style: "font-family:var(--mono);font-size:13.5px" });
    const W = 900, H = 90;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "CPU percentage bar" });
    const bar = sv("rect", { x: 10, y: 22, height: 28, rx: 2, class: "s-fill anim" });
    svg.appendChild(sv("rect", { x: 10, y: 22, width: W - 20, height: 28, rx: 2, class: "s-box-mute" }));
    svg.appendChild(bar);
    for (let c = 0; c <= 4; c++) {
      const x = 10 + (W - 20) * c / 4;
      svg.appendChild(sv("line", { x1: x, y1: 14, x2: x, y2: 58, class: "s-faint" }));
      svg.appendChild(sv("text", { x, y: 76, "text-anchor": c === 0 ? "start" : c === 4 ? "end" : "middle", class: "s-text-sm", text: c === 0 ? "0%" : `${c * 100}% · ${c} core${c > 1 ? "s" : ""}` }));
    }
    body.append(chips,
      el("div", { class: "slider-row" }, el("label", { text: "Δ ticks (utime+stime)" }), r1, o1),
      el("div", { class: "slider-row" }, el("label", { text: "seconds between samples" }), r2, o2),
      svg, formula);
    r1.addEventListener("input", () => { dt = +r1.value; update(); });
    r2.addEventListener("input", () => { sec = +r2.value; update(); });
    function sync() { r1.value = dt; r2.value = sec; update(); }
    function update() {
      o1.textContent = dt; o2.textContent = sec.toFixed(1) + " s";
      const pct = (dt / TCK) / sec * 100;
      bar.setAttribute("width", Math.max(0, Math.min(1, pct / 400)) * (W - 20));
      formula.innerHTML = `CPU % = (${dt} ticks ÷ ${TCK} ticks/s) ÷ ${sec.toFixed(1)} s × 100 = <strong style="color:var(--blue)">${pct.toFixed(1)}%</strong>`;
    }
    update();
  };

  /* ================================================================ */
  /* FIG_013: VmSize vs VmRSS                                          */
  /* ================================================================ */
  figures.memory = function (body) {
    let mb = 300, touched = 0, optimized = false;
    const BASE_SIZE = 2.7, BASE_RSS = 2.0, COLS = 40, ROWS = 6;
    const r1 = el("input", { type: "range", min: 0, max: 500, step: 10, value: mb, "aria-label": "megabytes allocated" });
    const o1 = el("output");
    const r2 = el("input", { type: "range", min: 0, max: 100, step: 1, value: touched, "aria-label": "percent of pages written" });
    const o2 = el("output");
    const opt = el("button", { class: "btn", type: "button", text: "-O2 and no volatile (the old bug)", onclick: () => { optimized = !optimized; update(); } });
    const touchAll = el("button", { class: "btn", type: "button", text: "write one byte per page", onclick: () => animateTouch() });
    const grid = el("div", { style: `display:grid;grid-template-columns:repeat(${COLS},1fr);gap:3px;margin:14px 0` });
    const cells = Array.from({ length: COLS * ROWS }, () => { const c = el("span", { style: "aspect-ratio:1;border:1px solid var(--blue-soft);border-radius:2px;transition:background .15s,border-color .15s" }); grid.appendChild(c); return c; });
    const W = 900, H = 96;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "VmSize and VmRSS bars" });
    const scale = (v) => (v / 520) * (W - 150);
    const sizeBar = sv("rect", { x: 110, y: 12, height: 22, class: "s-fill-soft anim" });
    const rssBar = sv("rect", { x: 110, y: 52, height: 22, class: "s-fill anim" });
    const sizeT = sv("text", { y: 28, class: "s-text" }), rssT = sv("text", { y: 68, class: "s-text" });
    svg.append(sv("text", { x: 0, y: 28, class: "s-text", text: "VmSize" }), sv("text", { x: 0, y: 68, class: "s-text", text: "VmRSS" }), sizeBar, rssBar, sizeT, rssT);
    const out = el("div", { class: "readout" });
    body.append(
      el("div", { class: "slider-row" }, el("label", { text: "malloc(MB)" }), r1, o1),
      el("div", { class: "slider-row" }, el("label", { text: "pages written" }), r2, o2),
      el("div", { class: "controls", style: "margin-top:8px" }, touchAll, el("span", { class: "spacer" }), opt),
      grid, svg, out);
    r1.addEventListener("input", () => { mb = +r1.value; update(); });
    r2.addEventListener("input", () => { touched = +r2.value; update(); });
    let anim = null;
    function animateTouch() {
      if (anim) cancelAnimationFrame(anim);
      const t0 = performance.now(), from = touched;
      const step = (now) => {
        const f = Math.min(1, (now - t0) / 1400);
        touched = Math.round(from + (100 - from) * f);
        r2.value = touched; update();
        if (f < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    function update() {
      o1.textContent = mb + " MB"; o2.textContent = touched + "%";
      opt.setAttribute("aria-pressed", optimized);
      const live = optimized ? 0 : mb;
      const size = BASE_SIZE + live, rss = BASE_RSS + live * touched / 100;
      sizeBar.setAttribute("width", scale(size)); rssBar.setAttribute("width", scale(rss));
      sizeT.setAttribute("x", 118 + scale(size)); sizeT.textContent = size.toFixed(1) + " MB";
      rssT.setAttribute("x", 118 + scale(rss)); rssT.textContent = rss.toFixed(1) + " MB";
      const reserved = optimized ? 0 : Math.round(cells.length * mb / 500);
      const resident = Math.round(reserved * touched / 100);
      cells.forEach((c, k) => {
        c.style.background = k < resident ? "var(--blue)" : "transparent";
        c.style.borderColor = k < reserved ? "var(--blue-soft)" : "var(--rule-2)";
      });
      out.innerHTML = optimized
        ? `<span class="tag" style="color:var(--red)">optimized away</span>The buffer is written but never read, so under <code>-O2</code> the compiler may delete <code>malloc</code>, the writes and <code>free</code>. The process never grows, and that's how <code>inspect</code> showed 2 MB instead of 300.`
        : touched === 0
          ? `<span class="tag">reserved only</span><code>malloc(${mb} MB)</code> reserves address space, so VmSize jumps. No page has been written, so almost nothing is in RAM yet.`
          : `<span class="tag">page faults</span>Each first write to a 4 KB page faults into the kernel, which attaches a real page of RAM. ${touched}% written gives about ${(mb * touched / 100).toFixed(0)} MB more resident.`;
    }
    update();
  };

  /* ---------------------------------------------------------------- */
  document.querySelectorAll("[data-fig]").forEach((fig) => {
    const name = fig.getAttribute("data-fig");
    const body = fig.querySelector(".fig-body");
    try {
      if (figures[name]) figures[name](body);
    } catch (err) {
      body.textContent = "This figure failed to load.";
      console.error(name, err);
      (window.__figErrors = window.__figErrors || []).push(name + ": " + err.message);
    }
  });
})();
