/* Questions page: a blurred "wheel" of questions on the left, the IN/OUT card on the right. */
(function () {
  "use strict";

  const ALL = window.FORGE_QUESTIONS || [];
  const CATS = ["All", ...Array.from(new Set(ALL.map((q) => q.cat)))];
  const wheel = document.getElementById("wheel");
  const track = document.getElementById("track");
  const catsEl = document.getElementById("cats");
  const qtext = document.getElementById("qtext");
  const atext = document.getElementById("atext");
  const qpos = document.getElementById("qpos");
  const qsrc = document.getElementById("qsrc");
  const msel = document.getElementById("mselect");

  let cat = "All", list = ALL, active = 0;

  function buildCats() {
    catsEl.replaceChildren(...CATS.map((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = c;
      b.setAttribute("aria-pressed", c === cat);
      b.addEventListener("click", () => { cat = c; list = c === "All" ? ALL : ALL.filter((q) => q.cat === c); active = 0; buildList(); show(); });
      return b;
    }));
  }

  function buildList() {
    catsEl.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", b.textContent === cat));
    track.replaceChildren(...list.map((q, i) => {
      const item = document.createElement("div");
      item.className = "wheel-item";
      item.innerHTML = `<span></span><span class="arrows"><button type="button" aria-label="Previous">↑</button><button type="button" aria-label="Next">↓</button></span>`;
      item.firstChild.textContent = q.q;
      item.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (btn) { e.stopPropagation(); go(active + (btn.getAttribute("aria-label") === "Next" ? 1 : -1)); return; }
        go(i);
      });
      return item;
    }));
    msel.replaceChildren(...list.map((q, i) => { const o = document.createElement("option"); o.value = i; o.textContent = `${i + 1}. ${q.q}`; return o; }));
  }

  function go(i) {
    active = Math.max(0, Math.min(list.length - 1, i));
    show();
  }

  function show() {
    const q = list[active];
    if (!q) return;
    qtext.textContent = q.q;
    atext.innerHTML = q.a;
    qpos.textContent = `${active + 1} / ${list.length} · ${q.cat}`;
    if (q.src) { qsrc.hidden = false; qsrc.href = "source.html#" + q.src; }
    else qsrc.hidden = true;
    msel.value = String(active);
    const items = track.children;
    for (let k = 0; k < items.length; k++) {
      const d = Math.abs(k - active);
      items[k].classList.toggle("active", d === 0);
      items[k].style.filter = d === 0 ? "none" : `blur(${Math.min(0.9 + d * 0.9, 4.5).toFixed(1)}px)`;
      items[k].style.opacity = d === 0 ? "1" : String(Math.max(0.12, 0.78 - d * 0.14));
    }
    const node = items[active];
    if (node) {
      const center = wheel.clientHeight / 2;
      track.style.transform = `translateY(${center - node.offsetTop - node.offsetHeight / 2}px)`;
    }
    try { history.replaceState(null, "", `#q${ALL.indexOf(q) + 1}`); } catch (e) { /* file:// or sandbox */ }
  }

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea")) return;
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); go(active + 1); }
    if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); go(active - 1); }
  });
  let wheelLock = 0;
  wheel.addEventListener("wheel", (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now - wheelLock < 140 || Math.abs(e.deltaY) < 4) return;
    wheelLock = now;
    go(active + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  document.getElementById("mprev").addEventListener("click", () => go(active - 1));
  document.getElementById("mnext").addEventListener("click", () => go(active + 1));
  msel.addEventListener("change", () => go(+msel.value));
  window.addEventListener("resize", show);

  buildCats();
  buildList();
  const m = location.hash.match(/^#q(\d+)$/);
  if (m) { const q = ALL[+m[1] - 1]; if (q) active = ALL.indexOf(q); }
  show();
  // fonts change item heights once loaded; recentre then
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(show);
})();
