import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm";
import { getNyraMove, hasLocalNyra } from "./nyra-client.js?v=4";
import { reviewGame, CLASS_INFO, CLASS_ORDER } from "./nyra-review.js?v=2";
const $ = (id) => document.getElementById(id);

const API_DEFAULT = "https://nyra-chess-api.onrender.com/move";
const PIECES = { w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" }, b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" } };

const chess = new Chess();
let lastNyraInfo = "";  // thông tin lượt Nyra vừa đi (depth, thời gian, nguồn engine)
let selectedSquare = null;
let legalTargets = [];
let flipped = false;
let thinking = false;
let lastMove = null;
let requestId = 0;
let isArenaRunning = false;

// Đồng hồ
let timeWhite = 600, timeBlack = 600, increment = 0;
let clockInterval = null, isGameActive = false, isPaused = false;

// Hàm thêm sự kiện an toàn (Chống lỗi trắng web)
function safeAddEvent(id, event, callback) {
  const el = $(id);
  if (el) el.addEventListener(event, callback);
}

// --- TABS LOGIC ---
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    const tab = $(`tab-${btn.dataset.tab}`);
    if (tab) tab.classList.add("active");
  });
});

// --- RENDER BÀN CỜ ---
function renderBoard() {
  const boardEl = $("board");
  if (!boardEl) return;
  boardEl.innerHTML = "";
  const targets = new Set(legalTargets.map((m) => m.to));
  const files = flipped ? "hgfedcba" : "abcdefgh";
  const ranks = flipped ? "12345678" : "87654321";

  for (const rank of ranks) {
    for (const file of files) {
      const square = file + rank;
      const isLight = ((file.charCodeAt(0) - 97) + Number(rank)) % 2 === 0;
      const btn = document.createElement("button");
      btn.className = `square ${isLight ? "light" : "dark"}`;
      
      const piece = chess.get(square);
      if (selectedSquare === square) btn.classList.add("selected");
      if (targets.has(square)) btn.classList.add(piece ? "capture" : "legal");
      if (lastMove && (lastMove.from === square || lastMove.to === square)) btn.classList.add("last-move");

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
  const rankLabels = document.querySelector(".rank-labels");
  const fileLabels = document.querySelector(".file-labels");
  if (rankLabels) rankLabels.innerHTML = [...ranks].map(v => `<span>${v}</span>`).join("");
  if (fileLabels) fileLabels.innerHTML = [...files].map(v => `<span>${v}</span>`).join("");
}

// --- TƯƠNG TÁC ---
function onSquareClick(square) {
  if (thinking || isArenaRunning || chess.isGameOver()) return;
  const piece = chess.get(square);
  
  if (selectedSquare && legalTargets.some(m => m.to === square)) {
    const fromSq = selectedSquare;
    let promo = "q";
    if (legalTargets.some(m => m.to === square && m.promotion)) {
      promo = prompt("Phong cấp (q/r/b/n):", "q") || "q";
    }
    selectedSquare = null; legalTargets = [];
    try {
      const move = chess.move({ from: fromSq, to: square, promotion: promo });
      if (move) {
        lastMove = { from: move.from, to: move.to };
        if (isGameActive && !isPaused && $("timeControlSelect").value !== "unlimited") { 
          if (chess.turn() === 'w') timeBlack += increment; else timeWhite += increment; 
        }
        if (!isGameActive && !chess.isGameOver() && $("timeControlSelect").value !== "unlimited") startClock();
        updateUI();
        if (!chess.isGameOver() && chess.turn() === "b") requestNyraMove();
      }
    } catch (_) {}
    return;
  }
  
  if (piece && piece.color === chess.turn()) { 
    selectedSquare = square; 
    legalTargets = chess.moves({ square, verbose: true }); 
  } else { 
    selectedSquare = null; legalTargets = []; 
  }
  renderBoard();
}

// --- GỌI API NYRA ---
async function requestNyraMove() {
  if (thinking || chess.isGameOver() || chess.turn() !== "b" || isArenaRunning) return;
  const ep = $("endpointInput").value.trim().replace(/\/+$/, "");
  if (!ep && !hasLocalNyra()) return;
  
  const thisReq = ++requestId; const fenB = chess.fen(); thinking = true;
  $("statusTitle").textContent = "Nyra đang tính...";
  
  try {
    const lm = chess.moves({ verbose: true }).map(m => ({ uci: `${m.from}${m.to}${m.promotion||""}`, san: m.san }));
    const d = await getNyraMove(fenB, lm, ep);
    lastNyraInfo = `Nyra (${d.source === "wasm" ? "wasm" : "API"}): ` +
      (d.search?.method === "Opening Book" ? "sách khai cuộc" : `Depth ${d.search?.depth ?? "?"} · ${d.search?.time_ms ?? "?"}ms`);
    if ($("engineMode")) $("engineMode").textContent = d.source === "wasm" ? "NYRA WASM" : "NYRA API";
    
    if (thisReq !== requestId || chess.fen() !== fenB) return;
    const u = String(d.uci || "").toLowerCase();
    const move = chess.move({ from: u.slice(0,2), to: u.slice(2,4), ...(u.length>4?{promotion:u[4]}:{}) });
    
    lastMove = { from: move.from, to: move.to };
    $("statusTitle").textContent = `Nyra chọn ${move.san}`;
    $("statusText").textContent = `Depth: ${d.search?.depth || '?'} · ${d.search?.time_ms || '?'}ms`;
    updateUI();
  } catch (e) {
    $("statusTitle").textContent = "Lỗi API";
    $("statusText").textContent = e.message;
  } finally {
    if (thisReq === requestId) { thinking = false; updateUI(); }
  }
}

// --- UI ---
function updateUI() {
  renderBoard();
  const isOver = chess.isGameOver();
  const turnText = chess.turn() === "w" ? "Trắng" : "Đen";
  
  if ($("statusTitle") && !isArenaRunning) {
      $("statusTitle").textContent = isOver ? (chess.isCheckmate() ? "Chiến thắng!" : "Hòa cờ!") : `Đang diễn ra`;
  }
  if ($("statusText") && !isArenaRunning) $("statusText").textContent = `Lượt ${turnText}.` + (lastNyraInfo ? ` · ${lastNyraInfo}` : "");
  if ($("turnLabel")) $("turnLabel").textContent = `Lượt ${turnText}`;
  if ($("undoBtn")) $("undoBtn").disabled = !chess.history().length || thinking || isArenaRunning;
  
  renderHistory();
  updateClockUI();
}

function renderHistory() {
  const c = $("moveHistory"); if (!c) return;
  c.innerHTML = "";
  const h = chess.history();
  if (!h.length) { c.innerHTML = '<p class="empty-history">Trống.</p>'; return; }
  for (let i = 0; i < h.length; i += 2) {
    const row = document.createElement("div"); row.className = "move-row";
    row.innerHTML = `<span class="move-number">${Math.floor(i/2)+1}.</span><span class="move-white">${h[i]}</span><span class="move-black">${h[i+1] || ""}</span>`;
    c.appendChild(row);
  }
  c.scrollTop = c.scrollHeight;
}

// --- CLOCK ---
function formatTime(s) { if (s < 0) s = 0; return `${Math.floor(s/60)}:${(Math.floor(s%60)).toString().padStart(2,'0')}`; }
function updateClockUI() {
  if (!$("timeControlSelect") || $("timeControlSelect").value === "unlimited") return;
  if ($("timeWhite")) $("timeWhite").textContent = formatTime(timeWhite);
  if ($("timeBlack")) $("timeBlack").textContent = formatTime(timeBlack);
}
function startClock() {
  if (clockInterval) clearInterval(clockInterval); isGameActive = true; isPaused = false;
  if ($("timeControlSelect").value === "unlimited") return;
  clockInterval = setInterval(() => {
    if (!isGameActive || isPaused || chess.isGameOver()) return;
    if (chess.turn() === 'w') timeWhite--; else timeBlack--;
    updateClockUI();
  }, 1000);
}
function setupClock() {
  if (!$("timeControlSelect")) return;
  const val = $("timeControlSelect").value;
  if (val === "unlimited") { timeWhite = 99999; timeBlack = 99999; increment = 0; }
  else if (val.includes("+")) { const p = val.split("+"); timeWhite = parseInt(p[0]); timeBlack = timeWhite; increment = parseInt(p[1]); }
  else { timeWhite = parseInt(val); timeBlack = timeWhite; increment = 0; }
  updateClockUI();
}

// --- ARENA LOGIC (ĐẤU VỚI STOCKFISH) ---
async function getStockfishMove(fen) {
  try {
    const res = await fetch('https://chess-api.com/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen: fen, depth: 10 })
    });
    const data = await res.json();
    if (data && data.move) return data.move;
  } catch (e) {
    console.error("Stockfish API Lỗi:", e);
  }
  // Dự phòng nếu API sập
  const tempChess = new Chess(fen);
  const moves = tempChess.moves({ verbose: true });
  return moves.length > 0 ? moves[Math.floor(Math.random() * moves.length)].san : null;
}

safeAddEvent("btnStartArena", "click", async () => {
  if (isArenaRunning) return;
  const apiUrl = $("endpointInput").value.trim();
  if (!apiUrl && !hasLocalNyra()) return alert("Chưa có API Nyra!");

  isArenaRunning = true;
  $("btnStartArena").disabled = true;
  $("btnStopArena").disabled = false;
  $("arenaResults").style.display = "block";
  $("arenaLog").innerHTML = "";
  
  const totalGames = parseInt($("arenaGames").value);
  let wWins = 0, bWins = 0, draws = 0;
  
  for (let g = 1; g <= totalGames; g++) {
    if (!isArenaRunning) break;
    $("arenaProgress").textContent = `Đang chạy ván ${g} / ${totalGames}...`;
    $("arenaLog").innerHTML += `<br><b>--- Ván ${g} ---</b><br>`;
    
    const tempChess = new Chess();
    let ply = 0;
    
    while (!tempChess.isGameOver() && ply < 150 && isArenaRunning) {
      const turn = tempChess.turn();
      const engine = turn === 'w' ? $("arenaWhite").value : $("arenaBlack").value;
      
      // Cập nhật bàn cờ hiển thị
      chess.load(tempChess.fen());
      lastMove = null;
      renderBoard();
      
      let moveUci = null;
      
      if (engine === 'random') {
        const moves = tempChess.moves({ verbose: true });
        moveUci = moves[Math.floor(Math.random() * moves.length)].san;
        await new Promise(r => setTimeout(r, 100));
      } 
      else if (engine === 'stockfish') {
        $("arenaLog").innerHTML += `Stockfish đang tính...<br>`;
        moveUci = await getStockfishMove(tempChess.fen());
        $("arenaLog").innerHTML = $("arenaLog").innerHTML.replace(`Stockfish đang tính...<br>`, "");
        await new Promise(r => setTimeout(r, 500));
      } 
      else {
        // Gọi Nyra API
        const lm = tempChess.moves({ verbose: true }).map(m => ({ uci: `${m.from}${m.to}${m.promotion||""}`, san: m.san }));
        try {
          const d = await getNyraMove(tempChess.fen(), lm, apiUrl);
          moveUci = d.uci;
        } catch (e) {
          $("arenaLog").innerHTML += `<span style="color:red">Nyra Lỗi!</span><br>`;
          isArenaRunning = false; break;
        }
      }
      
      if (moveUci) {
        try {
          const m = tempChess.move(moveUci);
          if (m) {
             lastMove = { from: m.from, to: m.to };
             $("arenaLog").innerHTML += `${turn === 'w'?'Trắng':'Đen'}: ${m.san}<br>`;
             $("arenaLog").scrollTop = $("arenaLog").scrollHeight;
             ply++;
          }
        } catch(e) { break; }
      }
    }
    
    if (!isArenaRunning) break;

    // Xử lý kết quả
    if (tempChess.isCheckmate()) {
      if (tempChess.turn() === 'w') { bWins++; $("arenaLog").innerHTML += `<b>Chiếu hết! Đen thắng.</b><br>`; }
      else { wWins++; $("arenaLog").innerHTML += `<b>Chiếu hết! Trắng thắng.</b><br>`; }
    } else {
      draws++; $("arenaLog").innerHTML += `<b>Hòa cờ.</b><br>`;
    }
    
    $("scoreWhite").textContent = wWins;
    $("scoreBlack").textContent = bWins;
    $("scoreDraw").textContent = draws;
  }
  
  isArenaRunning = false;
  $("btnStartArena").disabled = false;
  $("btnStopArena").disabled = true;
  $("arenaProgress").textContent = "Đã hoàn thành!";
});

safeAddEvent("btnStopArena", "click", () => { isArenaRunning = false; });

// --- KHỞI TẠO ---
safeAddEvent("newGameBtn", "click", () => { requestId++; thinking = false; chess.reset(); selectedSquare = null; legalTargets = []; lastMove = null; setupClock(); updateUI(); });
safeAddEvent("undoBtn", "click", () => { if (thinking || !chess.history().length) return; chess.undo(); if (chess.turn() === "b" && chess.history().length) chess.undo(); updateUI(); });
safeAddEvent("flipBtn", "click", () => { flipped = !flipped; renderBoard(); });
safeAddEvent("pauseBtn", "click", () => { isPaused = !isPaused; $("pauseBtn").innerHTML = isPaused ? "▶ Tiếp tục" : "⏸ Tạm dừng"; });
safeAddEvent("saveEndpointBtn", "click", () => { localStorage.setItem("nyraChessEndpoint", $("endpointInput").value.trim()); alert("Đã lưu API"); });
safeAddEvent("timeControlSelect", "change", setupClock);

if ($("endpointInput")) $("endpointInput").value = localStorage.getItem("nyraChessEndpoint") || API_DEFAULT;
setupClock();
updateUI();

// --- PHÂN TÍCH VÁN BẰNG NYRA ---
function escapeHtml(t) { return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function renderReview(r) {
  const box = $("reviewResult");
  const badge = (cls) => `<span class="rv-badge" style="background:${CLASS_INFO[cls].color}">${CLASS_INFO[cls].icon}</span>`;
  const pts = r.evals.map((v, i) => `${(i / Math.max(1, r.evals.length - 1) * 100).toFixed(1)},${(100 - v).toFixed(1)}`).join(" ");
  const rows = CLASS_ORDER.filter((c) => (r.summary.w.counts[c] || 0) + (r.summary.b.counts[c] || 0) > 0).map((c) =>
    `<div class="rv-row"><span>${badge(c)} ${CLASS_INFO[c].label}</span><span>${r.summary.w.counts[c] || 0}</span><span>${r.summary.b.counts[c] || 0}</span></div>`).join("");
  const list = r.moves.map((m) => {
    const num = m.side === "w" ? `${Math.floor(m.ply / 2) + 1}.` : `${Math.floor(m.ply / 2) + 1}...`;
    const tip = ["inaccuracy", "mistake", "blunder"].includes(m.cls) && m.bestSan ? ` <small>Tốt hơn: ${escapeHtml(m.bestSan)} (−${m.loss.toFixed(0)}% cơ hội thắng)</small>` : "";
    return `<div class="rv-move">${badge(m.cls)} <b>${num} ${escapeHtml(m.san)}</b> <small>${CLASS_INFO[m.cls].label}</small>${tip}</div>`;
  }).join("");
  box.innerHTML = `
    <div class="rv-acc"><div><small>Trắng</small><b>${r.summary.w.acc.toFixed(1)}%</b></div><div><small>Độ chính xác</small></div><div><small>Đen</small><b>${r.summary.b.acc.toFixed(1)}%</b></div></div>
    <svg class="rv-graph" viewBox="0 0 100 100" preserveAspectRatio="none"><rect width="100" height="100" fill="#2a2a26"/><rect width="100" height="50" fill="#e6dfcc" y="50"/><polyline points="${pts}" fill="none" stroke="#d7b66c" stroke-width="1.6" vector-effect="non-scaling-stroke"/><line x1="0" y1="50" x2="100" y2="50" stroke="#8884" stroke-width=".6"/></svg>
    <div class="rv-row rv-head"><span></span><span>Trắng</span><span>Đen</span></div>${rows}
    <div class="rv-list">${list}</div>`;
}

safeAddEvent("reviewBtn", "click", async () => {
  const box = $("reviewResult"), btn = $("reviewBtn");
  const hist = chess.history({ verbose: true });
  if (!hist.length) { box.textContent = "Chưa có nước đi nào để phân tích."; return; }
  if (!hasLocalNyra()) { box.textContent = "Trình duyệt này chưa chạy được Nyra WebAssembly nên không phân tích được."; return; }
  btn.disabled = true;
  try {
    const r = await reviewGame(hist.map((m) => ({ from: m.from, to: m.to, promotion: m.promotion })), {
      Chess, timeMs: 350,
      onProgress: (i, t) => { box.innerHTML = `<p class="rv-progress">Nyra đang phân tích… ${i}/${t}</p><div class="rv-bar"><div style="width:${(i / t * 100).toFixed(0)}%"></div></div>`; },
    });
    renderReview(r);
  } catch (e) {
    box.textContent = "Không phân tích được: " + e.message;
  } finally {
    btn.disabled = false;
  }
});
