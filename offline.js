// offline.js — nút "Tải để chơi offline": lưu sẵn engine + toàn bộ puzzle + các file giao diện vào bộ nhớ trình duyệt.
const CACHE = "nyra-cache-v1";            // phải trùng với sw.js
// File engine được tải theo URL cố định trong code (nyra-client.js / nyra-worker.js / stockfish-client.js).
// Nếu sau này đổi số ?v= ở các file đó thì sửa lại đây cho khớp.
const ENGINE = ["nyra-worker.js?v=3", "nyra.wasm?v=3", "nyra-wasi.js",
  "stockfish/stockfish-19-lite-single.js", "stockfish/stockfish-19-lite-single.wasm", "manifest.json"];

export const offlineSupported = () => "caches" in window && "serviceWorker" in navigator;

async function listUrls() {
  const urls = new Set(ENGINE.map((u) => new URL(u, location.href).href));
  urls.add(location.href.split("#")[0]);
  // các file giao diện mà trang đã tải (có đủ số ?v= hiện hành)
  for (const e of performance.getEntriesByType("resource")) {
    const u = new URL(e.name);
    if (u.origin === location.origin || u.hostname.startsWith("fonts.g")) urls.add(e.name);
  }
  const base = new URL("puzzles/", location.href);
  const idxRes = await fetch(new URL("index.json", base), { cache: "no-cache" });
  if (!idxRes.ok) throw new Error("index.json " + idxRes.status);
  const idx = await idxRes.json();
  urls.add(new URL("index.json", base).href);
  for (const b of idx.buckets) urls.add(new URL(`${b.file}?v=${idx.version || 1}`, base).href);
  return [...urls];
}

const isOwn = (u) => new URL(u).origin === location.origin;

export async function warmOffline(onProgress) {
  const cache = await caches.open(CACHE);
  const urls = await listUrls();
  let done = 0, failed = 0, i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      try {
        const res = await fetch(url);
        if (res.ok) await cache.put(new Request(url), res); else if (isOwn(url)) failed++;
      } catch (e) { if (isOwn(url)) failed++; }              // font Google tải lỗi không đáng kể (có font dự phòng)
      onProgress && onProgress(++done, urls.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { total: urls.length, failed };
}

export async function offlineStatus() {
  if (!offlineSupported()) return { ready: false, files: 0 };
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  const shards = keys.filter((r) => /\/puzzles\/p-\d+\.txt/.test(r.url)).length;
  const sf = keys.some((r) => r.url.includes("stockfish-19-lite-single.wasm"));
  const ny = keys.some((r) => r.url.includes("nyra.wasm"));
  let mb = null;
  try { const est = await navigator.storage.estimate(); mb = Math.round((est.usage || 0) / 1048576); } catch (e) { /* bỏ qua */ }
  return { ready: shards > 0 && sf && ny, files: keys.length, shards, mb };
}
