// fx.js — hiệu ứng chuyển động: quân cờ trượt, pháo giấy, số đếm lên. Tự tắt khi người dùng bật "giảm chuyển động"
// của hệ điều hành hoặc tắt hiệu ứng trong ⚙.
import { getSettings } from "./settings.js?v=5";

const reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const animOn = () => getSettings().anim !== false && !reducedMotion();

// Quân vừa đi trượt từ ô đi tới ô đến (kỹ thuật FLIP: đặt lệch về ô cũ rồi thả về 0)
export function slideMove(boardEl, from, to, ms = 190) {
  if (!animOn() || !boardEl) return;
  const dstSq = boardEl.querySelector(`[data-sq="${to}"]`), srcSq = boardEl.querySelector(`[data-sq="${from}"]`);
  const piece = dstSq && dstSq.querySelector(".piece");
  if (!piece || !srcSq) return;
  const a = srcSq.getBoundingClientRect(), b = dstSq.getBoundingClientRect();
  const dx = a.left - b.left, dy = a.top - b.top;
  if (!dx && !dy) return;
  piece.style.transition = "none";
  piece.style.transform = `translate(${dx}px, ${dy}px)`;
  piece.style.position = "relative";
  piece.style.zIndex = "6";
  void piece.getBoundingClientRect();                         // ép trình duyệt tính lại bố cục
  piece.style.transition = `transform ${ms}ms cubic-bezier(.2,.85,.25,1)`;
  piece.style.transform = "translate(0, 0)";
  setTimeout(() => { piece.style.transition = ""; piece.style.transform = ""; piece.style.zIndex = ""; piece.style.position = ""; }, ms + 40);
}

// Pháo giấy bằng canvas, tự gỡ sau khi rơi hết
export function confetti(host, { count = 90, ms = 1900 } = {}) {
  if (!animOn() || !host) return;
  const cv = document.createElement("canvas");
  cv.className = "fx-confetti";
  const r = host.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.floor(r.width * dpr)); cv.height = Math.max(1, Math.floor(r.height * dpr));
  host.appendChild(cv);
  const g = cv.getContext("2d");
  const colors = ["#f1d28b", "#d7b66c", "#2fd1c1", "#9b6bff", "#ff8a5b", "#fff6dd"];
  const ps = Array.from({ length: count }, () => ({
    x: cv.width * (0.2 + Math.random() * 0.6), y: cv.height * 0.35,
    vx: (Math.random() - 0.5) * 9 * dpr, vy: (-6 - Math.random() * 8) * dpr,
    w: (5 + Math.random() * 6) * dpr, h: (3 + Math.random() * 4) * dpr,
    a: Math.random() * 6.28, va: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  (function frame(now) {
    const k = (now - t0) / ms;
    g.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps) {
      p.vy += 0.32 * dpr; p.x += p.vx; p.y += p.vy; p.a += p.va; p.vx *= 0.995;
      g.save(); g.translate(p.x, p.y); g.rotate(p.a);
      g.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    if (k < 1) requestAnimationFrame(frame); else cv.remove();
  })(t0);
}

// Số đếm lên mượt (vd. chuỗi ngày 6 → 7)
export function countUp(el, from, to, ms = 700) {
  if (!el) return;
  if (!animOn() || from === to) { el.textContent = to; return; }
  const t0 = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - t0) / ms), e = 1 - (1 - k) ** 3;
    el.textContent = Math.round(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
