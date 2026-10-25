// puzzle.js — tab Puzzle: luyện tập, bạn đấu Nyra, Nyra tự giải.
// Dữ liệu: puzzles/index.json + các file p-XXXX.txt (mỗi dòng: id,fen,moves,rating,themes) — nguồn Lichess (CC0).
// Quy tắc Lichess: FEN là thế cờ TRƯỚC khi đối thủ đi; nước đầu trong `moves` là của đối thủ;
// các nước còn lại xen kẽ người giải / đối thủ; nước nào chiếu hết cũng được tính là đúng.
import { t, themeName, GENIUS_THEMES, getLang } from "./i18n.js?v=1";
import { getSettings, onSettingsChange } from "./settings.js?v=1";

const PROG_KEY = "nyraPuzzleProgress", VS_KEY = "nyraPuzzleVs", UI_KEY = "nyraPuzzleUi";
const DATA = "puzzles/";
const RANGES = { easy: [400, 999], medium: [1000, 1499], hard: [1500, 1999], vhard: [2000, 2499], extreme: [2500, 3400] };
const SHOW_THEMES = ["mateIn1", "mateIn2", "mateIn3", "fork", "pin", "skewer", "discoveredAttack", "doubleCheck", "sacrifice", "quietMove",
  "zugzwang", "clearance", "interference", "intermezzo", "deflection", "attraction", "xRayAttack", "trappedPiece", "hangingPiece",
  "capturingDefender", "backRankMate", "smotheredMate", "attackingF2F7", "exposedKing", "kingsideAttack", "queensideAttack",
  "advancedPawn", "promotion", "underPromotion", "enPassant", "defensiveMove", "opening", "middlegame", "endgame", "pawnEndgame",
  "rookEndgame", "knightEndgame", "bishopEndgame", "queenEndgame", "short", "long", "veryLong", "oneMove"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (n) => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function initPuzzle({ Chess, getNyraMove, getApiUrl, PIECES }) {
  const root = document.getElementById("tab-puzzle");
  if (!root) return;
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ tiến độ & giao diện đã lưu
  const loadJson = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || "{}") }; } catch (e) { return { ...d }; } };
  const saveJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } };
  let prog = loadJson(PROG_KEY, { rating: 1200, solved: 0, streak: 0, seen: [] });
  let vs = loadJson(VS_KEY, { you: 0, nyra: 0 });
  let ui = loadJson(UI_KEY, { mode: "practice", diff: "auto", theme: "all", count: 10 });
  if (!["practice", "versus", "nyra"].includes(ui.mode)) ui.mode = "practice";

  // ------------------------------------------------------------ trạng thái
  let index = null, indexErr = false;
  const shards = new Map();
  let pz = null, game = null, ptr = 1, playerColor = "w", flipped = false;
  let sel = null, targets = [], lastMove = null, flash = null, hintSq = null, badgeSq = null;
  let failed = false, hintUsed = false, finished = false, locked = true, startTs = 0;
  let loadToken = 0, vsPromise = null, vsResult = null;
  let running = false, runId = 0, session = null, ladder = 1000;
  let statusMsg = "", statusCls = "";

  // ------------------------------------------------------------ dữ liệu
  async function loadIndex() {
    if (index || indexErr) return index;
    try {
      const r = await fetch(DATA + "index.json?v=1");
      if (!r.ok) throw new Error(r.status);
      index = await r.json();
    } catch (e) { indexErr = true; }
    return index;
  }
  async function loadShard(b) {
    if (shards.has(b.file)) return shards.get(b.file);
    const r = await fetch(`${DATA}${b.file}?v=${index.version || 1}`);
    if (!r.ok) throw new Error("shard " + r.status);
    const arr = [];
    for (const line of (await r.text()).split("\n")) {
      if (!line) continue;
      const f = line.split(",");
      if (f.length < 4) continue;
      arr.push({ id: f[0], fen: f[1], moves: f[2].split(" "), rating: +f[3], themes: f[4] ? f[4].split(" ") : [] });
    }
    shards.set(b.file, arr);
    return arr;
  }
  const themeOk = (p, th) => th === "all" || !index.themes ||
    (th === "genius" ? p.themes.some((x) => GENIUS_THEMES.includes(x)) : p.themes.includes(th));

  async function pick(min, max) {
    await loadIndex();
    if (!index) return null;
    const seen = new Set(prog.seen);
    for (const widen of [0, 150, 350, 700]) {
      const lo = min - widen, hi = max + widen;
      const bs = index.buckets.filter((b) => b.max >= lo && b.min <= hi).sort(() => Math.random() - 0.5);
      for (const ignoreSeen of [false, true]) {
        for (const b of bs) {
          const pool = (await loadShard(b)).filter((p) => p.rating >= lo && p.rating <= hi && themeOk(p, ui.theme) && (ignoreSeen || !seen.has(p.id)));
          if (pool.length) return pool[rnd(pool.length)];
        }
      }
    }
    return null;
  }
  function rangeFor() {
    if (ui.mode === "nyra" && ui.diff === "ladder") return [ladder - 60, ladder + 60];
    if (RANGES[ui.diff]) return RANGES[ui.diff];
    const r = prog.rating;
    return [r - 150, r + 150];
  }

  // ------------------------------------------------------------ cờ
  function applyUci(g, uci) {
    try { return g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }); } catch (e) { return null; }
  }
  function solutionSan(p) {
    const g = new Chess(p.fen), out = [];
    p.moves.forEach((u, i) => { const m = applyUci(g, u); if (m && i > 0) out.push(m.san); });
    return out;
  }
  const isGeniusPuzzle = (p) => !!index?.themes && p.themes.some((x) => GENIUS_THEMES.includes(x));

  // ------------------------------------------------------------ giao diện
  function buildUI() {
    const diffOpts = [["auto", t("pz.diff.auto")], ["easy", t("pz.diff.easy")], ["medium", t("pz.diff.medium")], ["hard", t("pz.diff.hard")],
      ["vhard", t("pz.diff.vhard")], ["extreme", t("pz.diff.extreme")], ["ladder", t("pz.diff.ladder")]]
      .filter(([k]) => (k === "ladder" ? ui.mode === "nyra" : k !== "auto" || ui.mode !== "nyra"));
    if (!diffOpts.some(([k]) => k === ui.diff)) ui.diff = ui.mode === "nyra" ? "ladder" : "auto";
    const hasThemes = !!index?.themes;
    const themeOpts = [["all", t("pz.theme.all")], ["genius", t("pz.theme.genius")], ...SHOW_THEMES.map((k) => [k, themeName(k)])];
    const opt = (list, cur) => list.map(([k, v]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${v}</option>`).join("");
    root.innerHTML = `
      <div class="pz">
        <div class="pz-stats">
          <div class="pz-stat"><small>${t("pz.yourRating")}</small><b id="pzRating">${prog.rating}</b></div>
          <div class="pz-stat"><small>${t("pz.streak")}</small><b id="pzStreak">${prog.streak}</b></div>
          <div class="pz-stat"><small>${t("pz.solved")}</small><b id="pzSolved">${prog.solved}</b></div>
        </div>
        <div class="pz-seg" id="pzModes">
          ${["practice", "versus", "nyra"].map((m) => `<button type="button" data-m="${m}" class="${ui.mode === m ? "active" : ""}">${t("pz.mode." + m)}</button>`).join("")}
        </div>
        <div class="pz-filters">
          <label>${t("pz.diff")}<select id="pzDiff">${opt(diffOpts, ui.diff)}</select></label>
          <label>${t("pz.theme")}<select id="pzTheme" ${hasThemes ? "" : "disabled"}>${hasThemes ? opt(themeOpts, ui.theme) : `<option>${t("pz.theme.none")}</option>`}</select></label>
        </div>
        <div class="pz-info" id="pzInfo"></div>
        <div class="board-wrap pz-board-wrap">
          <div class="rank-labels" id="pzRanks"></div>
          <div class="board pz-board" id="pzBoard" role="grid"></div>
          <div class="file-labels" id="pzFiles"></div>
          <div class="pz-promo" id="pzPromo" hidden></div>
        </div>
        <div class="pz-status" id="pzStatus" aria-live="polite"></div>
        <div class="pz-actions" id="pzActions"></div>
        <div class="pz-extra" id="pzExtra"></div>
        <p class="small-note" id="pzSource"></p>
      </div>`;
    $("pzModes").querySelectorAll("button").forEach((b) => { b.onclick = () => setMode(b.dataset.m); });
    $("pzDiff").onchange = (e) => { ui.diff = e.target.value; saveJson(UI_KEY, ui); if (!running) newPuzzle(); };
    if (hasThemes) $("pzTheme").onchange = (e) => { ui.theme = e.target.value; saveJson(UI_KEY, ui); if (!running) newPuzzle(); };
    renderAll();
  }

  function renderAll() { renderBoard(); renderInfo(); renderStatus(); renderActions(); renderExtra(); renderStats(); renderSource(); }

  function renderStats() {
    if (!$("pzRating")) return;
    $("pzRating").textContent = prog.rating; $("pzStreak").textContent = prog.streak; $("pzSolved").textContent = prog.solved;
  }
  function renderSource() {
    if (!$("pzSource")) return;
    $("pzSource").textContent = index ? t("pz.source", { n: (index.total || 0).toLocaleString(getLang() === "en" ? "en-US" : "vi-VN") }) + (index.themes ? "" : t("pz.noThemesNote")) : "";
  }
  function renderInfo() {
    const el = $("pzInfo"); if (!el) return;
    if (!pz) { el.innerHTML = `<span class="pz-muted">${indexErr ? t("pz.noData") : t("pz.loading")}</span>`; return; }
    const s = getSettings();
    const head = s.showRating ? t("pz.puzzleNo", { id: pz.id, rating: pz.rating }) : `#${pz.id}`;
    const side = t("pz.side." + playerColor);
    const th = s.showThemes && pz.themes.length ? `<div class="pz-themes">${pz.themes.filter((x) => THEME_SHOW.has(x)).map((x) => `<span>${themeName(x)}</span>`).join("")}</div>` : "";
    el.innerHTML = `<div class="pz-head">${head}</div><div class="pz-prompt"><span class="pz-dot ${playerColor}"></span>${t("pz.prompt", { side })}</div>${th}`;
  }
  const THEME_SHOW = new Set(SHOW_THEMES);

  function setStatus(msg, cls = "") { statusMsg = msg; statusCls = cls; renderStatus(); }
  function renderStatus() { const el = $("pzStatus"); if (el) { el.textContent = statusMsg; el.className = "pz-status " + statusCls; } }

  function renderBoard() {
    const boardEl = $("pzBoard"); if (!boardEl) return;
    boardEl.innerHTML = "";
    const files = flipped ? "hgfedcba" : "abcdefgh", ranks = flipped ? "12345678" : "87654321";
    const tset = new Set(targets.map((m) => m.to));
    for (const rank of ranks) for (const file of files) {
      const sq = file + rank;
      const btn = document.createElement("button");
      btn.className = `square ${((file.charCodeAt(0) - 97) + Number(rank)) % 2 === 0 ? "light" : "dark"}`;
      btn.dataset.sq = sq;
      if (sel === sq) btn.classList.add("selected");
      if (tset.has(sq)) btn.classList.add(game && game.get(sq) ? "capture" : "legal");
      if (lastMove && (lastMove.from === sq || lastMove.to === sq)) btn.classList.add("last-move");
      if (flash && flash.sq === sq) btn.classList.add(flash.cls);
      if (hintSq === sq) btn.classList.add("pz-hint");
      const piece = game ? game.get(sq) : null;
      if (piece) {
        const span = document.createElement("span");
        span.className = `piece ${piece.color === "w" ? "white" : "black"}`;
        span.textContent = PIECES[piece.color][piece.type];
        btn.appendChild(span);
      }
      if (badgeSq === sq) { const b = document.createElement("span"); b.className = "pz-badge"; b.textContent = "!!"; b.title = t("pz.genius"); btn.appendChild(b); }
      btn.onclick = () => onSquare(sq);
      boardEl.appendChild(btn);
    }
    $("pzRanks").innerHTML = [...ranks].map((v) => `<span>${v}</span>`).join("");
    $("pzFiles").innerHTML = [...files].map((v) => `<span>${v}</span>`).join("");
  }

  function renderActions() {
    const el = $("pzActions"); if (!el) return;
    if (ui.mode === "nyra") {
      el.innerHTML = running
        ? `<button id="pzStop" class="btn btn-secondary" type="button">${t("pz.btn.stop")}</button>`
        : `<label class="pz-count">${t("pz.nyra.count")}<select id="pzCount">${[5, 10, 25, 50, 100].map((n) => `<option value="${n}" ${n === ui.count ? "selected" : ""}>${n}</option>`).join("")}</select></label>
           <button id="pzStart" class="btn btn-primary" type="button">${t("pz.btn.start")}</button>`;
      if ($("pzStop")) $("pzStop").onclick = stopRun;
      if ($("pzStart")) $("pzStart").onclick = startRun;
      if ($("pzCount")) $("pzCount").onchange = (e) => { ui.count = +e.target.value; saveJson(UI_KEY, ui); };
      return;
    }
    el.innerHTML = finished
      ? `<button id="pzNext" class="btn btn-primary" type="button">${t("pz.btn.next")}</button>
         <button id="pzFlip" class="btn btn-secondary" type="button">${t("pz.btn.flip")}</button>`
      : `<button id="pzHint" class="btn btn-secondary" type="button" ${locked || !pz ? "disabled" : ""}>${t("pz.btn.hint")}</button>
         <button id="pzSol" class="btn btn-secondary" type="button" ${locked || !pz ? "disabled" : ""}>${t("pz.btn.solution")}</button>
         <button id="pzSkip" class="btn btn-secondary" type="button">${t("pz.btn.skip")}</button>
         <button id="pzFlip" class="btn btn-secondary" type="button">${t("pz.btn.flip")}</button>`;
    if ($("pzNext")) $("pzNext").onclick = newPuzzle;
    if ($("pzHint")) $("pzHint").onclick = showHint;
    if ($("pzSol")) $("pzSol").onclick = showSolution;
    if ($("pzSkip")) $("pzSkip").onclick = () => { if (!finished && pz) applyRating(0); newPuzzle(); };
    if ($("pzFlip")) $("pzFlip").onclick = () => { flipped = !flipped; renderBoard(); };
  }

  function renderExtra() {
    const el = $("pzExtra"); if (!el) return;
    if (ui.mode === "versus") {
      let res = "";
      if (vsResult && finished) res = `<div class="pz-vs-res ${vsResult.ok ? "ok" : "bad"}">${vsResult.text}</div>`;
      else if (vsPromise && !finished) res = `<div class="pz-vs-res">${t("pz.vs.pending")}</div>`;
      el.innerHTML = `<div class="pz-score"><div><small>${t("pz.vs.you")}</small><b>${vs.you}</b></div><span>${t("pz.vs.score")}</span><div><small>${t("pz.vs.nyra")}</small><b>${vs.nyra}</b></div></div>${res}`;
    } else if (ui.mode === "nyra") {
      const s = session;
      const avg = s && s.times.length ? (s.times.reduce((a, b) => a + b, 0) / s.times.length / 1000).toFixed(1) : null;
      el.innerHTML = `
        <div class="pz-score"><div><small>${t("pz.nyra.score", { a: s ? s.ok : 0, b: s ? s.n : 0 })}</small><b>${s ? s.ok : 0}/${s ? s.n : 0}</b></div>
          <span>${s && s.best ? t("pz.nyra.best", { r: s.best }) : ""}${avg ? `<br>${t("pz.nyra.avg", { s: avg })}` : ""}</span></div>
        <div class="pz-log" id="pzLog">${s && s.log.length ? s.log.map((l) => `<div class="${l.ok ? "ok" : "bad"}">${l.text}</div>`).join("") : `<div class="pz-muted">${t("pz.nyra.idle")}</div>`}</div>`;
      const lg = $("pzLog"); if (lg) lg.scrollTop = lg.scrollHeight;
    } else el.innerHTML = "";
  }

  // ------------------------------------------------------------ luồng puzzle
  function applyRating(score) {
    const E = 1 / (1 + 10 ** ((pz.rating - prog.rating) / 400));
    const d = Math.round(32 * (score - E));
    prog.rating = clamp(prog.rating + d, 100, 3200);
    if (score > 0) prog.solved++;
    if (score === 1) prog.streak++; else if (score === 0) prog.streak = 0;
    saveJson(PROG_KEY, prog); renderStats();
    return d;
  }
  function markSeen(p) { prog.seen.push(p.id); if (prog.seen.length > 400) prog.seen.splice(0, prog.seen.length - 400); saveJson(PROG_KEY, prog); }

  async function openPuzzle(p, token) {
    pz = p; markSeen(p);
    game = new Chess(p.fen);
    playerColor = game.turn() === "w" ? "b" : "w";   // nước đầu là của đối thủ
    flipped = playerColor === "b";
    ptr = 1; sel = null; targets = []; lastMove = null; flash = null; hintSq = null; badgeSq = null;
    failed = hintUsed = finished = false; locked = true; vsResult = null; vsPromise = null;
    setStatus(t("pz.oppMoving"));
    renderAll();
    await sleep(500);
    if (token !== loadToken) return false;
    const m = applyUci(game, p.moves[0]);
    if (m) lastMove = { from: m.from, to: m.to };
    return true;
  }

  async function newPuzzle() {
    const token = ++loadToken;
    pz = null; game = null; running = running && ui.mode === "nyra";
    setStatus(t("pz.loading")); renderAll();
    const [lo, hi] = rangeFor();
    let p = null;
    try { p = await pick(lo, hi); } catch (e) { indexErr = true; }
    if (token !== loadToken) return;
    if (!p) { setStatus(indexErr ? t("pz.noData") : t("pz.noMatch"), "bad"); renderAll(); return; }
    if (!(await openPuzzle(p, token))) return;
    locked = false; startTs = performance.now();
    setStatus("");
    if (ui.mode === "versus") {
      const my = token;
      vsPromise = nyraSolve(p, getSettings().nyraMs, () => my !== loadToken).then((r) => { if (my === loadToken) { vsResult = r; renderExtra(); } return r; });
    }
    renderAll();
  }

  function onSquare(sq) {
    if (locked || finished || !game || ui.mode === "nyra") return;
    const piece = game.get(sq);
    if (sel && targets.some((m) => m.to === sq)) { attempt(sel, sq); return; }
    if (piece && piece.color === playerColor) { sel = sq; targets = game.moves({ square: sq, verbose: true }); } else { sel = null; targets = []; }
    hintSq = null; renderBoard();
  }

  function choosePromotion() {
    return new Promise((resolve) => {
      const el = $("pzPromo");
      el.hidden = false;
      el.innerHTML = `<div class="pz-promo-card"><div>${t("pz.choosePromo")}</div><div class="pz-promo-row">${["q", "r", "b", "n"].map((p) => `<button type="button" data-p="${p}"><span class="piece ${playerColor === "w" ? "white" : "black"}">${PIECES[playerColor][p]}</span></button>`).join("")}</div></div>`;
      el.querySelectorAll("button").forEach((b) => { b.onclick = () => { el.hidden = true; resolve(b.dataset.p); }; });
    });
  }

  async function attempt(from, to) {
    const cand = targets.filter((m) => m.to === to);
    let promo;
    if (cand.some((m) => m.promotion)) {
      locked = true;
      promo = getSettings().autoQueen ? "q" : await choosePromotion();
      locked = false;
    }
    const uci = from + to + (promo || "");
    sel = null; targets = []; hintSq = null;
    let mv = null;
    try { mv = game.move({ from, to, promotion: promo }); } catch (e) { mv = null; }
    if (!mv) { renderBoard(); return; }
    const ok = uci === pz.moves[ptr] || game.isCheckmate();
    lastMove = { from: mv.from, to: mv.to };
    if (!ok) {
      locked = true; failed = true; flash = { sq: to, cls: "pz-wrong" };
      if (prog.streak) { prog.streak = 0; saveJson(PROG_KEY, prog); renderStats(); }
      setStatus(t("pz.wrong"), "bad"); renderBoard();
      await sleep(750);
      game.undo(); lastMove = null; flash = null; locked = false;
      renderBoard();
      return;
    }
    if (ptr === 1 && isGeniusPuzzle(pz)) badgeSq = mv.to;
    ptr++;
    renderBoard();
    if (ptr >= pz.moves.length || game.isCheckmate()) { finishSolved(); return; }
    locked = true; setStatus(t("pz.keepGoing"), "ok");
    await sleep(520);
    const token = loadToken;
    const om = applyUci(game, pz.moves[ptr]); ptr++;
    if (token !== loadToken) return;
    if (om) lastMove = { from: om.from, to: om.to };
    locked = false; renderBoard();
    if (ptr >= pz.moves.length) { finishSolved(); return; }
    setStatus("");
  }

  async function finishSolved() {
    finished = true; locked = true; sel = null; targets = [];
    const secs = (performance.now() - startTs) / 1000;
    const score = failed ? 0 : hintUsed ? 0.5 : 1;
    const d = applyRating(score);
    const gen = badgeSq ? ` ✦ ${t("pz.genius")}` : "";
    setStatus(`${t("pz.solvedMsg")} ${t("pz.ratingDelta", { d: (d >= 0 ? "+" : "") + d })}${gen}`, "ok");
    renderAll();
    if (ui.mode === "versus" && vsPromise) {
      const token = loadToken;
      const r = await vsPromise;
      if (token === loadToken && !r.cancelled) {
        vs.you += failed ? 0 : 1; if (r.ok) vs.nyra += 1; saveJson(VS_KEY, vs);
        if (r.ok && !failed) r.text += ` — ${secs < r.timeMs / 1000 ? t("pz.vs.youFaster") : t("pz.vs.nyraFaster")}`;
        vsResult = r; renderExtra();
      }
    } else if (ui.mode === "practice" && getSettings().autoNext && !failed && !hintUsed) {
      const token = loadToken;
      await sleep(1600);
      if (token === loadToken && finished) newPuzzle();
    }
  }

  async function finishFailed() {
    finished = true; locked = true; sel = null; targets = [];
    const d = applyRating(0);
    setStatus(`${t("pz.failedMsg")} ${t("pz.ratingDelta", { d })}`, "bad");
    renderAll();
    if (ui.mode === "versus" && vsPromise) {
      const token = loadToken;
      const r = await vsPromise;
      if (token === loadToken && !r.cancelled) { if (r.ok) vs.nyra += 1; saveJson(VS_KEY, vs); vsResult = r; renderExtra(); }
    }
  }

  function showHint() {
    if (locked || finished || !pz) return;
    hintUsed = true;
    hintSq = pz.moves[ptr].slice(0, 2);
    setStatus(t("pz.hint", { sq: hintSq }), "");
    renderBoard();
  }

  async function showSolution() {
    if (locked || finished || !pz) return;
    locked = true; failed = true;
    const token = loadToken;
    const line = solutionSan(pz);
    setStatus(t("pz.solutionIs", { line: line.join(" ") }), "bad");
    sel = null; targets = []; hintSq = null;
    while (ptr < pz.moves.length && token === loadToken) {
      const m = applyUci(game, pz.moves[ptr]); ptr++;
      if (m) lastMove = { from: m.from, to: m.to };
      renderBoard();
      await sleep(650);
    }
    if (token !== loadToken) return;
    await finishFailed();
  }

  // ------------------------------------------------------------ Nyra giải (nền, không hiển thị)
  async function nyraSolve(p, ms, cancelled) {
    const g = new Chess(p.fen);
    applyUci(g, p.moves[0]);
    let i = 1; const t0 = performance.now(); const played = [];
    const ans = solutionSan(p).join(" ");
    try {
      while (i < p.moves.length) {
        if (cancelled && cancelled()) return { ok: false, cancelled: true, text: "", timeMs: 0 };
        const lm = g.moves({ verbose: true }).map((m) => ({ uci: `${m.from}${m.to}${m.promotion || ""}`, san: m.san }));
        const d = await getNyraMove(g.fen(), lm, getApiUrl(), ms);
        const uci = String(d.uci || "").toLowerCase();
        const mv = applyUci(g, uci);
        if (!mv) return { ok: false, timeMs: performance.now() - t0, text: t("pz.vs.nyraBad", { san: uci || "?", ans }) };
        played.push(mv.san);
        if (!(uci === p.moves[i] || g.isCheckmate())) return { ok: false, timeMs: performance.now() - t0, text: t("pz.vs.nyraBad", { san: mv.san, ans }) };
        i++;
        if (g.isCheckmate()) break;
        if (i < p.moves.length) { applyUci(g, p.moves[i]); i++; }
      }
      const timeMs = performance.now() - t0;
      return { ok: true, timeMs, text: t("pz.vs.nyraOk", { s: (timeMs / 1000).toFixed(1) }) };
    } catch (e) { return { ok: false, timeMs: 0, text: t("pz.vs.nyraErr", { msg: e.message }) }; }
  }

  // ------------------------------------------------------------ Nyra tự giải (hiển thị trên bàn)
  async function nyraPlayVisible(p, my) {
    const ans = solutionSan(p).join(" ");
    const ms = getSettings().nyraMs;
    let think = 0;
    while (ptr < p.moves.length) {
      if (my !== runId) return { stopped: true };
      const lm = game.moves({ verbose: true }).map((m) => ({ uci: `${m.from}${m.to}${m.promotion || ""}`, san: m.san }));
      const tk = performance.now();
      const timer = setInterval(() => setStatus(`${t("pz.nyra.thinking")} ${((performance.now() - tk) / 1000).toFixed(1)}s`), 100);
      let d;
      try { d = await getNyraMove(game.fen(), lm, getApiUrl(), ms); } catch (e) { clearInterval(timer); return { ok: false, err: e.message, timeMs: 0 }; } finally { clearInterval(timer); }
      think += performance.now() - tk;
      if (my !== runId) return { stopped: true };
      const uci = String(d.uci || "").toLowerCase();
      const mv = applyUci(game, uci);
      if (!mv) return { ok: false, timeMs: think, ans, san: uci || "?" };
      lastMove = { from: mv.from, to: mv.to };
      const good = uci === p.moves[ptr] || game.isCheckmate();
      if (ptr === 1 && good && isGeniusPuzzle(p)) badgeSq = mv.to;
      setStatus(t("pz.nyra.chose", { san: mv.san }), good ? "ok" : "bad");
      flash = { sq: mv.to, cls: good ? "pz-right" : "pz-wrong" };
      renderBoard();
      await sleep(900);
      flash = null;
      if (!good) { renderBoard(); return { ok: false, timeMs: think, ans, san: mv.san }; }
      ptr++;
      if (game.isCheckmate() || ptr >= p.moves.length) break;
      const om = applyUci(game, p.moves[ptr]); ptr++;
      if (om) lastMove = { from: om.from, to: om.to };
      renderBoard();
      await sleep(450);
    }
    return { ok: true, timeMs: think };
  }

  async function startRun() {
    if (running) return;
    running = true; const my = ++runId; loadToken++;
    ui.count = +($("pzCount")?.value || ui.count); saveJson(UI_KEY, ui);
    session = { n: 0, ok: 0, times: [], best: 0, log: [] };
    ladder = 1000;
    renderActions(); renderExtra();
    for (let i = 0; i < ui.count && running && my === runId; i++) {
      const [lo, hi] = rangeFor();
      let p = null;
      try { p = await pick(lo, hi); } catch (e) { indexErr = true; }
      if (!p || my !== runId) break;
      pz = p; markSeen(p);
      game = new Chess(p.fen); playerColor = game.turn() === "w" ? "b" : "w"; flipped = playerColor === "b";
      ptr = 1; sel = null; targets = []; lastMove = null; flash = null; hintSq = null; badgeSq = null; locked = true; finished = false;
      setStatus(t("pz.oppMoving")); renderAll();
      await sleep(600);
      const m = applyUci(game, p.moves[0]); if (m) lastMove = { from: m.from, to: m.to };
      renderBoard(); await sleep(500);
      const r = await nyraPlayVisible(p, my);
      if (r.stopped || my !== runId) break;
      if (r.err) { setStatus(t("pz.vs.nyraErr", { msg: r.err }), "bad"); break; }
      session.n++;
      const label = `#${i + 1} · ★${p.rating}`;
      if (r.ok) {
        session.ok++; session.times.push(r.timeMs); session.best = Math.max(session.best, p.rating);
        session.log.push({ ok: true, text: `${label} ${t("pz.nyra.ok")} (${(r.timeMs / 1000).toFixed(1)}s)` });
        setStatus(t("pz.nyra.ok"), "ok");
        if (ui.diff === "ladder") ladder += 100;
      } else {
        session.log.push({ ok: false, text: `${label} ${t("pz.nyra.bad", { ans: r.ans })}` });
        setStatus(t("pz.nyra.bad", { ans: r.ans }), "bad");
      }
      finished = true; renderBoard(); renderExtra();
      await sleep(1400);
      if (ui.diff === "ladder" && !r.ok) { session.log.push({ ok: false, text: t("pz.nyra.ladderEnd", { r: p.rating }) }); break; }
    }
    if (my === runId) { setStatus(t("pz.nyra.done"), "ok"); }
    running = false; renderActions(); renderExtra();
  }
  function stopRun() { running = false; runId++; setStatus(t("pz.nyra.stopped")); renderActions(); }

  // ------------------------------------------------------------ chế độ
  function setMode(m) {
    if (m === ui.mode) return;
    running = false; runId++; loadToken++;
    ui.mode = m; saveJson(UI_KEY, ui);
    session = null; pz = null; game = null;
    buildUI();
    if (m === "nyra") { loadIndex().then(() => { renderSource(); }); setStatus(t("pz.nyra.idle")); renderStatus(); }
    else newPuzzle();
  }

  // ------------------------------------------------------------ khởi động
  function resetProgress() {
    prog = { rating: 1200, solved: 0, streak: 0, seen: [] }; vs = { you: 0, nyra: 0 };
    saveJson(PROG_KEY, prog); saveJson(VS_KEY, vs); renderStats(); renderExtra();
  }
  window.addEventListener("nyra-langchange", () => {
    buildUI();
    if (!pz) setStatus(running || ui.mode === "nyra" ? t("pz.nyra.idle") : indexErr ? t("pz.noData") : t("pz.loading"));
    else if (finished || running) setStatus("");
    else setStatus("");
  });
  onSettingsChange(() => { renderInfo(); });

  let started = false;
  function enter() {
    if (started) return;
    started = true;
    loadIndex().then(() => {
      if (!index) { buildUI(); setStatus(t("pz.noData"), "bad"); return; }
      buildUI();
      if (ui.mode === "nyra") setStatus(t("pz.nyra.idle")); else newPuzzle();
    });
  }
  buildUI();
  // chỉ tải dữ liệu khi người dùng mở tab Puzzle lần đầu (tiết kiệm băng thông)
  document.querySelectorAll('[data-tab="puzzle"], [data-drawer="puzzle"]').forEach((b) => b.addEventListener("click", enter));
  if ($("tab-puzzle").classList.contains("active")) enter();
  return { resetProgress };
}
