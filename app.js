(() => {
  "use strict";

  const LESSONS = window.QUIZ_DATA || [];
  const TITLE = (window.QUIZ_META && window.QUIZ_META.title) || "Quiz tổ chức và quản lý y tế";
  const SECONDS = 10;
  const AUTO_NEXT_MS = 900;
  const STORE_KEY = "yteq.v1";
  const HISTORY_CAP = 300;
  const app = document.getElementById("app");

  /* ---------------- storage ---------------- */
  let store = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return { sessions: s.sessions || {}, history: Array.isArray(s.history) ? s.history : [] };
    } catch { return { sessions: {}, history: [] }; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* quota / private mode */ }
  }

  /* ---------------- utils ---------------- */
  const $ = (sel, root = app) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lessonById = (id) => LESSONS.find((l) => String(l.id) === String(id));
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  function rand(n) {
    if (window.crypto && crypto.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
    return Math.floor(Math.random() * n);
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // Options that reference other options by letter ("Cả A và B") pin the whole order.
  // "Tất cả các câu trên" as the last option only pins itself; the others still shuffle.
  const LETTER_REF = /((?<!\p{L})(cả|câu)\s+[a-d](?!\p{L})|(?<!\p{L})[a-d]\s+(và|hoặc)\s+[a-d](?!\p{L}))/iu;
  const ALL_REF = /(tất cả|câu trên|các câu)/i;
  function optionOrder(q) {
    const idx = range(q.options.length);
    if (q.options.some((o) => LETTER_REF.test(o))) return idx;
    if (q.options.every((o) => /^\d+([.,]\d+)?$/.test(o.trim()))) return idx;
    const allRefs = idx.filter((i) => ALL_REF.test(q.options[i]));
    if (!allRefs.length) return shuffle(idx);
    if (allRefs.length === 1 && allRefs[0] === idx.length - 1) return shuffle(idx.slice(0, -1)).concat(idx.length - 1);
    return idx;
  }
  const pct = (a) => (a.total ? Math.round((a.correct / a.total) * 100) : 0);
  function rating(p) {
    if (p >= 90) return { key: "excellent", label: "Xuất sắc" };
    if (p >= 75) return { key: "good", label: "Tốt" };
    if (p >= 50) return { key: "pass", label: "Đạt" };
    return { key: "fail", label: "Cần ôn lại" };
  }
  function fmtDur(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(s / 60);
    return m ? `${m} phút ${String(s % 60).padStart(2, "0")} giây` : `${s} giây`;
  }
  function go(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  }

  /* ---------------- icons ---------------- */
  const P = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
    restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;

  /* ---------------- sound (always on) ---------------- */
  let actx = null;
  function ctx() {
    if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; actx = new C(); }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, start, dur, type, vol, slideTo) {
    const c = ctx(); if (!c) return;
    const t0 = c.currentTime + start;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    ok() { tone(659.25, 0, 0.12, "sine", 0.22); tone(987.77, 0.09, 0.22, "sine", 0.2); },
    no() { tone(311, 0, 0.16, "triangle", 0.26, 277); tone(220, 0.14, 0.28, "triangle", 0.26, 185); },
  };
  function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch { /* noop */ } }

  /* ---------------- router ---------------- */
  let cleanup = null;
  window.addEventListener("hashchange", render);
  function render() {
    if (cleanup) { cleanup(); cleanup = null; }
    app.onclick = null;
    const [route, arg] = location.hash.replace(/^#\/?/, "").split("/");
    app.classList.toggle("narrow", route === "bai" || route === "ketqua");
    if (route === "bai" && arg) return renderQuiz(arg);
    if (route === "ketqua" && arg) return renderResult(arg);
    renderHome();
  }

  /* ---------------- home ---------------- */
  function renderHome() {
    document.title = TITLE;
    app.innerHTML = `
      <h1 class="home-title">${esc(TITLE)}</h1>
      <ul class="lessons">${LESSONS.map(lessonCard).join("")}</ul>
    `;
    app.onclick = (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.act === "open") go(`#/bai/${id}`);
      if (b.dataset.act === "reset" && confirm("Bỏ lượt đang làm và bắt đầu lại từ đầu?")) {
        delete store.sessions[id]; save(); go(`#/bai/${id}`);
      }
    };
  }

  function lessonCard(l) {
    const n = l.questions.length;
    const ses = validSession(l);
    const done = ses ? ses.answers.length : 0;
    return `
      <li class="lesson ${ses ? "doing" : ""}">
        <span class="no" aria-hidden="true">${esc(l.id)}</span>
        <div class="body">
          <h2 class="name">
            <button class="open" data-act="open" data-id="${l.id}" aria-label="Bài ${esc(l.id)}: ${esc(l.title)}${ses ? `, đang làm ${done}/${n} câu` : ""}">${esc(l.title)}</button>
          </h2>
          <span class="count">${ses ? `Đang làm ${done}/${n} câu` : `${n} câu`}</span>
          ${ses ? `<span class="progress" aria-hidden="true"><i style="width:${(done / n) * 100}%"></i></span>` : ""}
        </div>
        ${ses
          ? `<button class="reset" data-act="reset" data-id="${l.id}" aria-label="Làm lại bài ${esc(l.id)} từ đầu" title="Làm lại từ đầu">${icon("restart")}</button>`
          : `<span class="go" aria-hidden="true">${icon("chev")}</span>`}
      </li>`;
  }

  /* ---------------- session ---------------- */
  function validSession(l) {
    const s = store.sessions[l.id];
    if (!s) return null;
    const n = l.questions.length;
    const ok = Array.isArray(s.order) && s.order.length === n && Array.isArray(s.opt) && s.order.every((qi) => qi < n) &&
      s.opt.every((p, i) => Array.isArray(p) && p.length === l.questions[s.order[i]].options.length);
    if (!ok) { delete store.sessions[l.id]; save(); return null; }
    return s;
  }
  function newSession(l) {
    const order = shuffle(range(l.questions.length));
    const opt = order.map((qi) => optionOrder(l.questions[qi]));
    const s = { lessonId: l.id, startedAt: Date.now(), activeMs: 0, order, opt, answers: [], pos: 0, phase: "ask" };
    store.sessions[l.id] = s; save();
    return s;
  }

  /* ---------------- quiz ---------------- */
  function renderQuiz(id) {
    const l = lessonById(id);
    if (!l) return go("#/");
    document.title = `Bài ${l.id} · ${TITLE}`;
    const s = validSession(l) || newSession(l);
    const n = l.questions.length;

    let raf = 0, autoT = 0, qStart = 0;
    let lastTick = performance.now();
    const tickActive = () => { const t = performance.now(); s.activeMs += t - lastTick; lastTick = t; };
    const stopTimers = () => { cancelAnimationFrame(raf); clearTimeout(autoT); };
    const onHide = () => { tickActive(); save(); };
    window.addEventListener("pagehide", onHide);
    const detach = () => { window.removeEventListener("pagehide", onHide); document.removeEventListener("keydown", onKey); };
    cleanup = () => { stopTimers(); onHide(); detach(); };

    function show() {
      stopTimers();
      if (s.pos >= n) return finish();
      const qi = s.order[s.pos], perm = s.opt[s.pos], q = l.questions[qi];
      const okCount = s.answers.filter((a) => a.ok).length;

      app.innerHTML = `
        <header class="qbar">
          <a class="icon-btn" href="#/" aria-label="Về danh sách bài (tiến độ đã lưu)" title="Về danh sách bài">${icon("home")}</a>
          <div class="mid">
            <div class="title">Bài ${esc(l.id)}. ${esc(l.title)}</div>
            <div class="sub">Câu <b>${s.pos + 1}/${n}</b>, còn <b data-remaining>${n - s.answers.length}</b> câu</div>
          </div>
          <div class="tally">
            <span class="ok" aria-label="Số câu đúng">${icon("check")}<b data-ok>${okCount}</b></span>
            <span class="bad" aria-label="Số câu sai">${icon("x")}<b data-bad>${s.answers.length - okCount}</b></span>
          </div>
        </header>

        <div class="dots" aria-hidden="true">
          ${range(n).map((i) => {
            const a = s.answers[i];
            return `<i class="${a ? (a.ok ? "ok" : "bad") : i === s.pos ? "cur" : ""}"></i>`;
          }).join("")}
        </div>

        <section class="qcard">
          <div class="timer" role="timer" aria-label="Thời gian còn lại">
            ${icon("clock")}<span class="num">${SECONDS}s</span>
            <div class="track"><div class="fill"></div></div>
          </div>
          <h2 class="question">${esc(q.q)}</h2>
          <div class="options" role="group" aria-label="Các đáp án">
            ${perm.map((orig, d) => `
              <button class="opt" data-d="${d}">
                <span class="key">${"ABCDEF"[d]}</span>
                <span class="txt">${esc(q.options[orig])}</span>
                <span class="mark"></span>
              </button>`).join("")}
          </div>
        </section>

        <div class="actions">
          <button class="btn primary next">${s.pos + 1 >= n ? "Xem kết quả" : "Câu tiếp"} ${icon("arrow")}</button>
        </div>
        <p class="sr-only" aria-live="assertive" data-live></p>
      `;
      window.scrollTo({ top: 0 });

      if (s.phase === "reveal" && s.answers.length === s.pos + 1) reveal(s.answers[s.pos], false);
      else { s.phase = "ask"; startTimer(); }
    }

    function startTimer() {
      const fill = $(".timer .fill"), num = $(".timer .num"), box = $(".timer");
      qStart = performance.now();
      const deadline = qStart + SECONDS * 1000;
      const loop = (t) => {
        const left = Math.max(0, deadline - t);
        fill.style.transform = `scaleX(${left / (SECONDS * 1000)})`;
        num.textContent = `${Math.ceil(left / 1000)}s`;
        box.classList.toggle("low", left <= 3000);
        if (left <= 0) return answer(null);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    function answer(d) {
      if (s.phase !== "ask") return;
      stopTimers();
      const qi = s.order[s.pos], perm = s.opt[s.pos], q = l.questions[qi];
      const chosen = d === null ? null : perm[d];
      const rec = { q: qi, c: chosen, ok: chosen === q.answer, ms: Math.round(performance.now() - qStart) };
      s.answers[s.pos] = rec;
      s.answers.length = s.pos + 1;
      s.phase = "reveal";
      tickActive(); save();
      reveal(rec, true);
    }

    function reveal(rec, live) {
      const perm = s.opt[s.pos];
      const correctD = perm.indexOf(l.questions[rec.q].answer);
      const chosenD = rec.c === null ? -1 : perm.indexOf(rec.c);
      app.querySelectorAll(".opt").forEach((b, d) => {
        b.disabled = true;
        const m = b.querySelector(".mark");
        if (d === correctD) { b.classList.add("is-correct"); if (d === chosenD) b.classList.add("picked"); m.innerHTML = icon("check"); }
        else if (d === chosenD) { b.classList.add("is-wrong"); m.innerHTML = icon("x"); }
        else b.classList.add("is-dim");
      });

      const timer = $(".timer");
      const timedOut = rec.c === null;
      timer.classList.remove("low");
      timer.classList.add(timedOut ? "timeout" : "done");
      $(".qcard").classList.toggle("timeout", timedOut);
      if (!live) { $(".timer .fill").style.transform = "scaleX(0)"; $(".timer .num").textContent = "0s"; }

      // Screen readers only; sighted users read the colors.
      $("[data-live]").textContent = rec.ok ? "Đúng" : rec.c === null ? "Hết giờ" : "Sai";

      const okCount = s.answers.filter((a) => a.ok).length;
      $("[data-ok]").textContent = okCount;
      $("[data-bad]").textContent = s.answers.length - okCount;
      $("[data-remaining]").textContent = n - s.answers.length;
      const dot = app.querySelectorAll(".dots i")[s.pos];
      if (dot) dot.className = rec.ok ? "ok" : "bad";

      const next = $(".next");
      next.classList.add("show");
      if (live) {
        if (rec.ok) { sfx.ok(); autoT = setTimeout(advance, AUTO_NEXT_MS); }
        else { sfx.no(); vibrate([40, 60, 40]); next.focus({ preventScroll: true }); }
      }
    }

    function advance() {
      if (s.phase !== "reveal") return;
      clearTimeout(autoT);
      s.pos += 1; s.phase = "ask"; save();
      show();
    }

    function finish() {
      tickActive();
      const correct = s.answers.filter((a) => a.ok).length;
      const attempt = {
        id: Date.now().toString(36) + rand(1e6).toString(36),
        lessonId: l.id,
        startedAt: s.startedAt,
        finishedAt: Date.now(),
        durationMs: Math.round(s.activeMs),
        total: n,
        correct,
        timeouts: s.answers.filter((a) => a.c === null).length,
        wrong: s.answers.filter((a) => !a.ok).map((a) => ({ q: a.q, c: a.c })),
      };
      store.history = [attempt, ...store.history].slice(0, HISTORY_CAP);
      delete store.sessions[l.id];
      save();
      cleanup = null;
      detach();
      location.replace(`#/ketqua/${attempt.id}`);
    }

    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (s.phase === "ask") {
        let d = -1;
        if (/^[1-6]$/.test(k)) d = +k - 1;
        else if (/^[a-f]$/.test(k)) d = k.charCodeAt(0) - 97;
        if (d >= 0 && d < s.opt[s.pos].length) { e.preventDefault(); answer(d); }
      } else if (s.phase === "reveal" && (k === "enter" || k === " " || k === "arrowright")) {
        e.preventDefault(); advance();
      }
      if (k === "escape") go("#/");
    }
    document.addEventListener("keydown", onKey);

    app.onclick = (e) => {
      const opt = e.target.closest(".opt");
      if (opt && !opt.disabled) { ctx(); return answer(+opt.dataset.d); }
      if (e.target.closest(".next.show")) advance();
    };

    show();
  }

  /* ---------------- result ---------------- */
  function renderResult(attemptId) {
    const a = store.history.find((x) => x.id === attemptId);
    if (!a) return go("#/");
    const l = lessonById(a.lessonId);
    document.title = `Kết quả bài ${a.lessonId} · ${TITLE}`;
    const p = pct(a), r = rating(p);
    const ringColor = { excellent: "var(--ok)", good: "var(--ok)", pass: "var(--warn)", fail: "var(--no)" }[r.key];
    const wrongCount = a.total - a.correct - a.timeouts;

    const reviews = l ? a.wrong.map((w) => {
      const q = l.questions[w.q]; if (!q) return "";
      return `
        <article class="review-item">
          <p class="q">${esc(q.q)}</p>
          <div class="a ok">${icon("check")}<span>${esc(q.options[q.answer])}</span></div>
          ${w.c === null ? `<div class="a to">${icon("clock")}<span>Hết giờ, chưa chọn</span></div>`
                         : `<div class="a bad">${icon("x")}<span>${esc(q.options[w.c] ?? "")}</span></div>`}
        </article>`;
    }).join("") : "";

    app.innerHTML = `
      <div class="result-top"><a class="icon-btn" href="#/" aria-label="Về danh sách bài">${icon("home")}</a></div>

      <section class="result-hero">
        <div class="ring" style="--p:${p};--c:${ringColor}">
          <div><div><div class="pct">${p}%</div><div class="frac">${a.correct}/${a.total} câu</div></div></div>
        </div>
        <div>
          <div class="verdict r-${r.key}">${r.label}</div>
          <h1>Bài ${esc(a.lessonId)}${l ? ". " + esc(l.title) : ""}</h1>
          <div class="kv">
            <span class="ok">${icon("check")} Đúng <b>${a.correct}</b></span>
            <span class="bad">${icon("x")} Sai <b>${wrongCount}</b></span>
            <span class="to">${icon("clock")} Hết giờ <b>${a.timeouts}</b></span>
            <span>Thời gian <b>${fmtDur(a.durationMs)}</b></span>
          </div>
        </div>
      </section>

      <div class="result-actions">
        <button class="btn primary" data-act="again">${icon("restart")} Làm lại bài này</button>
        <a class="btn" href="#/">${icon("list")} Chọn bài khác</a>
      </div>

      ${a.wrong.length
        ? `<h2 class="review-head">Câu cần xem lại (${a.wrong.length})</h2><section class="review">${reviews}</section>`
        : `<div class="all-right">Đúng hết ${a.total}/${a.total} câu.</div>`}
    `;
    app.onclick = (e) => {
      if (e.target.closest('[data-act="again"]')) { delete store.sessions[a.lessonId]; save(); go(`#/bai/${a.lessonId}`); }
    };
  }

  window.addEventListener("pagehide", save);
  render();
})();
