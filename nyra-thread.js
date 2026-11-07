// nyra-thread.js — luồng phụ của Nyra (Web Worker con, dùng chung bộ nhớ với worker chính)
importScripts("nyra-wasi.js?v=2");
self.onmessage = (e) => {
  const { module, memory, tid, startArg } = e.data;
  const imports = {
    env: { memory },
    wasi_snapshot_preview1: nyraCreateWasi(() => memory),
    wasi: { "thread-spawn": () => -1 },
  };
  WebAssembly.instantiate(module, imports)
    .then((inst) => { inst.exports.wasi_thread_start(tid, startArg); })
    .catch((err) => { console.error("Nyra luồng phụ lỗi:", err); });
};
