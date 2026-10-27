// nyra-review.js — Nyra phân tích ván cờ ngay trong trình duyệt (dùng nyra.wasm).
// Công thức win% và accuracy% lấy theo Lichess. Các mốc phân loại nước đi do Nyra tự đặt.

const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const MATE_CP = 10000;

export const CLASS_INFO = {
  brilliant:  { label: "Thiên tài",       icon: "!!", color: "#2fd1c1" },
  great:      { label: "Rất hay",         icon: "!",  color: "#5b9cf5" },
  best:       { label: "Tốt nhất",        icon: "★",  color: "#8fd16f" },
  excellent:  { label: "Rất tốt",         icon: "✔",  color: "#9bcf9d" },
  good:       { label: "Ổn",              icon: "○",  color: "#b8c4a6" },
  book:       { label: "Sách khai cuộc",  icon: "☰",  color: "#c9a875" },
  inaccuracy: { label: "Thiếu chính xác", icon: "?!", color: "#e6c34a" },
  mistake:    { label: "Sai lầm",         icon: "?",  color: "#e8964f" },
  blunder:    { label: "Sai lầm nặng",    icon: "??", color: "#e0624f" },
};
export const CLASS_ORDER = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "blunder"];

export function winPercent(cp) {
  cp = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
export function moveAccuracy(loss) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}
const toCp = (s) => (s >= 99000 ? MATE_CP : s <= -99000 ? -MATE_CP : s);

function materialDiff(chess, color) {  // vật chất của `color` trừ đối thủ
  let me = 0, op = 0;
  for (const row of chess.board()) for (const sq of row) if (sq) {
    if (sq.color === color) me += PIECE_VAL[sq.type]; else op += PIECE_VAL[sq.type];
  }
  return me - op;
}

// Chơi tối đa 6 nước đầu của đường đi chính (kết thúc sau nước của bên vừa đi), theo dõi vật chất của bên vừa đi
// so với trước khi đi: `worst` = lúc hụt nhiều nhất, `final` = cuối đường đi.
function materialAfterPv(Chess, fen, pv, mover, before) {
  let k = Math.min(pv.length, 6);
  if (k % 2 === 1) k--;
  if (k < 2) return null;
  try {
    const c = new Chess(fen);
    let worst = 0, final = 0;
    for (let i = 0; i < k; i++) {
      c.move({ from: pv[i].slice(0, 2), to: pv[i].slice(2, 4), promotion: pv[i][4] });
      const d = materialDiff(c, mover) - before;
      if (d < worst) worst = d;
      final = d;
    }
    return { worst, final };
  } catch (e) { return null; }
}

function classify(x) {
  const { isBest, loss, wpBest, wpAfter, wpSecond, legal, isBook, sacrifice, sacSize, matBefore } = x;
  if (isBook) return "book";
  const nearBest = isBest || loss <= 0.5;
  // Thiên tài (!!): nước tốt nhất (hoặc gần nhất) + hy sinh quân thật sự (không lấy lại được trong ~3 nước) + sau đó vẫn tốt,
  // và nước hy sinh phải có ý nghĩa: bên đi chưa hơn quân lớn từ trước, và không phải thế nào cũng thắng bằng cách khác
  // (riêng hy sinh từ Xe trở lên — 5 điểm — thì luôn tính, vì dù còn đường thắng khác thì đó vẫn là nước đẹp).
  if (nearBest && sacrifice && legal >= 2 && wpAfter >= 55 && matBefore <= 3 &&
      (wpSecond === null || wpSecond <= 92 || wpBest - wpSecond >= 8 || sacSize >= 5)) return "brilliant";
  if (nearBest) {
    if (isBest && legal >= 2 && wpSecond !== null && wpBest - wpSecond >= 15 && wpBest <= 95) return "great";
    return "best";
  }
  if (loss <= 2) return "excellent";
  if (loss <= 5) return "good";
  if (loss <= 10) return "inaccuracy";
  if (loss <= 20) return "mistake";
  return "blunder";
}

export function makeAnalyzer() {
  const w = new Worker("nyra-worker.js?v=3");
  let id = 0;
  const pend = new Map();
  w.onmessage = (e) => {
    const p = pend.get(e.data.id);
    if (!p) return;
    pend.delete(e.data.id);
    if (e.data.error) p.rej(new Error(e.data.error)); else p.res(e.data.result);
  };
  w.onerror = () => { for (const [, p] of pend) p.rej(new Error("Worker lỗi")); pend.clear(); };
  return {
    analyze: (fen, timeMs) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); w.postMessage({ id: i, fen, timeMs, type: "analyze" }); }),
    close: () => w.terminate(),
  };
}

// moves: [{from,to,promotion}]. Trả về { moves, summary, evals }
const MAX_REFINE = 8, REFINE_X = 3;

export async function reviewGame(moves, { Chess, timeMs = 350, onProgress, analyzer } = {}) {
  const az = analyzer || makeAnalyzer();
  try {
    const chess = new Chess();
    const fens = [chess.fen()], infos = [];
    for (const mv of moves) {
      const m = chess.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
      if (!m) break;
      infos.push({ san: m.san, uci: m.from + m.to + (m.promotion || ""), side: m.color });
      fens.push(chess.fen());
    }
    const n = infos.length, over = chess.isGameOver(), mated = chess.isCheckmate();
    const total = over ? n : n + 1;
    const an = [];
    for (let i = 0; i < total; i++) {
      an[i] = await az.analyze(fens[i], timeMs);
      if (onProgress) onProgress(i + 1, total);
    }
    if (over) an[n] = { over: true, mated };

    const turnOf = (j) => fens[j].split(" ")[1];
    const evals = an.map((a, j) => {  // win% của Trắng sau mỗi nước
      const t = turnOf(j);
      let cp = a.over ? (a.mated ? -MATE_CP : 0) : toCp(a.score);
      if (t === "b") cp = -cp;
      return winPercent(cp);
    });

    const judge = (i) => {
      const cur = an[i], nxt = an[i + 1], side = infos[i].side;
      const bestCp = toCp(cur.score);
      const isBest = infos[i].uci === cur.best;
      let afterCp = nxt.over ? (nxt.mated ? MATE_CP : 0) : -toCp(nxt.score);
      if (isBest) afterCp = bestCp;
      const wpBest = winPercent(bestCp);
      const wpAfter = Math.min(winPercent(afterCp), wpBest);
      const loss = isBest ? 0 : Math.max(0, wpBest - wpAfter);
      const wpSecond = typeof cur.second === "number" ? winPercent(toCp(cur.second)) : null;
      const isBook = !!(cur.book && cur.book.includes(infos[i].uci));
      let sacrifice = false, sacSize = 0;
      const matBefore = materialDiff(new Chess(fens[i]), side);
      if (!nxt.over && nxt.pv && (isBest || loss <= 2)) {
        const r = materialAfterPv(Chess, fens[i + 1], nxt.pv, side, matBefore);
        if (r) { sacrifice = r.worst <= -2 && r.final <= -2; sacSize = -r.worst; }
      }
      const cls = classify({ isBest, loss, wpBest, wpAfter, wpSecond, legal: cur.legal || 0, isBook, sacrifice, sacSize, matBefore });
      let bestSan = "";
      try {
        const c = new Chess(fens[i]);
        bestSan = c.move({ from: cur.best.slice(0, 2), to: cur.best.slice(2, 4), promotion: cur.best[4] }).san;
      } catch (e) {}
      return { ply: i, side, san: infos[i].san, uci: infos[i].uci, cls, loss, bestSan, sacrifice,
               bestUci: cur.best || "", acc: isBest ? 100 : moveAccuracy(loss) };
    };
    const out = [];
    for (let i = 0; i < n; i++) out.push(judge(i));

    // Vòng 2 ("nghĩ kỹ lại"): với tối đa MAX_REFINE nước nghiêm trọng hoặc đặc biệt, phân tích lại hai thế bằng thời gian gấp REFINE_X
    // để tránh phán nhầm "sai lầm nặng"/"thiên tài" chỉ vì lần quét nhanh nhìn chưa tới.
    const cand = out.filter((m) => ["blunder", "mistake", "brilliant", "great"].includes(m.cls) || m.sacrifice)
      .sort((a, b) => b.loss - a.loss).slice(0, MAX_REFINE).map((m) => m.ply).sort((a, b) => a - b);
    if (cand.length) {
      const need = new Set();
      for (const i of cand) { need.add(i); if (i + 1 < n || (i + 1 === n && !over)) need.add(i + 1); }
      let k = 0;
      for (const j of [...need].sort((a, b) => a - b)) {
        if (an[j] && an[j].over) continue;
        an[j] = await az.analyze(fens[j], timeMs * REFINE_X);
        if (onProgress) onProgress(total + (++k), total + need.size);
      }
      const redo = new Set();
      for (const i of cand) { redo.add(i - 1); redo.add(i); redo.add(i + 1); }
      for (const i of redo) if (i >= 0 && i < n) out[i] = judge(i);
      // win% của Trắng sau mỗi nước dựa trên kết quả phân tích mới nhất
      evals.length = 0;
      an.forEach((a, j) => { const t = turnOf(j); let cp = a.over ? (a.mated ? -MATE_CP : 0) : toCp(a.score); if (t === "b") cp = -cp; evals.push(winPercent(cp)); });
    }
    for (let i = 0; i < n; i++) out[i].wpAfterWhite = evals[i + 1];

    const summary = { w: { acc: 0, n: 0, counts: {} }, b: { acc: 0, n: 0, counts: {} } };
    for (const m of out) {
      const s = summary[m.side];
      s.acc += m.acc; s.n++;
      s.counts[m.cls] = (s.counts[m.cls] || 0) + 1;
    }
    for (const k of ["w", "b"]) summary[k].acc = summary[k].n ? summary[k].acc / summary[k].n : 0;
    return { moves: out, summary, evals };
  } finally {
    if (!analyzer) az.close();
  }
}
