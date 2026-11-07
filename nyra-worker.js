// nyra-worker.js — chạy Nyra (WebAssembly) trong Web Worker, không chặn giao diện.
// Có đa luồng (nyra-mt.wasm) khi trình duyệt cho phép (trang cross-origin isolated); không thì chạy 1 luồng như cũ.
importScripts("nyra-wasi.js?v=2");
let ex = null, ready = null, threadCount = 1;

function pickThreads() {
  const hc = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 1;
  return Math.max(1, Math.min(4, Math.floor(hc / 2)));
}
function canThreads() {
  return typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated === true && pickThreads() >= 2;
}

async function initMT() {
  const resp = await fetch("nyra-mt.wasm?v=1");
  if (!resp.ok) throw new Error("Không tải được nyra-mt.wasm");
  const module = await WebAssembly.compile(await resp.arrayBuffer());
  const memory = new WebAssembly.Memory({ initial: 512, maximum: 4096, shared: true });
  let nextTid = 1;
  const imports = {
    env: { memory },
    wasi_snapshot_preview1: nyraCreateWasi(() => memory),
    wasi: {
      "thread-spawn": (startArg) => {
        try {
          const tid = nextTid++;
          const w = new Worker("nyra-thread.js?v=1");
          w.postMessage({ module, memory, tid, startArg });
          return tid;
        } catch (e) { return -1; }
      },
    },
  };
  const instance = await WebAssembly.instantiate(module, imports);
  const e = instance.exports;
  e._initialize();
  e.nyra_init();
  const n = pickThreads();
  e.nyra_pool_start(n);
  // Cho vòng sự kiện chạy để các Worker con khởi động xong (tối đa 4 giây)
  const t0 = performance.now();
  while (e.nyra_pool_ready() < n - 1 && performance.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 20));
  threadCount = 1 + e.nyra_pool_ready();
  e.nyra_set_threads(threadCount);
  ex = e;
}

async function initSingle() {
  const resp = await fetch("nyra.wasm?v=5");
  if (!resp.ok) throw new Error("Không tải được nyra.wasm");
  const bytes = await resp.arrayBuffer();
  const imports = { wasi_snapshot_preview1: nyraCreateWasi(() => ex.memory) };
  const { instance } = await WebAssembly.instantiate(bytes, imports);
  ex = instance.exports;
  ex._initialize();
  ex.nyra_init();
  threadCount = 1;
}

function init() {
  if (!ready) ready = (async () => {
    if (canThreads()) {
      try { await initMT(); return; } catch (err) { console.warn("Nyra đa luồng lỗi, chuyển về 1 luồng:", err); ex = null; }
    }
    await initSingle();
  })();
  return ready;
}

function readCString(ptr) {
  const m = new Uint8Array(ex.memory.buffer);
  let e = ptr;
  while (m[e] !== 0) e++;
  const copy = new Uint8Array(e - ptr);  // TextDecoder không nhận vùng nhớ chung, nên chép ra trước
  copy.set(m.subarray(ptr, e));
  return new TextDecoder().decode(copy);
}

self.onmessage = async (e) => {
  const { id, fen, timeMs, type } = e.data;
  try {
    await init();
    const bytes = new TextEncoder().encode(fen);
    const p = ex.nyra_alloc(bytes.length + 1);
    const m = new Uint8Array(ex.memory.buffer);
    m.set(bytes, p); m[p + bytes.length] = 0;
    const out = (type === "analyze" ? ex.nyra_analyze : ex.nyra_move)(p, timeMs || 2000);
    const json = readCString(out);
    ex.nyra_free(p);
    self.postMessage({ id, result: JSON.parse(json), threads: threadCount });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
