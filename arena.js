// arena.js — Nyra Arena: hai engine tự đấu, có bàn cờ riêng, đổi màu từng ván, Elo tinh chỉnh được.
// Stockfish chạy tại chỗ (WebAssembly) và dùng UCI_Elo thật của engine (1320–3190, thang CCRL).
import { StockfishEngine, SF_ELO_MIN, SF_ELO_MAX } from "./stockfish-client.js?v=2";

const PIECES = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};
// Khai cuộc ngắn (4 nước). Ván lẻ/chẵn của cùng một cặp dùng chung khai cuộc, đổi màu nhau.
const OPENINGS = [
  ["e4", "e5", "Nf3", "Nc6"], ["e4", "c5", "Nf3", "d6"], ["d4", "d5", "c4", "e6"],
  ["d4", "Nf6", "c4", "g6"], ["e4", "e6", "d4", "d5"], ["c4", "e5", "Nc3", "Nf6"],
  ["Nf3", "d5", "g3", "Nf6"], ["e4", "c6", "d4", "d5"], ["d4", "Nf6", "Nf3", "e6"],
  ["e4", "e5", "Nf3", "Nf6"], ["e4", "d5", "exd5", "Qxd5"], ["d4", "d5", "Nf3", "Nf6"],
];
const PRESETS = [[1500, "1500"], [1800, "1800"], [2000, "2000"], [2200, "2200"], [2500, "2500"], [2800, "2800"], [SF_ELO_MAX, "3190"]];
const CFG_KEY = "nyraArenaCfg";
const MAX_PLY = 300; // quá số nửa nước này thì xử hòa
const NYRA_AUTO_MS = 2000;
const DEFAULTS = {
  a: { engine: "nyra", elo: 2000, full: false, ms: "" },
  b: { engine: "sf", elo: 2000, full: false, ms: "" },
  games: 10, alternate: true, openings: true, speed: 500,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eloFromScore = (s) => -400 * Math.log10(1 / clamp(s, 0.001, 0.999) - 1);

// Ước lượng chênh lệch Elo từ kết quả (A−B) + khoảng tin cậy 95% (xấp xỉ chuẩn trên điểm trung bình mỗi ván)
export function eloEstimate(w, d, l) {
  const n = w + d + l;
  if (!n) return null;
  const s = (w + d / 2) / n;
  const varr = (w * (1 - s) ** 2 + d * (0.5 - s) ** 2 + l * s ** 2) / n;
  const se = Math.sqrt(varr / n);
  const extreme = w === n || l === n;
  if (extreme) {
    // thắng (thua) toàn bộ: chỉ có cận một phía, điểm thật p thoả p^n = 5%
    const b = eloFromScore(Math.pow(0.05, 1 / n));
    return { n, s, extreme: true, dir: w === n ? 1 : -1, diff: w === n ? b : -b, lo: b, hi: b };
  }
  return { n, s, diff: eloFromScore(s), lo: eloFromScore(s - 1.96 * se), hi: eloFromScore(s + 1.96 * se), extreme: false };
}

export function initArena({ Chess, getNyraMove, getApiUrl }) {
  const $ = (id) => document.getElementById(id);
  if (!$("tab-arena")) return;

  // ---------- Cấu hình ----------
  function loadCfg() {
    try {
      const s = JSON.parse(localStorage.getItem(CFG_KEY) || "null");
      if (s && s.a && s.b) return { ...DEFAULTS, ...s, a: { ...DEFAULTS.a, ...s.a }, b: { ...DEFAULTS.b, ...s.b } };
    } catch (e) { /* bỏ qua */ }
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  const cfg0 = loadCfg();

  const sideHtml = (L, c) => `
    <h3>Bên ${L.toUpperCase()}</h3>
    <select id="ar${L}Engine" aria-label="Engine bên ${L.toUpperCase()}">
      <option value="nyra"${c.engine === "nyra" ? " selected" : ""}>Nyra (WASM)</option>
      <option value="sf"${c.engine === "sf" ? " selected" : ""}>Stockfish 19</option>
      <option value="random"${c.engine === "random" ? " selected" : ""}>Random Bot</option>
    </select>
    <div class="ar-elo" id="ar${L}EloBox">
      <div class="ar-elo-row">
        <label for="ar${L}Elo">Elo</label>
        <button type="button" class="ar-step" data-l="${L}" data-d="-50" aria-label="Giảm 50">−</button>
        <input id="ar${L}Elo" type="number" inputmode="numeric" min="${SF_ELO_MIN}" max="${SF_ELO_MAX}" step="10" value="${c.elo}">
        <button type="button" class="ar-step" data-l="${L}" data-d="50" aria-label="Tăng 50">+</button>
      </div>
      <input id="ar${L}EloRange" class="ar-range" type="range" min="${SF_ELO_MIN}" max="${SF_ELO_MAX}" step="10" value="${c.elo}" aria-label="Thanh chỉnh Elo">
      <div class="ar-presets" id="ar${L}Presets">
        ${PRESETS.map(([v, t]) => `<button type="button" class="ar-preset" data-l="${L}" data-v="${v}">${t}</button>`).join("")}
        <button type="button" class="ar-preset ar-full" data-l="${L}" data-full="1">Full</button>
      </div>
    </div>
    <div class="ar-ms-row">
      <label for="ar${L}Ms">Nghĩ/nước (ms)</label>
      <input id="ar${L}Ms" type="number" inputmode="numeric" min="20" max="10000" step="50" value="${c.ms}" placeholder="auto">
    </div>`;
  $("arSideA").innerHTML = sideHtml("a", cfg0.a);
  $("arSideB").innerHTML = sideHtml("b", cfg0.b);
  $("arGames").value = cfg0.games;
  $("arAlternate").checked = cfg0.alternate;
  $("arOpenings").checked = cfg0.openings;
  $("arSpeed").value = String(cfg0.speed);
  const full = { a: !!cfg0.a.full, b: !!cfg0.b.full };

  function readSide(L) {
    const engine = $(`ar${L}Engine`).value;
    const elo = clamp(Math.round(Number($(`ar${L}Elo`).value) || 2000), SF_ELO_MIN, SF_ELO_MAX);
    const msRaw = Math.round(Number($(`ar${L}Ms`).value));
    const ms = msRaw > 0 ? clamp(msRaw, 20, 10000) : 0;
    return { engine, elo, full: full[L], ms, thinkMs: ms || autoMs(engine, elo, full[L]) };
  }
  function autoMs(engine, elo, isFull) {
    if (engine === "nyra") return NYRA_AUTO_MS;
    if (engine === "sf") return isFull ? 1000 : elo < 1800 ? 150 : elo < 2300 ? 300 : elo < 2800 ? 600 : 1000;
    return 0;
  }
  function readCfg() {
    return {
      a: readSide("a"), b: readSide("b"),
      games: clamp(Math.round(Number($("arGames").value)) || 1, 1, 200),
      alternate: $("arAlternate").checked, openings: $("arOpenings").checked,
      speed: Number($("arSpeed").value) || 0,
    };
  }
  function saveCfg() {
    const c = readCfg();
    const strip = (s) => ({ engine: s.engine, elo: s.elo, full: s.full, ms: s.ms || "" });
    try { localStorage.setItem(CFG_KEY, JSON.stringify({ ...c, a: strip(c.a), b: strip(c.b) })); } catch (e) { /* bỏ qua */ }
  }
  const sideName = (s) => s.engine === "nyra" ? "Nyra" : s.engine === "random" ? "Random Bot" : `Stockfish ${s.full ? "Full" : s.elo}`;
  function sideBadge(s) {
    if (s.engine === "random") return "ngẫu nhiên";
    if (s.engine === "nyra") return `${s.thinkMs}ms / nước`;
    return `${s.full ? "không giới hạn" : "Elo " + s.elo} · ${s.thinkMs}ms`;
  }

  function refreshSetupUi() {
    for (const L of ["a", "b"]) {
      const s = readSide(L);
      $(`ar${L}EloBox`).style.display = s.engine === "sf" ? "" : "none";
      $(`ar${L}Ms`).placeholder = s.engine === "random" ? "—" : `auto ≈ ${autoMs(s.engine, s.elo, s.full)}`;
      $(`ar${L}Ms`).disabled = s.engine === "random";
      $(`ar${L}Presets`).querySelectorAll(".ar-preset").forEach((b) => {
        const on = b.dataset.full ? s.full : !s.full && Number(b.dataset.v) === s.elo;
        b.classList.toggle("on", on);
      });
      $(`ar${L}Elo`).classList.toggle("dim", s.full);
      $(`ar${L}EloRange`).classList.toggle("dim", s.full);
    }
    if (!running) { renderPlayers(null); renderScore(); }
    saveCfg();
  }
  function setElo(L, v) {
    full[L] = false;
    const e = clamp(Math.round(v), SF_ELO_MIN, SF_ELO_MAX);
    $(`ar${L}Elo`).value = e;
    $(`ar${L}EloRange`).value = e;
    refreshSetupUi();
  }
  for (const L of ["a", "b"]) {
    $(`ar${L}Engine`).addEventListener("change", refreshSetupUi);
    $(`ar${L}Elo`).addEventListener("input", () => { full[L] = false; $(`ar${L}EloRange`).value = clamp(Number($(`ar${L}Elo`).value) || SF_ELO_MIN, SF_ELO_MIN, SF_ELO_MAX); refreshSetupUi(); });
    $(`ar${L}Elo`).addEventListener("blur", () => setElo(L, Number($(`ar${L}Elo`).value) || 2000));
    $(`ar${L}EloRange`).addEventListener("input", () => setElo(L, Number($(`ar${L}EloRange`).value)));
    $(`ar${L}Ms`).addEventListener("input", refreshSetupUi);
  }
  $("arSideA").parentElement.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t || !t.dataset.l) return;
    const L = t.dataset.l;
    if (t.dataset.d) setElo(L, (Number($(`ar${L}Elo`).value) || 2000) + Number(t.dataset.d));
    else if (t.dataset.full) { full[L] = true; $(`ar${L}Elo`).value = SF_ELO_MAX; $(`ar${L}EloRange`).value = SF_ELO_MAX; refreshSetupUi(); }
    else if (t.dataset.v) setElo(L, Number(t.dataset.v));
  });
  for (const id of ["arGames", "arAlternate", "arOpenings", "arSpeed"]) $(id).addEventListener("change", refreshSetupUi);

  // ---------- Bàn cờ riêng của Arena ----------
  const boardEl = $("arBoard");
  const sqEls = [];
  (function buildBoard() {
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const rank = 8 - r;
      const el = document.createElement("div");
      el.className = `square ${(f + rank) % 2 === 0 ? "light" : "dark"}`;
      el.dataset.sq = "abcdefgh"[f] + rank;
      if (f === 0) { const c = document.createElement("i"); c.className = "ar-coord ar-rank"; c.textContent = rank; el.appendChild(c); }
      if (r === 7) { const c = document.createElement("i"); c.className = "ar-coord ar-file"; c.textContent = "abcdefgh"[f]; el.appendChild(c); }
      boardEl.appendChild(el);
      sqEls.push(el);
    }
  })();
  function drawBoard(chess, last) {
    const b = chess.board();
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const el = sqEls[r * 8 + f];
      const old = el.querySelector(".piece");
      if (old) old.remove();
      const p = b[r][f];
      if (p) {
        const sp = document.createElement("span");
        sp.className = `piece ${p.color === "w" ? "white" : "black"}`;
        sp.textContent = PIECES[p.color][p.type];
        el.appendChild(sp);
      }
      el.classList.toggle("last-move", !!last && (last.from === el.dataset.sq || last.to === el.dataset.sq));
    }
  }
  function setEvalBar(wcp, mate) {
    let pct = 50;
    if (mate != null) pct = mate > 0 ? 100 : 0;
    else if (wcp != null && Math.abs(wcp) >= BIG_CP) pct = wcp > 0 ? 100 : 0;
    else if (wcp != null) pct = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * wcp)) - 1);
    $("arEvalFill").style.height = `${clamp(pct, 0, 100)}%`;
  }
  const BIG_CP = 20000; // điểm lớn hơn mức này coi như đã thấy chiếu hết
const fmtEval = (wcp, mate) => mate != null ? `#${mate > 0 ? "" : "-"}${Math.abs(mate)}` : wcp == null ? "" : Math.abs(wcp) >= BIG_CP ? (wcp > 0 ? "#" : "#−") : `${wcp > 0 ? "+" : ""}${(wcp / 100).toFixed(2)}`;

  // ---------- Trạng thái trận ----------
  let running = false, runId = 0;
  let curCfg = null, aWhite = true;
  let tally = { w: 0, d: 0, l: 0 }; // theo bên A
  let results = [], pgns = [];
  const engines = { a: null, b: null };
  let wakeLock = null;

  function playersByColor() {
    const c = running && curCfg ? curCfg : readCfg();
    const wSide = aWhite ? "a" : "b";
    return { white: { L: wSide, s: c[wSide] }, black: { L: wSide === "a" ? "b" : "a", s: c[wSide === "a" ? "b" : "a"] } };
  }
  function renderPlayers(thinkingColor, info) {
    const { white, black } = playersByColor();
    for (const [col, p] of [["white", white], ["black", black]]) {
      const el = $(col === "white" ? "arBarWhite" : "arBarBlack");
      el.querySelector(".ar-pname").textContent = sideName(p.s);
      el.querySelector(".ar-ptag").textContent = p.L.toUpperCase();
      el.querySelector(".ar-pbadge").textContent = sideBadge(p.s);
      el.classList.toggle("thinking", thinkingColor === (col === "white" ? "w" : "b"));
      if (info && info.color === (col === "white" ? "w" : "b")) el.querySelector(".ar-pinfo").textContent = info.text;
    }
  }
  function renderScore() {
    const c = (running || results.length) && curCfg ? curCfg : readCfg();
    const aPts = tally.w + tally.d / 2, bPts = tally.l + tally.d / 2;
    $("arNameA").textContent = sideName(c.a);
    $("arNameB").textContent = sideName(c.b);
    $("arPtsA").textContent = aPts;
    $("arPtsB").textContent = bPts;
    $("arWdl").textContent = `A: +${tally.w} =${tally.d} −${tally.l}`;
    renderEstimate(c);
  }
  function renderEstimate(c) {
    const est = eloEstimate(tally.w, tally.d, tally.l);
    const el = $("arEstimate");
    if (!est) { el.innerHTML = ""; return; }
    if (est.n < 3) { el.innerHTML = `<small class="ar-warn">Cần thêm ván để ước lượng Elo (mới ${est.n}).</small>`; return; }
    const f = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))}`;
    const cap = (v) => clamp(v, -1200, 1200);
    const lines = [];
    const pre = est.extreme ? (est.dir > 0 ? "≥ " : "≤ ") : "";
    lines.push(`Chênh lệch A−B: <b>${pre}${f(cap(est.diff))} Elo</b>` + (!est.extreme ? ` <small>(95%: ${f(cap(est.lo))} … ${f(cap(est.hi))})</small>` : ` <small>(cận 95%)</small>`));
    const sfA = c.a.engine === "sf" && !c.a.full, sfB = c.b.engine === "sf" && !c.b.full;
    if (sfA !== sfB) {
      const ref = sfA ? c.a : c.b, other = sfA ? c.b : c.a;
      const rate = (d) => Math.round(sfA ? ref.elo - d : ref.elo + d);
      if (est.extreme) {
        lines.push(`${sideName(other)} ${(est.dir > 0) === sfB ? "≥" : "≤"} <b>${rate(cap(est.diff))} Elo</b> <small>trên thang Stockfish</small>`);
      } else {
        const mid = rate(cap(est.diff)), lo = Math.min(rate(cap(est.lo)), rate(cap(est.hi))), hi = Math.max(rate(cap(est.lo)), rate(cap(est.hi)));
        lines.push(`${sideName(other)} ≈ <b>${mid} Elo</b> <small>trên thang Stockfish (${lo} … ${hi})</small>`);
      }
    } else if (sfA && sfB) {
      lines.push(`<small>Theo Elo đã đặt: ${f(c.a.elo - c.b.elo)}</small>`);
    }
    if (est.n < 10) lines.push(`<small class="ar-warn">Mới ${est.n} ván — cần ≥ 30 ván mới tin được.</small>`);
    el.innerHTML = lines.join("<br>");
  }
  function renderResults() {
    $("arChips").innerHTML = results.map((r) => {
      const cls = r.res === "A" ? "win" : r.res === "B" ? "loss" : "draw";
      return `<span class="ar-chip-res ${cls}" title="Ván ${r.g}: ${r.text}">${r.g}</span>`;
    }).join("");
    $("arPgnBtn").disabled = !pgns.length;
  }
  function renderMoves(chess) {
    const h = chess.history();
    const out = [];
    for (let i = 0; i < h.length; i += 2) out.push(`<span class="ar-mv"><i>${i / 2 + 1}.</i> ${h[i]}${h[i + 1] ? " " + h[i + 1] : ""}</span>`);
    const el = $("arMoves");
    el.innerHTML = out.join("");
    el.scrollLeft = el.scrollWidth;
  }

  // ---------- Engine ----------
  function getSf(L) {
    if (!engines[L]) engines[L] = new StockfishEngine();
    return engines[L];
  }
  async function pickMove(L, s, chess) {
    const fen = chess.fen();
    if (s.engine === "random") {
      const mv = chess.moves({ verbose: true });
      const m = mv[Math.floor(Math.random() * mv.length)];
      return { uci: m.from + m.to + (m.promotion || ""), cp: null, mate: null, depth: null };
    }
    if (s.engine === "sf") {
      const r = await getSf(L).bestMove(fen, { elo: s.elo, full: s.full, movetime: s.thinkMs });
      return { uci: r.uci, cp: r.cp, mate: r.mate, depth: r.depth };
    }
    const lm = chess.moves({ verbose: true }).map((m) => ({ uci: `${m.from}${m.to}${m.promotion || ""}`, san: m.san }));
    const d = await getNyraMove(fen, lm, getApiUrl(), s.thinkMs);
    const book = d.search && d.search.method === "Opening Book";
    return { uci: String(d.uci || "").toLowerCase(), cp: book ? null : (d.search && Number.isFinite(d.search.score) ? d.search.score : null), mate: null, depth: book ? null : (d.search && d.search.depth), book };
  }
  function outcome(chess) {
    if (chess.isCheckmate()) return { winner: chess.turn() === "w" ? "b" : "w", why: "chiếu hết" };
    if (chess.isStalemate()) return { winner: null, why: "hết nước đi (hòa)" };
    if (chess.isInsufficientMaterial()) return { winner: null, why: "không đủ quân chiếu hết" };
    if (chess.isThreefoldRepetition()) return { winner: null, why: "lặp thế 3 lần" };
    if (chess.isDrawByFiftyMoves()) return { winner: null, why: "luật 50 nước" };
    if (chess.isDraw()) return { winner: null, why: "hòa" };
    return null;
  }

  // ---------- Vòng đấu ----------
  function setStatus(t) { $("arStatus").textContent = t; }
  function setRunningUi(on) {
    $("arStart").disabled = on;
    $("arStop").disabled = !on;
    $("arFloatStop").disabled = !on;
    document.body.classList.toggle("ar-running", on);
  }

  async function runMatch() {
    if (running) return;
    const c = readCfg();
    saveCfg();
    curCfg = c;
    const my = ++runId;
    running = true;
    tally = { w: 0, d: 0, l: 0 };
    results = []; pgns = [];
    setRunningUi(true);
    $("arSetup").classList.add("collapsed");
    $("arToggleSetup").textContent = "⚙ Cài đặt";
    $("arPgnBtn").disabled = true;
    try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { wakeLock = null; }

    const order = OPENINGS.map((_, i) => i).sort(() => Math.random() - 0.5);
    let endText = "Đã hoàn thành!";
    try {
      for (let g = 1; g <= c.games; g++) {
        if (my !== runId) { endText = "Đã dừng."; break; }
        aWhite = c.alternate ? g % 2 === 1 : true;
        const chess = new Chess();
        let last = null;
        const pair = c.alternate ? Math.floor((g - 1) / 2) : g - 1;
        const line = c.openings ? OPENINGS[order[pair % order.length]] : [];
        for (const san of line) { const m = chess.move(san); last = { from: m.from, to: m.to }; }

        for (const L of ["a", "b"]) if (c[L].engine === "sf") await getSf(L).newGame();

        const names = playersByColor();
        renderPlayers(null);
        $("arPtsA").textContent = tally.w + tally.d / 2;
        $("arPtsB").textContent = tally.l + tally.d / 2;
        renderScore();
        $("arGameNo").textContent = `Ván ${g}/${c.games}`;
        $("arProgress").style.width = `${((g - 1) / c.games) * 100}%`;
        $("arBarWhite").querySelector(".ar-pinfo").textContent = "";
        $("arBarBlack").querySelector(".ar-pinfo").textContent = "";
        setEvalBar(0, null);
        drawBoard(chess, last);
        renderMoves(chess);
        setStatus(c.openings ? `Khai cuộc: ${line.join(" ")}` : "Bắt đầu ván");

        let res = outcome(chess), errored = null;
        while (!res && my === runId) {
          if (chess.history().length >= MAX_PLY) { res = { winner: null, why: `quá ${MAX_PLY / 2} nước (xử hòa)` }; break; }
          const color = chess.turn();
          const p = color === "w" ? names.white : names.black;
          renderPlayers(color);
          setStatus(`${sideName(p.s)} đang nghĩ…`);
          const t0 = performance.now();
          let mv;
          try { mv = await pickMove(p.L, p.s, chess); }
          catch (e) { errored = `${sideName(p.s)}: ${e.message || e}`; break; }
          if (my !== runId) break;
          const wait = c.speed - (performance.now() - t0);
          if (wait > 0) await sleep(wait); else await sleep(0);
          if (my !== runId) break;
          let m = null;
          try { m = chess.move({ from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), ...(mv.uci.length > 4 ? { promotion: mv.uci[4] } : {}) }); } catch (e) { m = null; }
          if (!m) { errored = `${sideName(p.s)} đi nước không hợp lệ (${mv.uci})`; break; }
          last = { from: m.from, to: m.to };
          drawBoard(chess, last);
          renderMoves(chess);
          const wcp = mv.cp == null ? null : (color === "w" ? mv.cp : -mv.cp);
          const wmate = mv.mate == null ? null : (color === "w" ? mv.mate : -mv.mate);
          if (wcp != null || wmate != null) setEvalBar(wcp, wmate);
          const forced = wmate != null || (wcp != null && Math.abs(wcp) >= BIG_CP);
          const info = [mv.book ? "sách khai cuộc" : mv.depth && !forced ? `d${mv.depth}` : "", fmtEval(wcp, wmate)].filter(Boolean).join(" · ");
          renderPlayers(null, { color, text: info });
          res = outcome(chess);
        }

        if (my !== runId) { endText = "Đã dừng."; break; }
        if (errored) { endText = `Dừng do lỗi — ${errored}`; setStatus(endText); break; }

        // ghi kết quả (theo bên A)
        const aColor = aWhite ? "w" : "b";
        let r, text;
        if (res.winner === null) { tally.d++; r = "D"; text = `Hòa — ${res.why}`; setEvalBar(0, null); }
        else if (res.winner === aColor) { tally.w++; r = "A"; text = `${sideName(c.a)} thắng — ${res.why}`; }
        else { tally.l++; r = "B"; text = `${sideName(c.b)} thắng — ${res.why}`; }
        if (res.winner) setEvalBar(null, res.winner === "w" ? 1 : -1);
        results.push({ g, res: r, text: `${text} (${Math.ceil(chess.history().length / 2)} nước)` });
        const resStr = res.winner === null ? "1/2-1/2" : res.winner === "w" ? "1-0" : "0-1";
        const wP = names.white.s, bP = names.black.s;
        chess.setHeader("Event", "Nyra Arena");
        chess.setHeader("Site", "uyen11a1-star.github.io/nyra-chess");
        chess.setHeader("Date", new Date().toISOString().slice(0, 10).replace(/-/g, "."));
        chess.setHeader("Round", String(g));
        chess.setHeader("White", sideName(wP));
        chess.setHeader("Black", sideName(bP));
        if (wP.engine === "sf" && !wP.full) chess.setHeader("WhiteElo", String(wP.elo));
        if (bP.engine === "sf" && !bP.full) chess.setHeader("BlackElo", String(bP.elo));
        chess.setHeader("Result", resStr);
        pgns.push(chess.pgn());
        renderScore();
        renderResults();
        $("arProgress").style.width = `${(g / c.games) * 100}%`;
        renderPlayers(null);
        setStatus(text);
        await sleep(c.speed > 0 ? Math.min(1200, c.speed * 2) : 0);
      }
    } finally {
      if (my === runId) {
        running = false;
        setRunningUi(false);
        for (const L of ["a", "b"]) if (engines[L]) engines[L].stop();
        try { if (wakeLock) await wakeLock.release(); } catch (e) { /* bỏ qua */ }
        wakeLock = null;
      }
    }
    if (my === runId) {
      running = false;
      if (endText === "Đã hoàn thành!") setStatus(`Xong ${results.length} ván.`);
      else setStatus(endText);
      $("arGameNo").textContent = endText === "Đã hoàn thành!" ? "Hoàn thành" : endText.startsWith("Đã dừng") ? "Đã dừng" : "Lỗi";
    }
  }

  function stopMatch() {
    if (!running) return;
    runId++;
    running = false;
    for (const L of ["a", "b"]) if (engines[L]) engines[L].stop();
    setRunningUi(false);
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* bỏ qua */ }
    wakeLock = null;
    setStatus("Đã dừng.");
    $("arGameNo").textContent = "Đã dừng";
  }

  // ---------- Nút bấm ----------
  $("arStart").addEventListener("click", runMatch);
  $("arStop").addEventListener("click", stopMatch);
  $("arFloatStop").addEventListener("click", stopMatch);
  $("arToggleSetup").addEventListener("click", () => {
    const on = $("arSetup").classList.toggle("collapsed");
    $("arToggleSetup").textContent = on ? "⚙ Cài đặt" : "▴ Thu gọn";
  });
  $("arPgnBtn").addEventListener("click", () => {
    if (!pgns.length) return;
    const blob = new Blob([pgns.join("\n\n") + "\n"], { type: "application/x-chess-pgn;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nyra-arena-${new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19)}.pgn`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  });
  function setVideo(on) {
    document.body.classList.toggle("ar-video", on);
    try {
      if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (e) { /* bỏ qua */ }
  }
  $("arVideoBtn").addEventListener("click", () => setVideo(true));
  $("arFloatExit").addEventListener("click", () => setVideo(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("ar-video")) setVideo(false); });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) document.body.classList.remove("ar-video"); });

  // khởi tạo hiển thị
  drawBoard(new Chess(), null);
  renderMoves(new Chess());
  refreshSetupUi();
  renderScore();
  setEvalBar(0, null);
}
