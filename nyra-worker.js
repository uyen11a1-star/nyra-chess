// nyra-worker.js — chạy Nyra (WebAssembly) trong Web Worker, không chặn giao diện
importScripts("nyra-wasi.js");
let ex = null, ready = null;

function init() {
  if (!ready) ready = (async () => {
    const resp = await fetch("nyra.wasm?v=3");
    if (!resp.ok) throw new Error("Không tải được nyra.wasm");
    const bytes = await resp.arrayBuffer();
    const imports = { wasi_snapshot_preview1: nyraCreateWasi(() => ex.memory) };
    const { instance } = await WebAssembly.instantiate(bytes, imports);
    ex = instance.exports;
    ex._initialize();
    ex.nyra_init();
  })();
  return ready;
}

function readCString(ptr) {
  const m = new Uint8Array(ex.memory.buffer);
  let e = ptr;
  while (m[e] !== 0) e++;
  return new TextDecoder().decode(m.subarray(ptr, e));
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
    self.postMessage({ id, result: JSON.parse(json) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
