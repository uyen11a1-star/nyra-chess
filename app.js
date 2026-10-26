import { Chess } from "./vendor/chess.js?v=1";
import { getNyraMove, hasLocalNyra } from "./nyra-client.js?v=4";
import { reviewGame, CLASS_INFO, CLASS_ORDER } from "./nyra-review.js?v=3";
import { initArena } from "./arena.js?v=2";
import { StockfishEngine, SF_LEVELS } from "./stockfish-client.js?v=2";
import { initI18n } from "./i18n.js?v=5";
import { initSettings } from "./settings.js?v=5";
import { initPuzzle } from "./puzzle.js?v=5";
import { sfx } from "./sound.js?v=4";
import { slideMove } from "./fx.js?v=1";

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";

const API_DEFAULT = "https://nyra-chess-api.onrender.com/move";
const STATS_KEY = "nyraChessStats";
const PIECES = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

const chess = new Chess();
let displayChess = chess;
let lastNyraInfo = "";
const OPP_KEY = "nyraChessOpponent";
let opponent = "nyra";
try { const o = localStorage.getItem(OPP_KEY); if (o === "nyra" || SF_LEVELS[o]) opponent = o; } catch (e) {}
let sfPlay = null;
const oppName = () => (SF_LEVELS[opponent] ? SF_LEVELS[opponent].label : "Nyra");
let selectedSquare = null;
let legalTargets = [];
let flipped = false;
let thinking = false;
let lastMove = null;
let animMove = null;   // nước vừa đi, để trượt quân ở lần vẽ bàn kế tiếp
let requestId = 0;

let timeWhite = 600, timeBlack = 600, increment = 0;
let clockInterval = null, isGameActive = false, isPaused = false;
let timeOver = false;
let timeOverMsg = null;
let clockStack = [];

let statusOverride = null;
let resultRecorded = false;
let recordedOutcome = null;
let stats = { total: 0, wins: 0, losses: 0, draws: 0 };

let currentReview = null;
let markingBoardOpen = false;
let importedResult = null; // kết quả đọc từ PGN nhập vào (chỉ dùng khi chưa đi thêm nước nào)
let viewPly = null; // null = đang ở thế cờ hiện tại; số = đang xem lại sau `viewPly` nước

function safeAddEvent(id, event, callback) {
  const el = $(id);
  if (el) el.addEventListener(event, callback);
}

function setStatus(title, text) {
  statusOverride = { title, text };
}

function setConnection(state, label) {
  const dots = document.querySelectorAll(".status-dot, .state-dot");
  for (const d of dots) {
    d.classList.remove("off", "busy");
    if (state === "off") d.classList.add("off");
    else if (state === "busy") d.classList.add("busy");
  }
  if ($("connectionLabel")) $("connectionLabel").textContent = label;
  const apiState = $("apiState");
  if (apiState) {
    const labelEl = apiState.lastElementChild;
    if (labelEl && labelEl !== apiState && labelEl.tagName === "SPAN") labelEl.textContent = label;
  }
}

function gameResult() {
  if (importedResult) return importedResult;
  if (timeOver) return timeWhite <= 0 ? "0-1" : "1-0";
  if (chess.isCheckmate()) return chess.turn() === "w" ? "0-1" : "1-0";
  if (chess.isGameOver()) return "1/2-1/2";
  return "*";
}

// PGN chuẩn (có header + kết quả) để copy/tải về
function buildPgn() {
  const hist = chess.history({ verbose: true });
  if (!hist.length) return "";
  const c = new Chess();
  for (const m of hist) {
    try {
      c.move({ from: m.from, to: m.to, promotion: m.promotion });
    } catch (e) { break; }
  }
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  c.header(
    "Event", "Nyra Chess",
    "Site", "Nyra Chess Lab",
    "Date", date,
    "Round", "-",
    "White", "Bạn",
    "Black", oppName(),
    "Result", gameResult()
  );
  return c.pgn();
}

function updatePgnBox() {
  const pgn = buildPgn();
  $("pgnText").value = pgn || "";
  $("pgnText").placeholder = pgn ? "PGN ở trên" : "Chưa có ván cờ nào.";
}

function renderStats() {
  $("statTotal").textContent = stats.total;
  $("statWins").textContent = stats.wins;
  $("statLosses").textContent = stats.losses;
  $("statDraws").textContent = stats.draws;
}

function renderHistory() {
  const c = $("moveHistory");
  if (!c) return;
  c.innerHTML = "";
  const h = chess.history();
  if (!h.length) { c.innerHTML = '<p class="empty-history">Trống.</p>'; return; }
  for (let i = 0; i < h.length; i += 2) {
    const row = document.createElement("div");
    row.className = "move-row";
    const w = document.createElement("span"); w.className = "move-white"; w.textContent = h[i];
    const b = document.createElement("span"); b.className = "move-black"; b.textContent = h[i + 1] || "";
    row.innerHTML = `<span class="move-number">${Math.floor(i / 2) + 1}.</span>`;
    row.appendChild(w); row.appendChild(b);
    c.appendChild(row);
  }
  c.scrollTop = c.scrollHeight;
}

function isUnlimited() {
  const sel = $("timeControlSelect");
  return !sel || sel.value === "unlimited";
}

function updateClockUI() {
  if (!isUnlimited()) {
    $("timeWhite").textContent = formatTime(timeWhite);
    $("timeBlack").textContent = formatTime(timeBlack);
    return;
  }
  $("timeWhite").textContent = "∞";
  $("timeBlack").textContent = "∞";
}

function formatTime(s) {
  if (s < 0) s = 0;
  return `${Math.floor(s / 60)}:${(Math.floor(s % 60)).toString().padStart(2, "0")}`;
}

function stopClock() {
  if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
}

function runClock() {
  if (clockInterval || isUnlimited() || timeOver || chess.isGameOver()) { updateClockUI(); return; }
  isGameActive = true;
  clockInterval = setInterval(() => {
    if (!isGameActive || isPaused || isUnlimited() || chess.isGameOver() || timeOver) return;
    if (chess.turn() === "w") timeWhite--; else timeBlack--;
    if (timeWhite <= 0 || timeBlack <= 0) endByTime();
    updateClockUI();
  }, 1000);
  updateClockUI();
}

function startClock() {
  stopClock();
  isGameActive = true; isPaused = false;
  runClock();
  updateClockUI();
}

function endByTime() {
  timeWhite = Math.max(0, timeWhite);
  timeBlack = Math.max(0, timeBlack);
  timeOver = true;
  isGameActive = false;
  stopClock();
  const loser = timeWhite <= 0 ? "w" : "b";
  timeOverMsg = {
    title: `${loser === "w" ? "Đen" : "Trắng"} thắng!`,
    text: `${loser === "w" ? "Trắng" : "Đen"} đã hết giờ.`,
  };
  recordResult("timeout");
  updatePgnBox();
  updateUI();
  runAutoReview();
}

function setupClock() {
  const sel = $("timeControlSelect");
  if (!sel) return;
  const val = sel.value;
  if (val === "unlimited") { timeWhite = 99999; timeBlack = 99999; increment = 0; }
  else if (val.includes("+")) {
    const p = val.split("+");
    timeWhite = parseInt(p[0], 10);
    timeBlack = timeWhite;
    increment = parseInt(p[1], 10);
  } else {
    timeWhite = parseInt(val, 10);
    timeBlack = timeWhite;
    increment = 0;
  }
  updateClockUI();
}

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === "tab-" + tab));
  document.body.classList.toggle("play-tab", tab === "play");
  if (tab === "play") updatePgnBox();
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function openDrawer() {
  $("navDrawer").classList.add("open");
  const ov = document.querySelector(".drawer-overlay");
  if (ov) ov.classList.add("open");
}
function closeDrawer() {
  $("navDrawer").classList.remove("open");
  const ov = document.querySelector(".drawer-overlay");
  if (ov) ov.classList.remove("open");
}
$("hamburgerBtn").addEventListener("click", (e) => {
  e.preventDefault();
  $("navDrawer").classList.contains("open") ? closeDrawer() : openDrawer();
});
document.querySelector(".drawer-overlay")?.addEventListener("click", closeDrawer);
document.querySelectorAll(".navdrawer-item").forEach(a => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    if (a.dataset.action === "import") {
      closeDrawer();
      openPgnImport();
      return;
    }
    switchTab(a.dataset.drawer);
    closeDrawer();
  });
});

function positionAt(ply) {
  const c = new Chess();
  const hist = chess.history({ verbose: true });
  for (let i = 0; i < ply && i < hist.length; i++) {
    try {
      c.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
    } catch (e) { break; }
  }
  return c;
}

function historyLength() {
  return chess.history().length;
}

// ply = số nước muốn xem; >= tổng số nước thì quay về thế cờ hiện tại
function navTo(ply) {
  const n = historyLength();
  if (n === 0) return;
  if (ply < 0) ply = 0;
  viewPly = ply >= n ? null : ply;
  selectedSquare = null;
  legalTargets = [];
  statusOverride = null;
  updateUI();
}

function updateNav() {
  const n = historyLength();
  const p = viewPly === null ? n : viewPly;
  const atStart = p <= 0;
  const atEnd = viewPly === null;
  if ($("navCounter")) $("navCounter").textContent = `${p}/${n}`;
  if ($("navStart")) $("navStart").disabled = atStart;
  if ($("navPrev")) $("navPrev").disabled = atStart;
  if ($("navNext")) $("navNext").disabled = atEnd;
  if ($("navEnd")) $("navEnd").disabled = atEnd;
}

function renderBoard() {
  const boardEl = $("board");
  if (!boardEl) return;
  boardEl.innerHTML = "";
  const targets = new Set(legalTargets.map(m => m.to));
  const hist = chess.history({ verbose: true });
  const browsing = viewPly !== null;
  const toDisp = browsing ? positionAt(viewPly) : (displayChess || chess);
  const hlMove = browsing
    ? (viewPly > 0 ? { from: hist[viewPly - 1].from, to: hist[viewPly - 1].to } : null)
    : lastMove;
  const files = flipped ? "hgfedcba" : "abcdefgh";
  const ranks = flipped ? "12345678" : "87654321";

  for (const rank of ranks) {
    for (const file of files) {
      const square = file + rank;
      const isLight = ((file.charCodeAt(0) - 97) + Number(rank)) % 2 === 0;
      const btn = document.createElement("button");
      btn.className = `square ${isLight ? "light" : "dark"}`;
      btn.dataset.sq = square;
      if (selectedSquare === square) btn.classList.add("selected");
      if (targets.has(square)) btn.classList.add(pieceOn(toDisp, square) ? "capture" : "legal");
      if (hlMove && (hlMove.from === square || hlMove.to === square)) btn.classList.add("last-move");
      const piece = toDisp.get(square);
      if (piece) {
        const span = document.createElement("span");
        span.className = `piece ${piece.color === "w" ? "white" : "black"}`;
        span.textContent = PIECES[piece.color][piece.type];
        btn.appendChild(span);
      }
      btn.onclick = () => onSquareClick(square);
      boardEl.appendChild(btn);
    }
  }
  // bàn cờ có thể được vẽ lại 2 lần liền nhau (sau nước đi rồi tới lúc máy suy nghĩ) → giữ hiệu ứng thêm ~250ms
  if (animMove) { if (performance.now() - animMove.t < 250) { if (!browsing) slideMove(boardEl, animMove.from, animMove.to); } else animMove = null; }
  const rankLabels = document.querySelector(".rank-labels");
  const fileLabels = document.querySelector(".file-labels");
  if (rankLabels) rankLabels.innerHTML = [...ranks].map(v => `<span>${v}</span>`).join("");
  if (fileLabels) fileLabels.innerHTML = [...files].map(v => `<span>${v}</span>`).join("");
}

function pieceOn(chessInst, sq) { return chessInst.get(sq); }

function onSquareClick(square) {
  if (viewPly !== null) {
    setStatus("Đang xem lại ván", "Bấm ⏭ (về hiện tại) trước khi đi nước mới.");
    updateUI();
    return;
  }
  if (thinking || chess.isGameOver() || isPaused || timeOver) return;
  const piece = chess.get(square);
  if (selectedSquare && legalTargets.some(m => m.to === square)) {
    const fromSq = selectedSquare;
    const isPromotion = legalTargets.some(m => m.to === square && m.promotion);
    selectedSquare = null;
    legalTargets = [];
    statusOverride = null;

    let promo = "q";
    if (isPromotion) {
      const answer = prompt("Phong cấp (q/r/b/n):", "q");
      if (answer === null) {
        selectedSquare = fromSq;
        legalTargets = chess.moves({ square: fromSq, verbose: true });
        renderBoard();
        return;
      }
      const picked = String(answer).trim().toLowerCase().charAt(0);
      if (picked === "q" || picked === "r" || picked === "b" || picked === "n") promo = picked;
    }

    clockStack.push({ w: timeWhite, b: timeBlack });
    let move = null;
    try {
      move = chess.move({ from: fromSq, to: square, ...(isPromotion ? { promotion: promo } : {}) });
    } catch (_) { move = null; }
    if (!move) {
      clockStack.pop();
      selectedSquare = fromSq;
      legalTargets = chess.moves({ square: fromSq, verbose: true });
      setStatus("Nước đi không hợp lệ", "Hãy chọn lại ô đến.");
      renderBoard();
      return;
    }
    lastMove = { from: move.from, to: move.to };
    animMove = { from: move.from, to: move.to, t: performance.now() }; sfx.move(move);
    importedResult = null;
    if (!isPaused && !isUnlimited()) {
      if (chess.turn() === "w") timeBlack += increment; else timeWhite += increment;
    }
    if (!isGameActive && !chess.isGameOver() && !isUnlimited()) startClock();
    updateUI();
    if (!chess.isGameOver() && chess.turn() === "b") requestNyraMove();
    return;
  }
  if (piece && piece.color === chess.turn()) {
    selectedSquare = square;
    legalTargets = chess.moves({ square, verbose: true });
  } else {
    selectedSquare = null;
    legalTargets = [];
  }
  renderBoard();
}

async function requestNyraMove() {
  if (viewPly !== null || thinking || chess.isGameOver() || chess.turn() !== "b") return;
  const ep = $("endpointInput").value.trim().replace(/\/+$/, "");
  const lvl = SF_LEVELS[opponent];
  if (!lvl && !ep && !hasLocalNyra()) return;
  const thisReq = ++requestId;
  const fenB = chess.fen();
  thinking = true;
  setStatus(`${oppName()} đang tính...`, "Đang tìm nước đi tốt nhất...");
  setConnection("busy", lvl ? "STOCKFISH ĐANG NGHĨ" : "ĐANG KẾT NỐI ENGINE");
  updateUI();
  try {
    const lm = chess.moves({ verbose: true }).map(m => ({
      uci: `${m.from}${m.to}${m.promotion || ""}`,
      san: m.san,
    }));
    let d;
    if (lvl) {
      if (!sfPlay) sfPlay = new StockfishEngine();
      if (chess.history().length <= 1) await sfPlay.newGame();
      const t0 = performance.now();
      const r = await sfPlay.bestMove(fenB, { elo: lvl.elo, movetime: lvl.movetime });
      const rnd = lvl.blunder && Math.random() < lvl.blunder && lm.length > 1;
      d = {
        uci: rnd ? lm[Math.floor(Math.random() * lm.length)].uci : r.uci,
        search: { depth: rnd ? "ngẫu nhiên" : r.depth, time_ms: Math.round(performance.now() - t0) },
        source: "sf",
      };
    } else d = await getNyraMove(fenB, lm, ep);
    if (thisReq !== requestId || chess.fen() !== fenB) return;
    if (timeOver || chess.isGameOver()) return;
    lastNyraInfo =
      `${d.source === "sf" ? oppName() : `Nyra (${d.source === "wasm" ? "wasm" : "API"})`}: ` +
      (d.search?.method === "Opening Book" ? "sách khai cuộc" : `Depth ${d.search?.depth ?? "?"} · ${d.search?.time_ms ?? "?"}ms`);
    if ($("engineMode")) $("engineMode").textContent = d.source === "sf" ? `UCI_Elo ${lvl.elo}${lvl.blunder ? " + sai ngẫu nhiên" : ""}` : d.source === "wasm" ? "NYRA WASM" : "NYRA API";
    setConnection("on", d.source === "sf" ? "STOCKFISH ĐANG CHẠY" : d.source === "wasm" ? "NYRA WASM ĐANG CHẠY" : "NYRA API ĐANG CHẠY");
    const u = String(d.uci || "").toLowerCase();
    clockStack.push({ w: timeWhite, b: timeBlack });
    let move, fallback = false;
    try {
      move = chess.move({
        from: u.slice(0, 2),
        to: u.slice(2, 4),
        ...(u.length > 4 ? { promotion: u[4] } : {}),
      });
    } catch (err) {
      const legal = chess.moves({ verbose: true });
      if (!legal.length) { clockStack.pop(); throw err; }
      try { move = chess.move(legal[0].san); fallback = true; } catch (e2) { clockStack.pop(); throw err; }
    }
    if (!isPaused && !isUnlimited()) {
      if (chess.turn() === "w") timeBlack += increment; else timeWhite += increment;
    }
    lastMove = { from: move.from, to: move.to };
    animMove = { from: move.from, to: move.to, t: performance.now() }; sfx.move(move);
    importedResult = null;
    if (fallback) {
      setStatus(`Nước đi của ${oppName()} không hợp lệ`, `Đã đi ${move.san} thay thế để ván không bị kẹt.`);
    } else {
      setStatus(`${oppName()} chọn ${move.san}`, `Depth: ${d.search?.depth || "?"} · ${d.search?.time_ms || "?"}ms`);
    }
    updateUI();
  } catch (e) {
    if (thisReq !== requestId) return;
    setStatus(lvl ? "Lỗi Stockfish" : "Lỗi API", e.message);
    setConnection("off", "LỖI KẾT NỐI ENGINE");
    updateUI();
  } finally {
    if (thisReq === requestId) { thinking = false; updateUI(); }
  }
}

function updateUI() {
  renderBoard();
  const isOver = chess.isGameOver();
  const turnText = chess.turn() === "w" ? "Trắng" : "Đen";
  if (isOver || timeOver) statusOverride = null;
  const browsing = viewPly !== null;
  if ($("statusTitle")) {
    if (browsing) {
      $("statusTitle").textContent = `Xem lại nước ${viewPly}/${historyLength()}`;
      $("statusText").textContent = "Dùng ◀ ▶ hoặc phím ← → để tua · ⏭ để về hiện tại.";
    } else if (statusOverride) {
      $("statusTitle").textContent = statusOverride.title;
      $("statusText").textContent = statusOverride.text;
    } else if (timeOver && timeOverMsg) {
      $("statusTitle").textContent = timeOverMsg.title;
      $("statusText").textContent = timeOverMsg.text;
    } else {
      $("statusTitle").textContent = isOver ? (chess.isCheckmate() ? "Chiến thắng!" : "Hòa cờ!") : "Đang diễn ra";
      $("statusText").textContent = `Lượt ${turnText}.` + (lastNyraInfo ? ` · ${lastNyraInfo}` : "");
    }
  }
  if ($("turnLabel")) $("turnLabel").textContent = `Lượt ${turnText}`;
  if ($("undoBtn")) $("undoBtn").disabled = !chess.history().length || thinking;
  if (isOver) {
    stopClock();
    isGameActive = false;
    if (!resultRecorded) {
      sfx.end(chess.isCheckmate() ? (chess.turn() === "b" ? "win" : "lose") : "draw");
      recordResult(chess.isCheckmate() ? "checkmate" : "draw");
      updatePgnBox();
      runAutoReview();
    }
  }
  renderHistory();
  updateClockUI();
  updateNav();
}

function recordResult(reason) {
  if (resultRecorded) return;
  resultRecorded = true;
  let outcome = "draw";
  if (reason === "timeout") {
    const loser = timeWhite <= 0 ? "w" : "b";
    outcome = loser === "w" ? "loss" : "win";
  } else if (chess.isCheckmate()) {
    outcome = chess.turn() === "w" ? "loss" : "win";
  }
  recordedOutcome = outcome;
  stats.total++;
  if (outcome === "win") stats.wins++;
  else if (outcome === "loss") stats.losses++;
  else stats.draws++;
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {}
  renderStats();
}

function rollbackResult() {
  if (resultRecorded && recordedOutcome) {
    stats.total = Math.max(0, stats.total - 1);
    if (recordedOutcome === "win") stats.wins = Math.max(0, stats.wins - 1);
    else if (recordedOutcome === "loss") stats.losses = Math.max(0, stats.losses - 1);
    else stats.draws = Math.max(0, stats.draws - 1);
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {}
    renderStats();
  }
  resultRecorded = false;
  recordedOutcome = null;
}

async function runAutoReview() {
  if (!hasLocalNyra()) {
    if ($("reviewResult")) {
      $("reviewResult").innerHTML = `
        <div class="rv-empty">Phân tích tự động không chạy được: trình duyệt chưa hỗ trợ Nyra WebAssembly. Nhấn “Phân tích lại” sau khi có API.</div>`;
    }
    return;
  }
  const btn = $("reviewBtn");
  const box = $("reviewResult");
  if (btn) btn.disabled = true;
  if (box) box.innerHTML = `<p class="rv-progress">Phân tích tự động… 0/0</p><div class="rv-bar"><div style="width:0%"></div></div>`;
  try {
    currentReview = await reviewGame(
      chess.history({ verbose: true }).map(m => ({
        from: m.from,
        to: m.to,
        promotion: m.promotion,
      })),
      {
        Chess,
        timeMs: 350,
        onProgress: (i, t) => {
          if (box) box.innerHTML =
            `<p class="rv-progress">Phân tích tự động… ${i}/${t}</p><div class="rv-bar"><div style="width:${(i / t * 100).toFixed(0)}%"></div></div>`;
        },
      }
    );
    renderReview($("reviewResult"), currentReview);
  } catch (e) {
    if (box) box.innerHTML = `<div class="rv-empty">Không phân tích được tự động: ${escapeHtml(e.message)}</div>`;
    currentReview = null;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderReview(containerEl, r) {
  if (!containerEl) return;
  containerEl.classList.remove("collapsed");
  const badge = (cls) =>
    `<span class="rv-badge" style="background:${CLASS_INFO[cls].color}">${CLASS_INFO[cls].icon}</span>`;
  const pts = r.evals
    .map((v, i) => `${(i / Math.max(1, r.evals.length - 1) * 100).toFixed(1)},${(100 - v).toFixed(1)}`)
    .join(" ");
  const rows = CLASS_ORDER
    .filter(c => (r.summary.w.counts[c] || 0) + (r.summary.b.counts[c] || 0) > 0)
    .map(c =>
      `<div class="rv-row"><span>${badge(c)} ${CLASS_INFO[c].label}</span><span>${r.summary.w.counts[c] || 0}</span><span>${r.summary.b.counts[c] || 0}</span></div>`
    )
    .join("");
  const list = r.moves
    .map(m => {
      const num = m.side === "w" ? `${Math.floor(m.ply / 2) + 1}.` : `${Math.floor(m.ply / 2) + 1}...`;
      const tip =
        ["inaccuracy", "mistake", "blunder"].includes(m.cls) && m.bestSan
          ? ` <small>Tốt hơn: ${escapeHtml(m.bestSan)} (−${m.loss.toFixed(0)}% cơ hội thắng)</small>`
          : "";
      return `<div class="rv-move">${badge(m.cls)} <b>${num} ${escapeHtml(m.san)}</b> <small>${CLASS_INFO[m.cls].label}</small>${tip}</div>`;
    })
    .join("");
  containerEl.innerHTML = `
    <div class="rv-acc">
      <div><small>Trắng</small><b>${r.summary.w.acc.toFixed(1)}%</b></div>
      <div><small>Độ chính xác</small></div>
      <div><small>Đen</small><b>${r.summary.b.acc.toFixed(1)}%</b></div>
    </div>
    <svg class="rv-graph" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect width="100" height="100" fill="#2a2a26"/>
      <rect width="100" height="50" fill="#e6dfcc" y="50"/>
      <polyline points="${pts}" fill="none" stroke="#d7b66c" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
      <line x1="0" y1="50" x2="100" y2="50" stroke="#8884" stroke-width=".6"/>
    </svg>
    <div class="rv-row rv-head"><span></span><span>Trắng</span><span>Đen</span></div>
    ${rows}
    <div class="rv-list">${list}</div>`;
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "`": "&#96;",
  }[c]));
}

const ARROW_COLOR = { inaccuracy: "#e6c34a", mistake: "#e8964f", blunder: "#e0624f" };
const BAD_CLASSES = ["inaccuracy", "mistake", "blunder"];

function squarePoint(sq, boardFlipped) {
  const fileIdx = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]) || 1;
  const col = boardFlipped ? 7 - fileIdx : fileIdx;
  const row = boardFlipped ? rank - 1 : 8 - rank;
  return { x: (col + 0.5) * 12.5, y: (row + 0.5) * 12.5 };
}

function arrowNode(fromSq, toSq, color, opacity, width) {
  const a = squarePoint(fromSq, flipped), b = squarePoint(toSq, flipped);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const pad = 4.5, headLen = 3.4, headHalf = 3.6;
  const tipX = b.x - ux * pad, tipY = b.y - uy * pad;
  const baseX = tipX - ux * headLen, baseY = tipY - uy * headLen;
  const px = -uy, py = ux;
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("opacity", String(opacity));
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", (a.x + ux * pad).toFixed(2));
  line.setAttribute("y1", (a.y + uy * pad).toFixed(2));
  line.setAttribute("x2", baseX.toFixed(2));
  line.setAttribute("y2", baseY.toFixed(2));
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", String(width));
  line.setAttribute("stroke-linecap", "round");
  const head = document.createElementNS(SVG_NS, "polygon");
  head.setAttribute("points",
    `${tipX.toFixed(2)},${tipY.toFixed(2)} ` +
    `${(baseX + px * headHalf).toFixed(2)},${(baseY + py * headHalf).toFixed(2)} ` +
    `${(baseX - px * headHalf).toFixed(2)},${(baseY - py * headHalf).toFixed(2)}`);
  head.setAttribute("fill", color);
  g.appendChild(line);
  g.appendChild(head);
  return g;
}

function closeMarkingBoard() {
  markingBoardOpen = false;
  const panel = $("moveBoardPanel");
  if (panel) panel.classList.remove("open");
}

function buildMarkingBoard() {
  const panel = $("moveBoardPanel");
  if (!panel) return;
  panel.innerHTML = "";
  panel.classList.remove("open");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "mb-close";
  close.textContent = "✕";
  close.addEventListener("click", closeMarkingBoard);
  panel.appendChild(close);

  const header = document.createElement("h3");
  header.textContent = "Xem lại ván vừa chơi";
  panel.appendChild(header);
  const sub = document.createElement("div");
  sub.className = "mb-sub";
  sub.textContent = "Mỗi nước có nhãn Nyra đánh giá. Mũi tên đỏ: nước đã đi · mũi tên xanh mờ: nước Nyra gợi ý.";
  panel.appendChild(sub);

  const nav = document.createElement("div");
  nav.className = "mb-nav";
  const mkBtn = (label, title, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "nav-btn";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", fn);
    nav.appendChild(b);
    return b;
  };
  const first = mkBtn("⏮", "Về đầu ván", () => renderMarking(panel, 0));
  const prev = mkBtn("◀", "Nước trước (←)", () => renderMarking(panel, Math.max(0, (panel._ply ?? 0) - 1)));
  const counter = document.createElement("span");
  counter.className = "nav-counter";
  nav.appendChild(counter);
  const next = mkBtn("▶", "Nước sau (→)", () => renderMarking(panel, Math.min(chess.history().length - 1, (panel._ply ?? -1) + 1)));
  const last = mkBtn("⏭", "Nước cuối (End)", () => renderMarking(panel, chess.history().length - 1));
  panel.appendChild(nav);

  const wrap = document.createElement("div");
  wrap.className = "move-board-wrap";
  const boardRel = document.createElement("div");
  boardRel.className = "move-board-rel";
  const boardEl = document.createElement("div");
  boardEl.className = "move-board";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "review-arrows");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  boardRel.appendChild(boardEl);
  boardRel.appendChild(svg);
  wrap.appendChild(boardRel);

  const rowLabels = document.createElement("div");
  rowLabels.className = "move-label";
  const fileLabels = document.createElement("div");
  fileLabels.className = "move-file";
  wrap.appendChild(rowLabels);
  wrap.appendChild(fileLabels);

  const info = document.createElement("div");
  info.className = "mb-info";
  panel.appendChild(wrap);
  panel.appendChild(info);

  const legend = document.createElement("div");
  legend.className = "mb-legend";
  for (const cls of CLASS_ORDER) {
    const item = document.createElement("span");
    item.className = "mb-legend-item";
    item.innerHTML = `<i style="background:${CLASS_INFO[cls].color}">${CLASS_INFO[cls].icon}</i>${CLASS_INFO[cls].label}`;
    legend.appendChild(item);
  }
  panel.appendChild(legend);

  const hWrap = document.createElement("div");
  hWrap.className = "move-history-scroll";
  const grid = document.createElement("div");
  grid.className = "move-grid";
  for (const [text, cls] of [["#", "move-num"], ["Trắng", "move-white"], ["Đen", "move-black"]]) {
    const cell = document.createElement("div");
    cell.className = "move-grid-head " + cls;
    cell.textContent = text;
    grid.appendChild(cell);
  }

  const hist = chess.history({ verbose: true });
  const byPly = new Map((currentReview && currentReview.moves ? currentReview.moves : []).map(m => [m.ply, m]));
  for (let i = 0; i < hist.length; i += 2) {
    const num = document.createElement("div");
    num.className = "move-num";
    num.textContent = (i / 2 + 1) + ".";
    grid.appendChild(num);
    for (let k = 0; k < 2; k++) {
      const idx = i + k;
      if (!hist[idx]) {
        const empty = document.createElement("div");
        empty.className = "move-cell";
        grid.appendChild(empty);
        continue;
      }
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "move-cell";
      cell.dataset.ply = String(idx);
      const rv = byPly.get(idx);
      if (rv) {
        const dot = document.createElement("i");
        dot.className = "move-dot";
        dot.style.background = CLASS_INFO[rv.cls].color;
        cell.appendChild(dot);
      }
      cell.appendChild(document.createTextNode(hist[idx].san));
      if (rv) cell.classList.add(BAD_CLASSES.includes(rv.cls) ? "move-bad" : "move-good");
      cell.addEventListener("click", () => renderMarking(panel, idx));
      grid.appendChild(cell);
    }
  }
  hWrap.appendChild(grid);
  panel.appendChild(hWrap);

  panel._boardEl = boardEl;
  panel._svg = svg;
  panel._rowLabels = rowLabels;
  panel._fileLabels = fileLabels;
  panel._grid = grid;
  panel._info = info;
  panel._nav = { first, prev, next, last, counter };
  renderMarking(panel, 0);
}

// Vẽ thế cờ sau nước `ply` (-1 = thế cờ ban đầu) kèm nhãn đánh giá và mũi tên gợi ý
function renderMarking(panel, ply) {
  if (!panel || !panel._boardEl) return;
  const hist = chess.history({ verbose: true });
  const n = hist.length;
  if (n === 0) return;
  ply = Math.max(0, Math.min(n - 1, Number.isFinite(ply) ? ply : 0));
  panel._ply = ply;

  const pos = positionAt(ply + 1);
  const mv = hist[ply];
  const files = flipped ? "hgfedcba" : "abcdefgh";
  const ranks = flipped ? "12345678" : "87654321";

  panel._boardEl.innerHTML = "";
  if (panel._rowLabels) panel._rowLabels.innerHTML = [...ranks].map(r => `<span>${r}</span>`).join("");
  if (panel._fileLabels) panel._fileLabels.innerHTML = [...files].map(f => `<span>${f}</span>`).join("");

  for (const r of ranks) {
    for (const f of files) {
      const sq = f + r;
      const isLight = ((f.charCodeAt(0) - 97) + Number(r)) % 2 === 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `move-square ${isLight ? "light" : "dark"}`;
      btn.dataset.sq = sq;
      if (mv && (mv.from === sq || mv.to === sq)) btn.classList.add("last-move");
      const piece = pos.get(sq);
      if (piece) {
        const span = document.createElement("span");
        span.className = `move-piece ${piece.color === "w" ? "white" : "black"}`;
        span.textContent = PIECES[piece.color][piece.type];
        btn.appendChild(span);
      }
      panel._boardEl.appendChild(btn);
    }
  }

  if (panel._grid) {
    for (const cell of panel._grid.querySelectorAll(".move-cell[data-ply]")) {
      cell.classList.toggle("move-this", Number(cell.dataset.ply) === ply);
    }
  }
  if (panel._nav) {
    panel._nav.counter.textContent = `${ply + 1}/${n}`;
    panel._nav.first.disabled = panel._nav.prev.disabled = ply <= 0;
    panel._nav.next.disabled = panel._nav.last.disabled = ply >= n - 1;
  }

  const svg = panel._svg;
  if (svg) svg.innerHTML = "";
  const rv = currentReview ? currentReview.moves.find(m => m.ply === ply) : null;
  if (panel._info) {
    if (!rv) {
      panel._info.textContent = "Ván này chưa có phân tích của Nyra — bấm “Phân tích ván bằng Nyra”.";
    } else {
      const info = CLASS_INFO[rv.cls];
      panel._info.innerHTML =
        `<b>${ply + 1}. ${escapeHtml(rv.san)}</b> · <span style="color:${info.color}">${info.icon} ${info.label}</span>` +
        (rv.bestSan && rv.bestUci !== rv.uci ? ` · Nyra gợi ý <b>${escapeHtml(rv.bestSan)}</b>` : "") +
        (rv.loss > 0 ? ` · mất ${rv.loss.toFixed(0)}% cơ hội thắng` : "");
    }
  }
  if (!rv) return;

  const uci = String(rv.uci || "");
  const destSq = uci.slice(2, 4);
  const destEl = panel._boardEl.querySelector(`.move-square[data-sq="${destSq}"]`);
  const info = CLASS_INFO[rv.cls];
  if (destEl && info) {
    const badge = document.createElement("span");
    badge.className = "move-badge";
    badge.style.background = info.color;
    badge.textContent = info.icon;
    badge.title = info.label;
    destEl.appendChild(badge);
  }
  if (svg && uci.length >= 4) {
    svg.appendChild(arrowNode(uci.slice(0, 2), destSq, ARROW_COLOR[rv.cls] || "#d7b66c", 0.9, 1.4));
  }
  const bestUci = String(rv.bestUci || "");
  if (svg && bestUci.length >= 4 && bestUci !== uci) {
    svg.appendChild(arrowNode(bestUci.slice(0, 2), bestUci.slice(2, 4), "#4fd6a0", 0.5, 1.1));
  }
}

function openMarkingBoard() {
  if (!chess.history().length) {
    alert("Chưa có nước đi nào để xem lại.");
    return;
  }
  markingBoardOpen = true;
  const panel = $("moveBoardPanel");
  if (!panel) return;
  buildMarkingBoard();
  panel.classList.add("open");
}

function loadStats() {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY) || "{}");
    stats = {
      total: Number(s.total) || 0,
      wins: Number(s.wins) || 0,
      losses: Number(s.losses) || 0,
      draws: Number(s.draws) || 0,
    };
  } catch (e) {
    stats = { total: 0, wins: 0, losses: 0, draws: 0 };
  }
  renderStats();
}


safeAddEvent("newGameBtn", "click", () => {
  requestId++;
  thinking = false;
  chess.reset();
  selectedSquare = null;
  legalTargets = [];
  lastMove = null;
  displayChess = chess;
  statusOverride = null;
  timeOver = false;
  timeOverMsg = null;
  resultRecorded = false;
  recordedOutcome = null;
  clockStack = [];
  lastNyraInfo = "";
  currentReview = null;
  viewPly = null;
  importedResult = null;
  stopClock();
  isGameActive = false;
  isPaused = false;
  $("pauseBtn").innerHTML = `<span>⏸</span> Tạm dừng`;
  if ($("reviewResult")) $("reviewResult").innerHTML = "";
  setupClock();
  updateUI();
  updatePgnBox();
});

safeAddEvent("undoBtn", "click", () => {
  if (thinking || !chess.history().length) return;
  const wasFinished = timeOver || resultRecorded || chess.isGameOver();
  let undone = 0;
  chess.undo();
  undone++;
  if (chess.turn() === "b" && chess.history().length) {
    chess.undo();
    undone++;
  }
  for (let i = 0; i < undone; i++) {
    const s = clockStack.pop();
    if (s) {
      timeWhite = s.w;
      timeBlack = s.b;
    }
  }
  if (wasFinished) {
    rollbackResult();
    timeOver = false;
    timeOverMsg = null;
    currentReview = null;
    if ($("reviewResult")) $("reviewResult").innerHTML = "";
  }
  selectedSquare = null;
  legalTargets = [];
  viewPly = null;
  importedResult = null;
  const hist = chess.history({ verbose: true });
  lastMove = hist.length ? { from: hist[hist.length - 1].from, to: hist[hist.length - 1].to } : null;
  lastNyraInfo = "";
  statusOverride = null;
  if (wasFinished) runClock();
  updateUI();
  updatePgnBox();
});

safeAddEvent("flipBtn", "click", () => {
  flipped = !flipped;
  renderBoard();
});

safeAddEvent("navStart", "click", () => navTo(0));
safeAddEvent("navPrev", "click", () => navTo((viewPly === null ? historyLength() : viewPly) - 1));
safeAddEvent("navNext", "click", () => navTo((viewPly === null ? historyLength() : viewPly) + 1));
safeAddEvent("navEnd", "click", () => navTo(historyLength()));

safeAddEvent("pauseBtn", "click", () => {
  isPaused = !isPaused;
  $("pauseBtn").innerHTML = isPaused ? "▶ Tiếp tục" : `<span>⏸</span> Tạm dừng`;
  updateUI();
});

safeAddEvent("saveEndpointBtn", "click", () => {
  localStorage.setItem("nyraChessEndpoint", $("endpointInput").value.trim());
  alert("Đã lưu API");
});

safeAddEvent("timeControlSelect", "change", () => {
  const val = $("timeControlSelect").value;
  const inGame = chess.history().length > 0 && !chess.isGameOver() && !timeOver;
  if (inGame) {
    increment = val.includes("+") ? parseInt(val.split("+")[1], 10) : 0;
    if (val === "unlimited") {
      stopClock();
      updateClockUI();
      return;
    }
    if (timeWhite > 3600 || timeBlack > 3600) {
      setupClock();
      runClock();
      return;
    }
    runClock();
    updateClockUI();
    return;
  }
  setupClock();
});

if ($("endpointInput")) $("endpointInput").value = localStorage.getItem("nyraChessEndpoint") || API_DEFAULT;
loadStats();
setConnection("on", hasLocalNyra() ? "NYRA WASM SẴN SÀNG" : "CHỜ CẤU HÌNH API");
setupClock();
document.body.classList.add("play-tab");
updateUI();
updatePgnBox();

safeAddEvent("scrollPgnBtn", "click", () => {
  const ta = $("pgnText");
  if (ta && ta.value) {
    ta.focus();
    ta.select();
  }
});
safeAddEvent("copyPgnBtn", "click", async () => {
  const ta = $("pgnText");
  if (!ta || !ta.value) return alert("Chưa có ván cờ nào để copy PGN.");
  try {
    await navigator.clipboard.writeText(ta.value);
    alert("Đã copy PGN vào clipboard");
  } catch (e) {
    ta.select();
    document.execCommand("copy");
    alert("Đã copy PGN (dùng select+copy)");
  }
});

function downloadPgn() {
  const pgn = buildPgn();
  if (!pgn) return alert("Chưa có ván cờ nào để xuất PGN.");
  const blob = new Blob([pgn], { type: "application/x-chess-pgn;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `nyra-${stamp}.pgn`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

safeAddEvent("downloadPgnBtn", "click", downloadPgn);
safeAddEvent("downloadPgnBtnHistory", "click", downloadPgn);

function openPgnImport() {
  const panel = $("pgnImportPanel");
  if (!panel) return;
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  if ($("pgnImportMsg")) $("pgnImportMsg").textContent = "";
}

function closePgnImport() {
  const panel = $("pgnImportPanel");
  if (!panel) return;
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  if ($("pgnImportMsg")) $("pgnImportMsg").textContent = "";
}

// Đưa PGN từ file/text lên bàn cờ để tua lại, phân tích hoặc chơi tiếp
function applyPgn(text) {
  const src = String(text || "").trim();
  if (!src) throw new Error("Chưa có nội dung PGN.");
  const probe = new Chess();
  probe.loadPgn(src);
  const moves = probe.history({ verbose: true });
  if (!moves.length) throw new Error("PGN không có nước đi nào.");

  chess.loadPgn(src);
  requestId++;
  thinking = false;
  selectedSquare = null;
  legalTargets = [];
  viewPly = null;
  statusOverride = null;
  timeOver = false;
  timeOverMsg = null;
  currentReview = null;
  clockStack = [];
  isPaused = false;
  lastNyraInfo = "Ván nhập từ PGN";
  const hist = chess.history({ verbose: true });
  lastMove = hist.length ? { from: hist[hist.length - 1].from, to: hist[hist.length - 1].to } : null;
  if ($("reviewResult")) $("reviewResult").innerHTML = "";
  if ($("reviewResultHistory")) $("reviewResultHistory").innerHTML = "";
  if ($("pauseBtn")) $("pauseBtn").innerHTML = `<span>⏸</span> Tạm dừng`;
  const headerResult = chess.header().Result;
  importedResult = headerResult && headerResult !== "*" ? headerResult : null;
  resultRecorded = chess.isGameOver() || !!importedResult;
  recordedOutcome = null;
  stopClock();
  isGameActive = false;
  setupClock();
  updateUI();
  updatePgnBox();
  if (chess.isGameOver() || importedResult) runAutoReview();
  return hist.length;
}

safeAddEvent("pgnImportLoad", "click", () => {
  const msg = $("pgnImportMsg");
  try {
    const n = applyPgn($("pgnImportText").value);
    closeDrawer();
    closePgnImport();
    switchTab("play");
    setStatus("Đã nhập PGN", `${n} nước · dùng ◀ ▶ để tua lại.`);
    updateUI();
  } catch (e) {
    if (msg) msg.textContent = "Lỗi PGN: " + e.message;
  }
});

safeAddEvent("pgnImportFile", "change", async () => {
  const input = $("pgnImportFile");
  const file = input && input.files && input.files[0];
  if (!file) return;
  try {
    $("pgnImportText").value = await file.text();
    if ($("pgnImportMsg")) $("pgnImportMsg").textContent = `Đã đọc ${file.name} — bấm “Tải vào bàn cờ”.`;
  } catch (e) {
    if ($("pgnImportMsg")) $("pgnImportMsg").textContent = "Không đọc được file: " + e.message;
  }
});

safeAddEvent("pgnImportClose", "click", closePgnImport);
safeAddEvent("pgnImportCancel", "click", closePgnImport);

const importPanel = $("pgnImportPanel");
if (importPanel) {
  importPanel.addEventListener("click", (e) => {
    if (e.target === importPanel) closePgnImport();
  });
}

function runReviewInBox(boxId, btnId) {
  const box = $(boxId);
  const btn = $(btnId);
  if (!box) return;
  const hist = chess.history({ verbose: true });
  if (!hist.length) {
    box.innerHTML = `<div class="rv-empty">Chưa có nước đi nào để phân tích.</div>`;
    return;
  }
  if (!hasLocalNyra()) {
    box.innerHTML = `<div class="rv-empty">Trình duyệt này chưa chạy được Nyra WebAssembly nên không phân tích được.</div>`;
    return;
  }
  if (btn) btn.disabled = true;
  box.innerHTML = `<p class="rv-progress">Nyra đang phân tích… 0/0</p><div class="rv-bar"><div style="width:0%"></div></div>`;
  (async () => {
    try {
      const r = await reviewGame(
        hist.map(m => ({
          from: m.from,
          to: m.to,
          promotion: m.promotion,
        })),
        {
          Chess,
          timeMs: 350,
          onProgress: (i, t) => {
            box.innerHTML =
              `<p class="rv-progress">Nyra đang phân tích… ${i}/${t}</p><div class="rv-bar"><div style="width:${(i / t * 100).toFixed(0)}%"></div></div>`;
          },
        }
      );
      currentReview = r;
      renderReview(box, r);
    } catch (e) {
      box.innerHTML = `<div class="rv-empty">Không phân tích được: ${escapeHtml(e.message)}</div>`;
      currentReview = null;
    } finally {
      if (btn) btn.disabled = false;
    }
  })();
}

safeAddEvent("reviewBtn", "click", () => runReviewInBox("reviewResult", "reviewBtn"));
safeAddEvent("reviewBtnHistory", "click", () => runReviewInBox("reviewResultHistory", "reviewBtnHistory"));
safeAddEvent("boardReviewBtn", "click", openMarkingBoard);
safeAddEvent("boardReviewBtnHistory", "click", openMarkingBoard);

document.addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "Escape") {
    if (markingBoardOpen) closeMarkingBoard();
    else if ($("pgnImportPanel") && $("pgnImportPanel").classList.contains("open")) closePgnImport();
    return;
  }
  if (markingBoardOpen) {
    const panel = $("moveBoardPanel");
    const n = historyLength();
    if (!panel || !n) return;
    const cur = panel._ply ?? 0;
    if (e.key === "ArrowLeft") { e.preventDefault(); renderMarking(panel, cur - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); renderMarking(panel, cur + 1); }
    else if (e.key === "Home") { e.preventDefault(); renderMarking(panel, 0); }
    else if (e.key === "End") { e.preventDefault(); renderMarking(panel, n - 1); }
    return;
  }
  if (!historyLength()) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); navTo((viewPly === null ? historyLength() : viewPly) - 1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); navTo((viewPly === null ? historyLength() : viewPly) + 1); }
  else if (e.key === "Home") { e.preventDefault(); navTo(0); }
  else if (e.key === "End") { e.preventDefault(); navTo(historyLength()); }
});

if ($("opponentSelect")) {
  $("opponentSelect").value = opponent;
  if ($("engineMode") && SF_LEVELS[opponent]) $("engineMode").textContent = `UCI_Elo ${SF_LEVELS[opponent].elo}${SF_LEVELS[opponent].blunder ? " + sai ngẫu nhiên" : ""}`;
  $("opponentSelect").addEventListener("change", () => {
    opponent = $("opponentSelect").value;
    try { localStorage.setItem(OPP_KEY, opponent); } catch (e) {}
    requestId++; thinking = false;
    if (sfPlay) sfPlay.stop();
    if ($("engineMode")) $("engineMode").textContent = SF_LEVELS[opponent] ? `UCI_Elo ${SF_LEVELS[opponent].elo}${SF_LEVELS[opponent].blunder ? " + sai ngẫu nhiên" : ""}` : "NYRA WASM";
    updateUI();
    if (!chess.isGameOver() && chess.turn() === "b" && isGameActive) requestNyraMove();
  });
}
initArena({ Chess, getNyraMove, getApiUrl: () => $("endpointInput").value.trim() });
const puzzleApi = initPuzzle({ Chess, getNyraMove, getApiUrl: () => $("endpointInput").value.trim(), PIECES });
initSettings({ onResetPuzzle: () => puzzleApi && puzzleApi.resetProgress() });
initI18n();
// chạy offline: đăng ký service worker (bỏ qua nếu trình duyệt không hỗ trợ)
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const reg = () => navigator.serviceWorker.register("sw.js").catch(() => {});
  if (document.readyState === "complete") reg(); else window.addEventListener("load", reg);
}
