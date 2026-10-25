// nyra-client.js — gọi Nyra chạy ngay trong trình duyệt (WebAssembly).
// Nếu wasm không chạy được thì tự động quay lại gọi API (Render) như cũ.
export const NYRA_LOCAL_MS = 2000;  // thời gian nghĩ tối đa mỗi nước (mili-giây)

let worker = null, broken = false, msgId = 0;
const pending = new Map();

function getWorker() {
  if (broken || typeof Worker === "undefined" || typeof WebAssembly === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker("nyra-worker.js?v=3");
      worker.onmessage = (e) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.result);
      };
      worker.onerror = () => {
        broken = true;
        for (const [, p] of pending) p.reject(new Error("Worker lỗi"));
        pending.clear();
      };
    } catch (err) { broken = true; return null; }
  }
  return worker;
}

export function hasLocalNyra() { return !!getWorker(); }

export async function getNyraMove(fen, legalMoves, apiUrl, timeMs = NYRA_LOCAL_MS) {
  const w = getWorker();
  if (w) {
    try {
      const res = await new Promise((resolve, reject) => {
        const id = ++msgId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error("Quá thời gian")); }, timeMs + 20000);
        pending.set(id, {
          resolve: (v) => { clearTimeout(timer); resolve(v); },
          reject: (e) => { clearTimeout(timer); reject(e); },
        });
        w.postMessage({ id, fen, timeMs });
      });
      res.source = "wasm";
      return res;
    } catch (err) {
      console.warn("Nyra wasm lỗi, chuyển sang API:", err.message);
      broken = true;  // lần sau dùng thẳng API cho nhanh
    }
  }
  if (!apiUrl) throw new Error("Nyra wasm không chạy được và chưa có API");
  const r = await fetch(apiUrl, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fen, legal_moves: legalMoves }),
  });
  if (!r.ok) throw new Error("API Error");
  const j = await r.json();
  j.source = "api";
  return j;
}
