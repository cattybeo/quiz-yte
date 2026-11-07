(() => {
  "use strict";

  const LESSONS = window.QUIZ_DATA || [];
  const META = Object.assign(
    { title: "Ôn tập Tổ chức & Quản lý Y tế", subtitle: "Chọn bài để làm quiz. Câu hỏi và đáp án được xáo trộn mỗi lần làm." },
    window.QUIZ_META || {}
  );
  const SECONDS = 10;
  const AUTO_NEXT_MS = 900;
  const STORE_KEY = "yteq.v1";
  const HISTORY_CAP = 300;
  const app = document.getElementById("app");

  /* ---------------- storage ---------------- */
  const defaults = () => ({ settings: { sound: true, shuffleOptions: true }, sessions: {}, history: [] });
  let store = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaults();
      const s = JSON.parse(raw);
      const d = defaults();
      return { settings: Object.assign(d.settings, s.settings), sessions: s.sessions || {}, history: Array.isArray(s.history) ? s.history : [] };
    } catch { return defaults(); }
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
  function fmtDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    const sameDay = d.toDateString() === now.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (sameDay) return `Hôm nay, ${time}`;
    if (d.toDateString() === yest.toDateString()) return `Hôm qua, ${time}`;
    return `${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}, ${time}`;
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
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    volOn: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
    volOff: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
    arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
    back: '<path d="M19 12H5M11 19l-7-7 7-7"/>',
    restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;

  /* ---------------- sound ---------------- */
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
    ok() { if (!store.settings.sound) return; tone(659.25, 0, 0.12, "sine", 0.22); tone(987.77, 0.09, 0.22, "sine", 0.2); },
    no() { if (!store.settings.sound) return; tone(311, 0, 0.16, "triangle", 0.26, 277); tone(220, 0.14, 0.28, "triangle", 0.26, 185); },
  };
  function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch { /* noop */ } }
  const soundBtn = () =>
    `<button class="icon-btn" data-act="sound" aria-label="${store.settings.sound ? "Tắt âm thanh" : "Bật âm thanh"}" title="${store.settings.sound ? "Tắt âm thanh" : "Bật âm thanh"}">${icon(store.settings.sound ? "volOn" : "volOff")}</button>`;
  function toggleSound(btn) {
    store.settings.sound = !store.settings.sound; save();
    if (store.settings.sound) ctx();
    btn.outerHTML = soundBtn();
  }

  /* ---------------- stats ---------------- */
  function lessonStats(id) {
    const h = store.history.filter((a) => String(a.lessonId) === String(id));
    if (!h.length) return null;
    const best = Math.max(...h.map(pct));
    return { count: h.length, best, last: pct(h[0]) };
  }

  /* ---------------- router ---------------- */
  let cleanup = null;
  window.addEventListener("hashchange", render);
  function render() {
    if (cleanup) { cleanup(); cleanup = null; }
    const h = location.hash.replace(/^#\/?/, "");
    const [route, arg] = h.split("/");
    app.classList.toggle("narrow", route === "bai" || route === "ketqua" || route === "lichsu");
    if (route === "bai" && arg) return renderQuiz(arg);
    if (route === "ketqua" && arg) return renderResult(arg);
    if (route === "lichsu") return renderHistory(arg);
    renderHome();
  }

  /* ---------------- home ---------------- */
  function renderHome() {
    const done = LESSONS.filter((l) => lessonStats(l.id)).length;
    const bests = LESSONS.map((l) => lessonStats(l.id)).filter(Boolean).map((s) => s.best);
    const avg = bests.length ? Math.round(bests.reduce((a, b) => a + b, 0) / bests.length) : null;

    app.innerHTML = `
      <header class="topbar">
        <div class="grow hero">
          <h1>${esc(META.title)}</h1>
          <p>${esc(META.subtitle)}</p>
        </div>
        <a class="icon-btn" href="#/lichsu" aria-label="Lịch sử" title="Lịch sử">${icon("history")}</a>
        ${soundBtn()}
      </header>

      <section class="stats">
        <div class="card stat"><div class="v">${done}/${LESSONS.length}</div><div class="l">Bài đã làm</div></div>
        <div class="card stat"><div class="v">${avg === null ? "–" : avg + "%"}</div><div class="l">Điểm TB</div></div>
        <div class="card stat"><div class="v">${store.history.length}</div><div class="l">Lượt làm</div></div>
      </section>

      <div class="section-head">
        <h2>Danh sách bài</h2>
        <label class="switch" title="Áp dụng cho lượt làm mới">
          <input type="checkbox" data-act="shuffleOpt" ${store.settings.shuffleOptions ? "checked" : ""}>
          <span class="track"></span> Xáo trộn đáp án
        </label>
      </div>

      <section class="grid">
        ${LESSONS.map(lessonCard).join("")}
      </section>
    `;

    app.onclick = (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const act = b.dataset.act, id = b.dataset.id;
      if (act === "sound") toggleSound(b);
      if (act === "start") { delete store.sessions[id]; save(); go(`#/bai/${id}`); }
      if (act === "resume") go(`#/bai/${id}`);
      if (act === "reset") {
        if (confirm("Bỏ lượt đang làm dở và bắt đầu lại từ đầu?")) { delete store.sessions[id]; save(); go(`#/bai/${id}`); }
      }
    };
    app.onchange = (e) => {
      if (e.target.dataset.act === "shuffleOpt") { store.settings.shuffleOptions = e.target.checked; save(); }
    };
  }

  function lessonCard(l) {
    const n = l.questions.length;
    const st = lessonStats(l.id);
    const ses = validSession(l);
    const answered = ses ? ses.answers.length : 0;
    const r = st ? rating(st.best) : null;
    const meta = [`${n} câu`, `~${Math.max(1, Math.ceil((n * SECONDS) / 60))} phút`];
    if (st) meta.push(`${st.count} lượt`);

    let foot;
    if (ses) {
      foot = `<button class="btn primary" data-act="resume" data-id="${l.id}">${icon("play")} Tiếp tục ${answered}/${n}</button>
              <button class="btn ghost" data-act="reset" data-id="${l.id}" aria-label="Làm lại từ đầu" title="Làm lại từ đầu">${icon("restart")}</button>`;
    } else {
      foot = `<button class="btn ${st ? "" : "primary"}" data-act="start" data-id="${l.id}">${icon(st ? "restart" : "play")} ${st ? "Làm lại" : "Bắt đầu"}</button>`;
    }

    return `
      <article class="card lesson ${ses ? "in-progress" : ""}">
        <div class="head">
          <span class="num">Bài ${esc(l.id)}</span>
          ${ses ? `<span class="chip accent">${icon("clock")} Đang làm</span>`
                : st ? `<span class="chip r-${r.key}" title="Điểm cao nhất">${icon("trophy")} ${st.best}% · ${r.label}</span>` : ""}
        </div>
        <h3>${esc(l.title)}</h3>
        <div class="meta">${meta.map(esc).join('<span class="sep">·</span>')}${st ? `<span class="sep">·</span>Gần nhất ${st.last}%` : ""}</div>
        ${ses ? `<div class="bar" aria-label="Tiến độ"><i style="width:${(answered / n) * 100}%"></i></div>` : ""}
        <div class="foot">${foot}</div>
      </article>`;
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
    const opt = order.map((qi) => {
      const q = l.questions[qi];
      return store.settings.shuffleOptions ? optionOrder(q) : range(q.options.length);
    });
    const s = { lessonId: l.id, startedAt: Date.now(), activeMs: 0, order, opt, answers: [], pos: 0, phase: "ask" };
    store.sessions[l.id] = s; save();
    return s;
  }

  /* ---------------- quiz ---------------- */
  function renderQuiz(id) {
    const l = lessonById(id);
    if (!l) return go("#/");
    const s = validSession(l) || newSession(l);
    const n = l.questions.length;

    let raf = 0, autoT = 0, deadline = 0, qStart = 0;
    let lastTick = performance.now();
    const tickActive = () => { const t = performance.now(); s.activeMs += t - lastTick; lastTick = t; };

    const stopTimers = () => { cancelAnimationFrame(raf); clearTimeout(autoT); };
    const onHide = () => { tickActive(); save(); };
    window.addEventListener("pagehide", onHide);
    cleanup = () => { stopTimers(); onHide(); window.removeEventListener("pagehide", onHide); document.removeEventListener("keydown", onKey); app.onclick = null; };

    function show() {
      stopTimers();
      if (s.pos >= n) return finish();
      const qi = s.order[s.pos], perm = s.opt[s.pos], q = l.questions[qi];
      const okCount = s.answers.filter((a) => a.ok).length;
      const noCount = s.answers.length - okCount;
      const remaining = n - s.answers.length;

      app.innerHTML = `
        <header class="qbar">
          <a class="icon-btn" href="#/" aria-label="Về trang chủ (đã lưu tiến độ)" title="Về trang chủ">${icon("home")}</a>
          <div class="mid">
            <div class="title">Bài ${esc(l.id)} · ${esc(l.title)}</div>
            <div class="sub">Câu <b>${s.pos + 1}/${n}</b> · Còn <b data-remaining>${remaining}</b> câu</div>
          </div>
          <div class="tally" aria-label="Đúng và sai">
            <span class="ok">${icon("check")}<b data-ok>${okCount}</b></span>
            <span class="no">${icon("x")}<b data-no>${noCount}</b></span>
          </div>
          ${soundBtn()}
        </header>

        <div class="dots" aria-hidden="true">
          ${range(n).map((i) => {
            const a = s.answers[i];
            return `<i class="${a ? (a.ok ? "ok" : "no") : i === s.pos ? "cur" : ""}"></i>`;
          }).join("")}
        </div>

        <section class="card qcard">
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
          <div class="feedback" aria-live="assertive"></div>
          <button class="btn primary next" hidden>${s.pos + 1 >= n ? "Xem kết quả" : "Câu tiếp"} ${icon("arrow")}</button>
        </div>
        <div class="hint"><kbd>1</kbd>–<kbd>${perm.length}</kbd> hoặc <kbd>A</kbd>–<kbd>${"ABCDEF"[perm.length - 1]}</kbd> để chọn · <kbd>Enter</kbd> câu tiếp</div>
      `;
      window.scrollTo({ top: 0 });

      if (s.phase === "reveal" && s.answers.length === s.pos + 1) {
        reveal(s.answers[s.pos], false);
      } else {
        s.phase = "ask";
        startTimer();
      }
    }

    function startTimer() {
      const fill = $(".timer .fill"), num = $(".timer .num"), box = $(".timer");
      qStart = performance.now();
      deadline = qStart + SECONDS * 1000;
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
      timer.classList.remove("low"); timer.classList.add("done");
      if (!live) { $(".timer .fill").style.transform = "scaleX(0)"; $(".timer .num").textContent = "–"; }

      const fb = $(".feedback");
      if (rec.ok) { fb.className = "feedback ok show"; fb.innerHTML = `${icon("check")} Chính xác`; }
      else if (rec.c === null) { fb.className = "feedback no show"; fb.innerHTML = `${icon("clock")} Hết giờ`; }
      else { fb.className = "feedback no show"; fb.innerHTML = `${icon("x")} Sai rồi`; }

      const okCount = s.answers.filter((a) => a.ok).length;
      $("[data-ok]").textContent = okCount;
      $("[data-no]").textContent = s.answers.length - okCount;
      $("[data-remaining]").textContent = n - s.answers.length;
      const dot = app.querySelectorAll(".dots i")[s.pos];
      if (dot) dot.className = rec.ok ? "ok" : "no";

      const next = $(".next");
      next.hidden = false;
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
      store.history.unshift(attempt);
      store.history = store.history.slice(0, HISTORY_CAP);
      delete store.sessions[l.id];
      save();
      cleanup = null;
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("keydown", onKey);
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
      const sb = e.target.closest('[data-act="sound"]');
      if (sb) return toggleSound(sb);
      const opt = e.target.closest(".opt");
      if (opt && !opt.disabled) { ctx(); return answer(+opt.dataset.d); }
      if (e.target.closest(".next")) advance();
    };

    show();
  }

  /* ---------------- result ---------------- */
  function renderResult(attemptId) {
    const a = store.history.find((x) => x.id === attemptId);
    if (!a) return go("#/");
    const l = lessonById(a.lessonId);
    const p = pct(a), r = rating(p);
    const ringColor = { excellent: "var(--ok)", good: "var(--ok)", pass: "var(--warn)", fail: "var(--no)" }[r.key];
    const wrongCount = a.total - a.correct - a.timeouts;

    const reviews = l ? a.wrong.map((w) => {
      const q = l.questions[w.q]; if (!q) return "";
      return `
        <article class="card review-item">
          <p class="q">${esc(q.q)}</p>
          <div class="a ok">${icon("check")}<span>${esc(q.options[q.answer])}</span></div>
          ${w.c === null ? `<div class="a to">${icon("clock")}<span>Hết giờ, chưa chọn</span></div>`
                         : `<div class="a no">${icon("x")}<span>${esc(q.options[w.c] ?? "")}</span></div>`}
        </article>`;
    }).join("") : "";

    app.innerHTML = `
      <header class="topbar">
        <a class="icon-btn" href="#/" aria-label="Về trang chủ">${icon("home")}</a>
        <div class="grow"></div>
        <a class="icon-btn" href="#/lichsu" aria-label="Lịch sử" title="Lịch sử">${icon("history")}</a>
      </header>

      <section class="card result-hero">
        <div class="ring" style="--p:${p};--c:${ringColor}">
          <div><div><div class="pct">${p}%</div><div class="frac">${a.correct}/${a.total} câu</div></div></div>
        </div>
        <div>
          <span class="chip r-${r.key}">${icon("trophy")} ${r.label}</span>
          <h1>Bài ${esc(a.lessonId)}${l ? " · " + esc(l.title) : ""}</h1>
          <div class="muted">${fmtDate(a.finishedAt)}</div>
          <div class="kv">
            <span class="ok">${icon("check")} Đúng <b>${a.correct}</b></span>
            <span class="no">${icon("x")} Sai <b>${wrongCount}</b></span>
            <span class="to">${icon("clock")} Hết giờ <b>${a.timeouts}</b></span>
            <span>${icon("history")} <b>${fmtDur(a.durationMs)}</b></span>
          </div>
        </div>
      </section>

      <div class="result-actions">
        <button class="btn primary" data-act="again">${icon("restart")} Làm lại bài này</button>
        <a class="btn" href="#/">${icon("list")} Chọn bài khác</a>
      </div>

      ${a.wrong.length ? `
        <div class="section-head"><h2>Câu cần xem lại (${a.wrong.length})</h2></div>
        <section class="review">${reviews}</section>`
      : `<div class="card empty">${icon("check")}<div>Đúng hết. Không có câu nào cần xem lại.</div></div>`}
    `;
    app.onclick = (e) => {
      if (e.target.closest('[data-act="again"]')) { delete store.sessions[a.lessonId]; save(); go(`#/bai/${a.lessonId}`); }
    };
  }

  /* ---------------- history ---------------- */
  function renderHistory(filter) {
    const f = filter && lessonById(filter) ? String(filter) : "";
    const list = store.history.filter((a) => !f || String(a.lessonId) === f);
    const ids = [...new Set(store.history.map((a) => String(a.lessonId)))]
      .sort((x, y) => (+x) - (+y));

    app.innerHTML = `
      <header class="topbar">
        <a class="icon-btn" href="#/" aria-label="Về trang chủ">${icon("back")}</a>
        <div class="grow"><div class="hero"><h1 style="font-size:22px;margin:0">Lịch sử làm bài</h1></div></div>
        ${store.history.length ? `<button class="btn ghost danger" data-act="clear">${icon("trash")} Xoá</button>` : ""}
      </header>

      ${ids.length > 1 ? `
        <nav class="filters" aria-label="Lọc theo bài">
          <button class="${f ? "" : "on"}" data-f="">Tất cả</button>
          ${ids.map((id) => `<button class="${f === id ? "on" : ""}" data-f="${esc(id)}">Bài ${esc(id)}</button>`).join("")}
        </nav>` : ""}

      ${list.length ? `<section class="hist">
        ${list.map((a) => {
          const l = lessonById(a.lessonId), p = pct(a), r = rating(p);
          return `
            <a class="card" href="#/ketqua/${esc(a.id)}">
              <div class="pct r-${r.key}">${p}%</div>
              <div class="min">
                <div class="t">Bài ${esc(a.lessonId)}${l ? " · " + esc(l.title) : ""}</div>
                <div class="s">${r.label} · ${a.correct}/${a.total} đúng · ${fmtDur(a.durationMs)} · ${fmtDate(a.finishedAt)}</div>
              </div>
              <span class="chev">${icon("chev")}</span>
            </a>`;
        }).join("")}
      </section>` : `<div class="card empty">Chưa có lượt làm nào.</div>`}
    `;
    app.onclick = (e) => {
      const fb = e.target.closest("[data-f]");
      if (fb) return go(fb.dataset.f ? `#/lichsu/${fb.dataset.f}` : "#/lichsu");
      if (e.target.closest('[data-act="clear"]') && confirm("Xoá toàn bộ lịch sử làm bài?")) {
        store.history = []; save(); go("#/lichsu");
      }
    };
  }

  // Save on tab close / app switch so active time & progress persist.
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(); });

  render();
})();
