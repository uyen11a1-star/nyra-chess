// sw.js — chạy offline + nhớ file lâu hơn.
// Chiến lược:
//  • Trang HTML và puzzles/index.json: mạng trước (luôn lấy bản mới khi có mạng), mất mạng thì dùng bản đã lưu.
//  • File có ?v=… (JS, CSS, wasm, dữ liệu puzzle): lưu rồi dùng luôn — vì đổi nội dung thì số v đổi theo.
//  • File còn lại (Stockfish, icon, manifest, font): trả bản đã lưu ngay, đồng thời tải bản mới ở nền.
// Khi cần xóa sạch bộ nhớ cũ, đổi số trong CACHE.
const CACHE = "nyra-cache-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("nyra-cache-") && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const okToStore = (res) => res && (res.ok || res.type === "opaque");

async function networkFirst(req, ms) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then((res) => { if (okToStore(res)) cache.put(req, res.clone()); return res; });
  try {
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  } catch (e) {
    const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true })) || (await cache.match("./index.html"));
    if (hit) return hit;
    return net;                                           // chưa có bản lưu: đành chờ mạng
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (okToStore(res)) cache.put(req, res.clone());
  return res;
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => { if (okToStore(res)) cache.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) return hit;
  return (await refresh) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  const gfont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!same && !gfont) return;
  if (gfont) { e.respondWith(url.hostname === "fonts.gstatic.com" ? cacheFirst(req) : staleWhileRevalidate(req)); return; }
  if (req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/")) { e.respondWith(networkFirst(req, 3500)); return; }
  if (url.pathname.endsWith("/puzzles/index.json")) { e.respondWith(networkFirst(req, 2500)); return; }
  if (url.searchParams.has("v")) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(staleWhileRevalidate(req));
});
