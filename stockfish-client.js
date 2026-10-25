// stockfish-client.js — Stockfish 19 (lite, 1 luồng, WebAssembly) chạy trong Web Worker.
// Elo dùng UCI_LimitStrength + UCI_Elo của chính Stockfish (không tự quy đổi từ độ sâu).
// Khoảng Elo hợp lệ do engine báo: 1320–3190 (thang CCRL 40/4, hiệu chỉnh ở 60s+0.6s).
export const SF_ELO_MIN = 1320;
export const SF_ELO_MAX = 3190;
// Mức chơi ở tab Chơi. Elo = UCI_Elo của Stockfish (không bằng Chess.com/FIDE).
// sf1000: Stockfish không xuống dưới 1320 nên thêm xác suất đi nước ngẫu nhiên (blunder).
export const SF_LEVELS = {
  sf1000: { label: "Stockfish ~1000", elo: 1320, blunder: 0.17, movetime: 100 },
  sf1500: { label: "Stockfish 1500", elo: 1500, blunder: 0, movetime: 200 },
  sf2000: { label: "Stockfish 2000", elo: 2000, blunder: 0, movetime: 300 },
  sf2500: { label: "Stockfish 2500", elo: 2500, blunder: 0, movetime: 600 },
  sf2750: { label: "Stockfish 2750", elo: 2750, blunder: 0, movetime: 800 },
  sf3000: { label: "Stockfish 3000", elo: 3000, blunder: 0, movetime: 1000 },
};
const SF_URL = "stockfish/stockfish-19-lite-single.js";

export class StockfishEngine {
  constructor() { this.worker = null; this.waiters = []; this.info = null; this.ready = null; this.cfgKey = ""; }

  _spawn() {
    this.worker = new Worker(SF_URL);
    this.worker.onmessage = (e) => {
      const line = typeof e.data === "string" ? e.data : String(e.data && e.data.data != null ? e.data.data : "");
      this._onLine(line.trim());
    };
    this.worker.onerror = (e) => this._fail(new Error("Stockfish worker lỗi: " + (e.message || "không rõ")));
  }

  _onLine(line) {
    if (line.startsWith("info") && line.includes(" score ") && !line.includes("currmove") && !/ (lower|upper)bound/.test(line)) {
      const d = line.match(/ depth (\d+)/), cp = line.match(/ score cp (-?\d+)/), mt = line.match(/ score mate (-?\d+)/);
      if (d) this.info = { depth: +d[1], cp: cp ? +cp[1] : null, mate: mt ? +mt[1] : null };
    }
    for (let i = 0; i < this.waiters.length; i++) {
      const w = this.waiters[i];
      if (w.test(line)) { this.waiters.splice(i, 1); w.resolve(line); return; }
    }
  }

  _fail(err) {
    const ws = this.waiters; this.waiters = [];
    for (const w of ws) w.reject(err);
    this.ready = null;
  }

  _send(cmd) { this.worker.postMessage(cmd); }

  _wait(test, ms) {
    return new Promise((resolve, reject) => {
      const w = { test, resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } };
      const t = setTimeout(() => {
        const i = this.waiters.indexOf(w); if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error("Stockfish không phản hồi"));
      }, ms);
      this.waiters.push(w);
    });
  }

  async init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") throw new Error("Trình duyệt không hỗ trợ WebAssembly/Worker");
      this._spawn();
      const ok = this._wait((l) => l === "uciok", 30000);
      this._send("uci"); await ok;
      await this._isready();
    })();
    this.ready.catch(() => { this.ready = null; });
    return this.ready;
  }

  async _isready() { const r = this._wait((l) => l === "readyok", 30000); this._send("isready"); await r; }

  async newGame() { await this.init(); this._send("ucinewgame"); await this._isready(); }

  // opts: { elo (1320–3190), full (true = không giới hạn sức mạnh), movetime (ms) }
  // trả về { uci, depth, cp, mate } — cp/mate tính theo bên đang đi
  async bestMove(fen, opts) {
    await this.init();
    const full = !!opts.full;
    const elo = Math.max(SF_ELO_MIN, Math.min(SF_ELO_MAX, Math.round(opts.elo || SF_ELO_MAX)));
    const key = full ? "full" : "elo" + elo;
    if (key !== this.cfgKey) {
      this._send(`setoption name UCI_LimitStrength value ${full ? "false" : "true"}`);
      if (!full) this._send(`setoption name UCI_Elo value ${elo}`);
      await this._isready();
      this.cfgKey = key;
    }
    const mt = Math.max(20, Math.round(opts.movetime || 300));
    this.info = null;
    const done = this._wait((l) => l.startsWith("bestmove"), mt + 15000);
    this._send("position fen " + fen);
    this._send("go movetime " + mt);
    const line = await done;
    const uci = (line.split(/\s+/)[1] || "").toLowerCase();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error("Stockfish không trả nước đi hợp lệ");
    return { uci, ...(this.info || { depth: 0, cp: null, mate: null }) };
  }

  stop() { if (this.worker) try { this._send("stop"); } catch (e) { /* bỏ qua */ } }

  terminate() {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    this._fail(new Error("Đã dừng Stockfish"));
    this.cfgKey = "";
  }
}
