// coach.js — Nyro, linh vật của Nyra: chọn biểu cảm + lời nhận xét cho từng nước.
const MOOD = {
  brilliant: "wow", great: "wow", best: "happy", excellent: "happy",
  good: "happy", book: "idle", inaccuracy: "think", mistake: "sad", blunder: "sad",
};
const LINES = {
  brilliant: ["Nước này đỉnh luôn! Nyro phải vỗ tay!", "Hy sinh mà vẫn ngon, quá đẹp!"],
  great: ["Hay lắm, nước khó mà tìm ra được!", "Ồ, nước này sắc đó nha!"],
  best: ["Chuẩn bài, trùng ý Nyra luôn!", "Nước tốt nhất rồi, giữ phong độ nha!"],
  excellent: ["Rất tốt, gần như hoàn hảo!", "Đi vậy là chắc tay rồi."],
  good: ["Ổn áp, đi vậy được rồi.", "Không tệ, tiếp tục nào!"],
  book: ["Nước khai cuộc quen thuộc, sách dạy vậy đó.", "Khai cuộc chuẩn sách."],
  inaccuracy: ["Hơi lệch xíu thôi.", "Chưa chuẩn lắm, nhưng chưa sao đâu."],
  mistake: ["Ối, nước này hơi đau.", "Tiếc ghê, chỗ này có nước ngon hơn."],
  blunder: ["Úi, nặng rồi! Đừng buồn nha.", "Trời ơi, ván cờ ai chẳng có lúc lỡ tay."],
};
const IDLE = "Chọn một nước đi để Nyro nhận xét nha!";

export function coachLine(rv, ply) {
  if (!rv) return { mood: "idle", text: IDLE };
  const arr = LINES[rv.cls] || LINES.good;
  let text = arr[ply % arr.length];
  const bad = rv.cls === "inaccuracy" || rv.cls === "mistake" || rv.cls === "blunder";
  if (bad && rv.bestSan && rv.bestUci !== rv.uci) text += ` Thử ${rv.bestSan} xem, ngon hơn đó!`;
  return { mood: MOOD[rv.cls] || "idle", text };
}

export function buildCoach() {
  const el = document.createElement("div");
  el.className = "nyro-coach";
  el.innerHTML = `<img class="nyro-img" alt="Nyro" width="64" src="mascot/nyro-idle.png"><div class="nyro-bubble"></div>`;
  return el;
}

export function setCoach(el, { mood, text }) {
  if (!el) return;
  const img = el.querySelector(".nyro-img");
  const src = `mascot/nyro-${mood}.png`;
  if (img && !img.src.endsWith(src)) img.src = src;
  el.querySelector(".nyro-bubble").textContent = text;
  el.dataset.mood = mood;
}
