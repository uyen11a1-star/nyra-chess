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

// ---- Nhận ra hy sinh quân bằng trao đổi quân trên ô đích (không phụ thuộc đường đi chính ngắn hay dài) ----
const SEE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
// Bên đang đi bắt trên ô `to` bằng quân rẻ nhất trước, dừng khi bắt tiếp không có lợi. Trả về lợi tối đa (>= 0).
function exchangeGain(c, to, depth) {
  if (depth > 10) return 0;
  const caps = c.moves({ verbose: true }).filter((m) => m.to === to && m.captured && !m.promotion);
  if (!caps.length) return 0;
  caps.sort((a, b) => SEE_VAL[a.piece] - SEE_VAL[b.piece]);
  const m = caps[0];
  c.move(m);
  const gain = SEE_VAL[m.captured] - exchangeGain(c, to, depth + 1);
  c.undo();
  return Math.max(0, gain);
}
// net = số điểm bên đi bị hụt sau chuỗi bắt trên ô đích; offered = giá trị quân đang đứng trên ô đó (quân bị "dâng")
function sacrificeBySee(Chess, fen, uci) {
  try {
    const c = new Chess(fen);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!m || m.promotion) return { net: 0, offered: 0 };
    const got = m.captured ? SEE_VAL[m.captured] : 0;
    return { net: Math.max(0, exchangeGain(c, m.to, 0) - got), offered: SEE_VAL[m.piece] };
  } catch (e) { return { net: 0, offered: 0 }; }
}

function classify(x) {
  const { isBest, loss, wpBest, wpAfter, wpSecond, legal, isBook, sacrifice, sacSize, matBefore } = x;
  if (isBook) return "book";
  const nearBest = isBest || loss <= 0.5;
  // Thiên tài (!!): nước tốt nhất (hoặc gần nhất) + hy sinh quân thật sự (không lấy lại được trong ~3 nước) + sau đó vẫn tốt,
  // và nước hy sinh phải có ý nghĩa: bên đi chưa hơn quân lớn từ trước, và không phải thế nào cũng thắng bằng cách khác
  // (riêng hy sinh từ Xe trở lên — 5 điểm — thì luôn tính, vì dù còn đường thắng khác thì đó vẫn là nước đẹp).
  // Nước hy sinh thật thì nới "gần tốt nhất" lên 1,5% (chênh nhỏ giữa hai lần quét là nhiễu, không nên làm lỡ nước đẹp)
  const nearBestSac = isBest || loss <= 1.5;
  if (nearBestSac && sacrifice && legal >= 2 && wpAfter >= 55 && matBefore <= 3 &&
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

// Số worker chạy song song: phân tích từng thế cờ độc lập nên chia thế cờ cho nhiều worker là nhanh gần tuyệt đối theo số nhân
export function pickWorkers() {
  const hc = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2;
  let mode = "balanced";
  try { mode = JSON.parse(localStorage.getItem("nyraSettings") || "{}").reviewCpu || "balanced"; } catch (e) { /* bỏ qua */ }
  // Kết quả không phụ thuộc số worker (đã kiểm chứng), nên chọn số luồng chỉ ảnh hưởng tốc độ/độ nóng máy:
  // tiết kiệm = nửa số nhân, cân bằng = chừa 2 nhân cho giao diện, tối đa = dùng hết các nhân
  if (mode === "eco") return Math.max(1, Math.min(4, Math.floor(hc / 2)));
  if (mode === "max") return Math.max(1, Math.min(12, hc));
  return Math.max(1, Math.min(6, hc - 2));
}
export function makeAnalyzer(nWorkers = pickWorkers()) {
  // "#st" ép mỗi worker chạy 1 luồng (nhiều worker chạy song song theo thế cờ hiệu quả hơn nhiều luồng trong một lần tìm)
  const ws = [];
  let id = 0;
  const pend = new Map();
  for (let k = 0; k < nWorkers; k++) {
    const w = new Worker("nyra-worker.js?v=7#st");
    w.onmessage = (e) => {
      const p = pend.get(e.data.id);
      if (!p) return;
      pend.delete(e.data.id);
      if (e.data.error) p.rej(new Error(e.data.error)); else p.res(e.data.result);
    };
    w.onerror = () => { for (const [, p] of pend) p.rej(new Error("Worker lỗi")); pend.clear(); };
    ws.push(w);
  }
  let busyMs = 0;  // tổng thời gian các worker thật sự bận (để biết máy chạy song song hiệu quả cỡ nào)
  const send = (w, fen, timeMs, played, reset = true) => new Promise((res, rej) => { const i = ++id; const t0 = performance.now(); pend.set(i, { res: (v) => { busyMs += performance.now() - t0; res(v); }, rej }); w.postMessage({ id: i, fen, timeMs, type: "analyze", played: played || "", reset, vstep: VSTEP }); });
  return {
    analyze: (fen, timeMs, played) => send(ws[0], fen, timeMs, played),
    // items: [{fen, timeMs, played}] -> kết quả theo đúng thứ tự.
    // Chia thành các nhóm CỐ ĐỊNH `chunk` thế liên tiếp; mỗi nhóm do một worker làm tuần tự, chỉ xoá engine ở đầu nhóm (các thế kề nhau dùng lại bảng băm nên tìm sâu hơn cùng một ngân sách).
    // Kết quả chỉ phụ thuộc cách chia nhóm (cố định), không phụ thuộc số worker hay worker nào làm; worker rảnh lấy nhóm kế tiếp nên không bị lệch tải.
    analyzeBatch: async (items, onItem, { chunk = 1 } = {}) => {
      const out = new Array(items.length);
      const nChunks = Math.ceil(items.length / chunk);
      let next = 0;
      await Promise.all(ws.map(async (w) => {
        for (;;) {
          const c = next++;
          if (c >= nChunks) return;
          for (let j = c * chunk; j < Math.min(items.length, (c + 1) * chunk); j++) {
            out[j] = await send(w, items[j].fen, items[j].timeMs, items[j].played, j === c * chunk);
            if (onItem) onItem();
          }
        }
      }));
      return out;
    },
    size: ws.length,
    get busyMs() { return busyMs; },
    close: () => ws.forEach((w) => w.terminate()),
  };
}

// moves: [{from,to,promotion}]. Trả về { moves, summary, evals }
// Đã đo trên 3 ván thật so với một lần phân tích rất sâu (1600): nghĩ nhẹ 150 cho mọi thế rồi kiểm tra lại 12 nước quan trọng ở mức 1000
// cho độ khớp ngang bản cũ (400 + 1000x2.5) nhưng nhanh hơn 25-45%.
export const REVIEW_TIME_MS = 150, REFINE_MS = 1000;
const DEF_REFINE = 12, DEF_REFINE_X = REFINE_MS / REVIEW_TIME_MS;
export const REVIEW_CHUNK = 1, REFINE_CHUNK = 1;
const REVIEW_VER = "r6";
// Đồng hồ ảo: mỗi lần engine hỏi giờ nhích 1,3ms -> giới hạn thời gian thành giới hạn số nút tìm kiếm, kết quả y hệt ở mọi máy và mọi lần chạy
const VSTEP = 1.3e6;

// Bộ nhớ kết quả: cùng một ván (cùng dãy nước + cùng thông số) luôn trả về đúng kết quả đã tính, không tính lại
const CACHE_KEY = "nyra_review_cache_v6", CACHE_MAX = 24;
const memCache = new Map();
function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch (e) { return {}; } }
function saveCache(key, data) {
  memCache.set(key, data);
  try {
    const all = loadCache();
    all[key] = { t: Date.now(), data };
    const keys = Object.keys(all).sort((a, b) => all[b].t - all[a].t);
    for (const k of keys.slice(CACHE_MAX)) delete all[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch (e) { /* đầy bộ nhớ trình duyệt: bỏ qua, vẫn dùng bản trong RAM */ }
}
function readCache(key) {
  if (memCache.has(key)) return memCache.get(key);
  const e = loadCache()[key];
  return e ? e.data : null;
}
function gameKey(moves, p) { return REVIEW_VER + "|" + p.join(",") + "|" + moves.map((m) => m.from + m.to + (m.promotion || "")).join(" "); }

export async function reviewGame(moves, opts = {}) {
  const { timeMs = REVIEW_TIME_MS, maxRefine = DEF_REFINE, refineX = DEF_REFINE_X, chunk1 = REVIEW_CHUNK, chunk2 = REFINE_CHUNK, onProgress } = opts;
  const key = gameKey(moves, [timeMs, maxRefine, refineX, chunk1, chunk2]);
  const hit = readCache(key);
  if (hit) { if (onProgress) onProgress(1, 1); const c = JSON.parse(JSON.stringify(hit)); c.stats = { ...(c.stats || {}), cached: true }; return c; }
  const t0 = Date.now();
  const res = await reviewGameFresh(moves, { ...opts, timeMs, maxRefine, refineX, chunk1, chunk2 });
  res.stats = { ...(res.stats || {}), sec: (Date.now() - t0) / 1000 };
  saveCache(key, res);
  return res;
}

async function reviewGameFresh(moves, { Chess, timeMs = REVIEW_TIME_MS, maxRefine = DEF_REFINE, refineX = DEF_REFINE_X, chunk1 = REVIEW_CHUNK, chunk2 = REFINE_CHUNK, onProgress, onPartial, analyzer } = {}) {
  const az = analyzer || makeAnalyzer();
  const T0 = performance.now();
  let tFirst = 0;
  let wakeLock = null;
  try { if (typeof navigator !== "undefined" && navigator.wakeLock) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { /* không bắt buộc */ }  // giữ màn hình sáng để trình duyệt không hạ tốc độ khi đang phân tích
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
    // Chạy cho mọi thế cờ (song song nếu analyzer có analyzeBatch); truyền nước đã đi để engine chỉ tìm "nước tốt thứ hai" khi cần
    const runAll = async (idxs, ms, tickBase, tickTotal, chunk = 1) => {
      const items = idxs.map((j) => ({ fen: fens[j], timeMs: ms, played: j < n ? infos[j].uci : "" }));
      let k = 0;
      const tick = () => { if (onProgress) onProgress(tickBase + (++k), tickTotal); };
      if (az.analyzeBatch) return az.analyzeBatch(items, tick, { chunk });
      const res = [];
      for (const it of items) { res.push(await az.analyze(it.fen, it.timeMs, it.played)); tick(); }
      return res;
    };
    const an = await runAll([...Array(total).keys()], timeMs, 0, total, chunk1);
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
      // hy sinh theo trao đổi quân: hụt >= 2 điểm, hoặc dâng một quân (mã/tượng trở lên) mà hụt >= 1 điểm (vd mã đổi 2 tốt)
      const see = sacrificeBySee(Chess, fens[i], infos[i].uci);
      const seeFlag = see.net >= 2 || (see.net >= 1 && see.offered >= 3);
      const sacCand = seeFlag && !isBook;
      if (seeFlag && !isBook && (isBest || loss <= 2)) { sacrifice = true; sacSize = Math.max(sacSize, see.net); }
      const cls = classify({ isBest, loss, wpBest, wpAfter, wpSecond, legal: cur.legal || 0, isBook, sacrifice, sacSize, matBefore });
      let bestSan = "";
      try {
        const c = new Chess(fens[i]);
        bestSan = c.move({ from: cur.best.slice(0, 2), to: cur.best.slice(2, 4), promotion: cur.best[4] }).san;
      } catch (e) {}
      return { ply: i, side, san: infos[i].san, uci: infos[i].uci, cls, loss, bestSan, sacrifice, sacCand,
               bestUci: cur.best || "", acc: isBest ? 100 : moveAccuracy(loss),
               bestCp, afterCp, pvBest: cur.pv || null, pvAfter: nxt.over ? null : (nxt.pv || null) };
    };
    const out = [];
    for (let i = 0; i < n; i++) out.push(judge(i));

    // Vòng 2 ("nghĩ kỹ lại"): với tối đa MAX_REFINE nước nghiêm trọng hoặc đặc biệt, phân tích lại hai thế bằng thời gian gấp REFINE_X
    // để tránh phán nhầm "sai lầm nặng"/"thiên tài" chỉ vì lần quét nhanh nhìn chưa tới.
    // Ưu tiên các nước nghi là hy sinh hay (loss nhỏ trước) vì quét nhanh dễ nhìn chưa tới; sau đó mới đến các nước nặng nhất.
    const build = (outArr, evArr) => {
      const mv = outArr.map((m) => ({ ...m, wpAfterWhite: evArr[m.ply + 1] }));
      const sm = { w: { acc: 0, n: 0, counts: {} }, b: { acc: 0, n: 0, counts: {} } };
      for (const m of mv) { const s = sm[m.side]; s.acc += m.acc; s.n++; s.counts[m.cls] = (s.counts[m.cls] || 0) + 1; }
      for (const k of ["w", "b"]) sm[k].acc = sm[k].n ? sm[k].acc / sm[k].n : 0;
      return { moves: mv, summary: sm, evals: [...evArr] };
    };
    tFirst = (performance.now() - T0) / 1000;
    const susp = out.filter((m) => m.sacCand && m.loss <= 15).sort((a, b) => a.loss - b.loss).slice(0, 5);
    const heavy = out.filter((m) => ["blunder", "mistake", "brilliant", "great"].includes(m.cls) || m.sacrifice).sort((a, b) => b.loss - a.loss);
    const pick = [];
    for (const m of [...susp, ...heavy]) if (!pick.includes(m) && pick.length < maxRefine) pick.push(m);
    const cand = pick.map((m) => m.ply).sort((a, b) => a - b);
    // Có vòng nghĩ kỹ lại thì báo kết quả tạm ngay (đã đủ dùng), vòng sau chỉ chỉnh lại vài nước quan trọng
    if (cand.length && onPartial) { try { onPartial(build(out, evals)); } catch (e) {} }
    if (cand.length) {
      const need = new Set();
      for (const i of cand) { need.add(i); if (i + 1 < n || (i + 1 === n && !over)) need.add(i + 1); }
      const js = [...need].sort((a, b) => a - b).filter((j) => !(an[j] && an[j].over));
      const re = await runAll(js, Math.round(timeMs * refineX), total, total + js.length, chunk2);
      js.forEach((j, q) => { an[j] = re[q]; });
      const redo = new Set();
      for (const i of cand) { redo.add(i - 1); redo.add(i); redo.add(i + 1); }
      for (const i of redo) if (i >= 0 && i < n) out[i] = judge(i);
      // win% của Trắng sau mỗi nước dựa trên kết quả phân tích mới nhất
      evals.length = 0;
      an.forEach((a, j) => { const t = turnOf(j); let cp = a.over ? (a.mated ? -MATE_CP : 0) : toCp(a.score); if (t === "b") cp = -cp; evals.push(winPercent(cp)); });
    }
    const fin = build(out, evals);
    fin.stats = { workers: az.size || 0, firstSec: tFirst, busySec: (az.busyMs || 0) / 1000, items: total };
    return fin;
  } finally {
    if (!analyzer) az.close();
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* bỏ qua */ }
  }
}

// Chấm MỘT nước tuỳ ý trong thế cờ `fen` (dùng cho chế độ "thử nước"): cùng cách phân loại với reviewGame.
// Trả về { side, san, uci, cls, loss, bestSan, bestUci, sacrifice, wpBeforeWhite, wpAfterWhite, fenAfter }
const tryMem = new Map();
export async function judgeTry(Chess, fen, uci, { analyzer, timeMs = REFINE_MS } = {}) {
  const tk = REVIEW_VER + "|" + timeMs + "|" + fen + "|" + uci;
  if (tryMem.has(tk)) return { ...tryMem.get(tk) };
  const out = await judgeTryFresh(Chess, fen, uci, { analyzer, timeMs });
  tryMem.set(tk, out);
  return { ...out };
}
async function judgeTryFresh(Chess, fen, uci, { analyzer, timeMs }) {
  const c = new Chess(fen);
  const side = c.turn();
  const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  if (!mv) throw new Error("Nước đi không hợp lệ");
  const fenAfter = c.fen(), over = c.isGameOver(), mated = c.isCheckmate();
  const items = [{ fen, timeMs, played: uci }];
  if (!over) items.push({ fen: fenAfter, timeMs, played: "" });
  const res = analyzer.analyzeBatch ? await analyzer.analyzeBatch(items) : [await analyzer.analyze(fen, timeMs, uci), ...(over ? [] : [await analyzer.analyze(fenAfter, timeMs, "")])];
  const cur = res[0], nxt = over ? { over: true, mated } : res[1];
  const bestCp = toCp(cur.score);
  const isBest = uci === cur.best;
  let afterCp = nxt.over ? (nxt.mated ? MATE_CP : 0) : -toCp(nxt.score);
  if (isBest) afterCp = bestCp;
  const wpBest = winPercent(bestCp);
  const wpAfter = Math.min(winPercent(afterCp), wpBest);
  const loss = isBest ? 0 : Math.max(0, wpBest - wpAfter);
  const wpSecond = typeof cur.second === "number" ? winPercent(toCp(cur.second)) : null;
  const isBook = !!(cur.book && cur.book.includes(uci));
  let sacrifice = false, sacSize = 0;
  const matBefore = materialDiff(new Chess(fen), side);
  if (!nxt.over && nxt.pv && (isBest || loss <= 2)) {
    const r = materialAfterPv(Chess, fenAfter, nxt.pv, side, matBefore);
    if (r) { sacrifice = r.worst <= -2 && r.final <= -2; sacSize = -r.worst; }
  }
  const see = sacrificeBySee(Chess, fen, uci);
  const seeFlag = see.net >= 2 || (see.net >= 1 && see.offered >= 3);
  if (seeFlag && !isBook && (isBest || loss <= 2)) { sacrifice = true; sacSize = Math.max(sacSize, see.net); }
  const cls = classify({ isBest, loss, wpBest, wpAfter, wpSecond, legal: cur.legal || 0, isBook, sacrifice, sacSize, matBefore });
  let bestSan = "";
  try {
    const c2 = new Chess(fen);
    bestSan = c2.move({ from: cur.best.slice(0, 2), to: cur.best.slice(2, 4), promotion: cur.best[4] }).san;
  } catch (e) {}
  const toWhite = (wp) => (side === "w" ? wp : 100 - wp);
  return { ply: 0, side, san: mv.san, uci, cls, loss, bestSan, bestUci: cur.best || "", sacrifice,
           bestCp, afterCp, pvBest: cur.pv || null, pvAfter: nxt.over ? null : (nxt.pv || null),
           wpBeforeWhite: toWhite(wpBest), wpAfterWhite: toWhite(wpAfter), fenAfter };
}
