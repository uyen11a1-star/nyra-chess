// sound.js — âm thanh riêng của Nyra Chess, tổng hợp hoàn toàn bằng Web Audio (không dùng file âm thanh nào).
//
// Ý tưởng thiết kế ("chuông gỗ"): mỗi nước đi = tiếng "cộp" gỗ ngắn + một nốt chuông rất nhẹ.
// Nốt chuông phụ thuộc ô đến (cột + hàng → thang năm âm Rê trưởng), nên khi chơi, các nước đi
// tự ngân thành giai điệu nhẹ — đây là chữ ký âm thanh của web.
//   • ăn quân     : cộp nặng + tiếng "xoạt" + hai nốt lệch nhau nửa cung (nghe "gắt")
//   • chiếu       : hai nốt chuông bay lên
//   • nhập thành  : hai tiếng cộp liền nhau (vua rồi xe)
//   • phong cấp   : dải nốt đi lên lấp lánh
//   • puzzle      : đúng = chuông quãng năm; sai = "bộp" trầm; giải xong = dải nốt đi lên; chuỗi ngày = kèn chuông dài theo chuỗi
import { getSettings, onSettingsChange } from "./settings.js?v=4";

const D4 = 293.66;                     // Rê4
const PENT = [0, 2, 4, 7, 9];          // thang năm âm trưởng
const note = (deg, base = D4) => base * 2 ** ((PENT[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5)) / 12);
const semis = (f, n) => f * 2 ** (n / 12);

const GAIN = 1.4;                      // hệ số âm lượng tổng (đã chỉnh theo kết quả đo đỉnh sóng)
let ctx = null, master = null, enabled = true, volume = 0.7, noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = makeChain(ctx);
  return ctx;
}
// dây chuyền master: gain → cắt mềm kiểu tanh (chống vỡ tiếng khi nhiều âm chồng, không làm âm đầu tiên bị bóp nhỏ) → loa
let softCurve = null;
function makeChain(c) {
  const g = c.createGain();
  g.gain.value = volume * volume * GAIN;
  if (!softCurve) {
    softCurve = new Float32Array(2048);
    const k = 1.3;
    for (let i = 0; i < softCurve.length; i++) { const x = (i / (softCurve.length - 1)) * 2 - 1; softCurve[i] = Math.tanh(k * x) / Math.tanh(k); }
  }
  const ws = c.createWaveShaper();
  ws.curve = softCurve; ws.oversample = "2x";
  g.connect(ws); ws.connect(c.destination);
  return g;
}
function getNoise(c) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.25);
  const b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  let s = 22222;                                    // nhiễu giả ngẫu nhiên cố định → âm thanh luôn giống nhau
  for (let i = 0; i < len; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
  return (noiseBuf = b);
}

// ---------------------------------------------------------------- khối âm cơ bản
function tone(c, dest, { f, to, type = "sine", t = 0, dur = 0.2, gain = 0.2, attack = 0.003 }) {
  const o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + t;
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + dur + 0.03);
}
function noise(c, dest, { t = 0, dur = 0.05, gain = 0.2, type = "bandpass", f = 1800, q = 1.2 }) {
  const s = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain(), t0 = c.currentTime + t;
  s.buffer = getNoise(c);
  flt.type = type; flt.frequency.value = f; flt.Q.value = q;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(flt); flt.connect(g); g.connect(dest);
  s.start(t0); s.stop(t0 + dur + 0.02);
}
// chuông: nốt gốc + hai họa âm lệch (tỉ lệ kiểu kim loại) → nghe như chuông gõ nhỏ
function bell(c, dest, f, { t = 0, dur = 0.28, gain = 0.12 } = {}) {
  tone(c, dest, { f, t, dur, gain });
  tone(c, dest, { f: f * 2.01, t, dur: dur * 0.45, gain: gain * 0.42 });
  tone(c, dest, { f: f * 3.0, t, dur: dur * 0.25, gain: gain * 0.2 });
}

// ---------------------------------------------------------------- các âm thanh (nhận ctx + đích để dùng được cả khi render offline)
const SOUNDS = {
  // tiếng cộp gỗ: va chạm + thân trầm
  tok(c, d, { f = 880, gain = 1, t = 0 } = {}) {
    noise(c, d, { t, dur: 0.035, gain: 0.34 * gain, f: 2100, q: 1.3 });
    tone(c, d, { t, f: 190, to: 88, dur: 0.075, gain: 0.46 * gain, attack: 0.002 });
    bell(c, d, f, { t, dur: 0.3, gain: 0.1 * gain });
  },
  capture(c, d, { f = 880 } = {}) {
    noise(c, d, { dur: 0.07, gain: 0.34, type: "lowpass", f: 1500, q: 0.7 });
    noise(c, d, { dur: 0.03, gain: 0.3, f: 2600, q: 1.5 });
    tone(c, d, { f: 150, to: 52, dur: 0.12, gain: 0.58, attack: 0.002 });
    bell(c, d, f * 0.75, { dur: 0.26, gain: 0.1 });
    bell(c, d, f * 0.75 * 1.0595, { t: 0.012, dur: 0.2, gain: 0.07 });       // nửa cung lệch → "gắt"
    SOUNDS.tok(c, d, { f: f * 0.5, gain: 0.5 });
    },
  check(c, d, { f = 880 } = {}) {
    bell(c, d, f * 2, { t: 0.07, dur: 0.34, gain: 0.12 });
    bell(c, d, f * 3, { t: 0.17, dur: 0.4, gain: 0.1 });
  },
  castle(c, d, { f = 880 } = {}) {
    SOUNDS.tok(c, d, { f });
    SOUNDS.tok(c, d, { f: f * 1.5, gain: 0.85, t: 0.11 });
  },
  promote(c, d, { f = 880 } = {}) {
    for (let i = 0; i < 5; i++) bell(c, d, note(4 + i, D4), { t: 0.06 * i, dur: 0.3, gain: 0.1 });
    tone(c, d, { f: f * 4, t: 0.3, dur: 0.35, gain: 0.05 });
  },
  // ---- puzzle
  pzOk(c, d) {                       // đúng nước: chuông quãng năm
    bell(c, d, note(5, D4), { dur: 0.3, gain: 0.11 });
    bell(c, d, note(8, D4), { t: 0.07, dur: 0.38, gain: 0.1 });
  },
  pzBad(c, d) {                      // sai: "bộp" trầm hai nấc đi xuống
    tone(c, d, { f: 220, to: 120, type: "triangle", dur: 0.18, gain: 0.3 });
    tone(c, d, { f: 165, to: 82, type: "triangle", t: 0.13, dur: 0.26, gain: 0.3 });
    noise(c, d, { dur: 0.05, gain: 0.12, type: "lowpass", f: 700, q: 0.8 });
  },
  pzSolved(c, d) {                   // giải xong: dải nốt đi lên + lấp lánh
    for (let i = 0; i < 6; i++) bell(c, d, note(5 + i, D4), { t: 0.075 * i, dur: 0.42, gain: 0.11 });
    tone(c, d, { f: note(11, D4), t: 0.45, dur: 0.7, gain: 0.07 });
    tone(c, d, { f: note(11, D4) * 2, t: 0.5, dur: 0.6, gain: 0.035 });
  },
  pzStreak(c, d, { n = 1 } = {}) {   // chuỗi ngày: số nốt tăng theo chuỗi, có hợp âm kết
    const steps = Math.min(9, 3 + Math.floor(n / 2));
    for (let i = 0; i < steps; i++) bell(c, d, note(3 + i, D4), { t: 0.07 * i, dur: 0.45, gain: 0.1 });
    const t = 0.07 * steps + 0.05;
    [0, 4, 7].forEach((s) => tone(c, d, { f: semis(note(3 + steps, D4), s - 12), t, dur: 0.9, gain: 0.07 }));
    tone(c, d, { f: note(3 + steps, D4) * 2, t: t + 0.05, dur: 0.8, gain: 0.04 });
  },
  // ---- hết ván
  win(c, d) { [0, 4, 7, 12].forEach((s, i) => bell(c, d, semis(D4 * 2, s), { t: 0.11 * i, dur: 0.6, gain: 0.12 })); },
  lose(c, d) {
    tone(c, d, { f: semis(D4, 3), to: semis(D4, 2), type: "triangle", dur: 0.5, gain: 0.22 });
    tone(c, d, { f: semis(D4, -4), to: semis(D4, -5), type: "triangle", t: 0.22, dur: 0.7, gain: 0.24 });
  },
  draw(c, d) {
    bell(c, d, D4 * 2, { dur: 0.5, gain: 0.1 });
    bell(c, d, D4 * 2 * 1.5, { t: 0.14, dur: 0.6, gain: 0.1 });
  },
};
// ---------------------------------------------------------------- API
function squareFreq(sq) {
  if (!sq || sq.length < 2) return 880;
  const file = sq.charCodeAt(0) - 97, rank = Number(sq[1]) - 1;
  return note(3 + ((file * 3 + rank) % 8), D4);   // 8 nốt từ La4 tới Rê6: mỗi ô một nốt
}
function play(name, opts) {
  if (!enabled || volume <= 0 || document.hidden) return;
  const c = ensure();
  if (!c) return;
  if (c.state === "suspended") c.resume();
  SOUNDS[name](c, master, opts);
}

export const sfx = {
  // gọi từ mọi nơi có nước đi: mv là đối tượng nước đi của chess.js
  move(mv) {
    if (!mv) return;
    const f = squareFreq(mv.to), san = mv.san || "";
    if (mv.promotion) play("promote", { f });
    else if (mv.flags && /[kq]/.test(mv.flags)) play("castle", { f });
    else if (mv.captured || (mv.flags && /[ce]/.test(mv.flags))) play("capture", { f });
    else play("tok", { f });
    if (san.endsWith("+") || san.endsWith("#")) play("check", { f });
  },
  end(kind) { play(kind === "win" ? "win" : kind === "lose" ? "lose" : "draw"); },
  pz(kind, n) {
    if (kind === "ok") play("pzOk");
    else if (kind === "bad") play("pzBad");
    else if (kind === "solved") play("pzSolved");
    else if (kind === "streak") play("pzStreak", { n });
  },
  unlock() { const c = ensure(); if (c && c.state === "suspended") c.resume(); },
  // dùng cho kiểm thử/"nghe thử": dựng âm vào một OfflineAudioContext
  _render(name, opts, seconds = 1.5, sr = 22050) {
    const oc = new OfflineAudioContext(1, Math.floor(seconds * sr), sr);
    const chain = makeChain(oc);
    SOUNDS[name](oc, chain, opts);
    return oc.startRendering();
  },
  _names: Object.keys(SOUNDS),
};

function applySettings(cfg) {
  enabled = cfg.sound !== false;
  volume = Math.min(1, Math.max(0, (cfg.volume ?? 70) / 100));
  if (master) master.gain.value = volume * volume * GAIN;
}
applySettings(getSettings());
onSettingsChange(applySettings);
// nút "Nghe thử" trong ⚙: nước đi thường → ăn quân → giải xong
window.addEventListener("nyra-sfx-test", () => {
  sfx.unlock();
  const play1 = (mv, wait) => setTimeout(() => sfx.move(mv), wait);
  play1({ to: "e4", san: "e4", flags: "b" }, 0);
  play1({ to: "d5", san: "exd5", flags: "c", captured: "p" }, 450);
  setTimeout(() => sfx.pz("solved"), 1000);
});
// trình duyệt chỉ cho phát âm sau khi người dùng chạm/bấm lần đầu
["pointerdown", "touchstart", "keydown"].forEach((ev) => window.addEventListener(ev, () => sfx.unlock(), { once: true, passive: true }));
