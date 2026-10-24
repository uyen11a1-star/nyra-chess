// nyra-wasi.js — lớp WASI tối thiểu để chạy nyra.wasm (không cần thư viện ngoài)
function nyraCreateWasi(getMemory) {
  const OK = 0, EBADF = 8, ESPIPE = 70;
  const view = () => new DataView(getMemory().buffer);
  return {
    environ_sizes_get(countPtr, sizePtr) { const d = view(); d.setUint32(countPtr, 0, true); d.setUint32(sizePtr, 0, true); return OK; },
    environ_get() { return OK; },
    clock_time_get(id, precision, timePtr) {
      const ms = id === 0 ? performance.timeOrigin + performance.now() : performance.now();
      view().setBigUint64(timePtr, BigInt(Math.floor(ms * 1e6)), true);
      return OK;
    },
    fd_close() { return OK; },
    fd_prestat_get() { return EBADF; },
    fd_prestat_dir_name() { return EBADF; },
    fd_seek() { return ESPIPE; },
    fd_write(fd, iovs, iovsLen, nwrittenPtr) {
      const d = view(); let n = 0;
      for (let i = 0; i < iovsLen; i++) n += d.getUint32(iovs + i * 8 + 4, true);
      d.setUint32(nwrittenPtr, n, true);
      return OK;
    },
    proc_exit(code) { throw new Error("nyra.wasm thoát (mã " + code + ")"); },
    random_get(ptr, len) {
      const a = new Uint8Array(getMemory().buffer, ptr, len);
      for (let o = 0; o < len; o += 65536) crypto.getRandomValues(a.subarray(o, Math.min(len, o + 65536)));
      return OK;
    },
  };
}
if (typeof module !== "undefined") module.exports = nyraCreateWasi;
