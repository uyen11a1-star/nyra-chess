// coach.js — Nyro: đọc thế cờ thật rồi tự ghép lời nhận xét (VI/EN), không lặp câu.
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ATT = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 50 };
const NAME = {
  vi: { p: "Tốt", n: "Mã", b: "Tượng", r: "Xe", q: "Hậu", k: "Vua" },
  en: { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" },
};
const BAD = ["inaccuracy", "mistake", "blunder"];
const MOOD = { brilliant: "wow", great: "wow", best: "happy", excellent: "happy", good: "happy", book: "idle", inaccuracy: "think", mistake: "sad", blunder: "sad" };

// ---------- đọc thế cờ ----------
function analyzeMove(Chess, fen, uci) {
  const c = new Chess(fen);
  const from = uci.slice(0, 2), to = uci.slice(2, 4), promotion = uci[4];
  let mv;
  try { mv = c.move({ from, to, promotion }); } catch (e) { return null; }
  if (!mv) return null;
  const me = mv.color, opp = me === "w" ? "b" : "w";
  const f = {
    piece: mv.piece, from, to, me, cap: mv.captured || null, promo: mv.promotion || null,
    ks: mv.flags.includes("k"), qs: mv.flags.includes("q"),
    check: c.isCheck(), mate: c.isCheckmate(),
  };
  f.capFree = !!f.cap && c.attackers(to, opp).length === 0;
  f.develop = (mv.piece === "n" || mv.piece === "b") && from[1] === (me === "w" ? "1" : "8");
  f.center = mv.piece === "p" && ["e4", "d4", "e5", "d5"].includes(to);
  if (c.isGameOver()) return f;
  // quân vừa đi có bị bỏ hở không
  if (mv.piece !== "k") {
    const A = c.attackers(to, opp);
    if (A.length) {
      const D = c.attackers(to, me);
      const minA = Math.min(...A.map((s) => ATT[c.get(s).type] || 99));
      const pv = VAL[mv.piece];
      if ((D.length === 0 && pv >= 1) || (D.length > 0 && minA < pv && pv >= 3)) {
        const s = A.find((q) => (ATT[c.get(q).type] || 99) === minA);
        f.hang = { att: c.get(s).type, undef: D.length === 0 };
      }
    }
  }
  // quân nào của mình có thể bị ăn lời nhất
  let best = null;
  for (const m of c.moves({ verbose: true })) {
    const c2 = new Chess(c.fen());
    try { c2.move({ from: m.from, to: m.to, promotion: m.promotion }); } catch (e) { continue; }
    if (c2.isCheckmate()) f.mateIn1 = m.san;
    if (!m.captured) continue;
    const rec = c2.attackers(m.to, me).length > 0;
    const net = VAL[m.captured] - (rec ? ATT[m.piece] === 50 ? 0 : VAL[m.piece] : 0);
    if (!best || net > best.net) best = { net, cap: m.captured, sq: m.to, by: m.piece };
  }
  if (best && best.net >= 2) f.threat = best;
  return f;
}

// ---------- kho câu ----------
const L = {
  vi: {
    head: {
      brilliant: [(d) => `${d.san} — nước thiên tài!`, (d) => `Wow, ${d.san} quá đẹp luôn!`, (d) => `${d.san}! Nước này làm Nyro nổi da gà.`, (d) => `Phải công nhận ${d.san} cực kỳ sáng tạo.`, (d) => `Ồ ${d.san}! Ít người nhìn ra nước này lắm.`, (d) => `${d.san} — đúng kiểu nước khiến đối thủ toát mồ hôi.`],
      great: [(d) => `${d.san} rất hay!`, (d) => `Mắt tinh đó, ${d.san} là nước khó tìm.`, (d) => `${d.san} — ${d.side} chọn chuẩn nước then chốt rồi.`, (d) => `Hay lắm, ${d.san} giữ ván cờ trong tay.`, (d) => `Ồ, ${d.san} sắc đó nha!`, (d) => `Nước ${d.san} này không dễ thấy đâu.`],
      best: [(d) => `${d.san} là nước tốt nhất.`, (d) => `Trùng ý Nyra luôn, ${d.san}!`, (d) => `${d.san} — chuẩn bài.`, (d) => `Quá chuẩn, ${d.san} đúng là lựa chọn số một.`, (d) => `${d.side} chọn ${d.san}, khỏi chê.`, (d) => `${d.san}, đúng nước Nyro định gợi ý.`],
      excellent: [(d) => `${d.san} rất tốt.`, (d) => `${d.san} — gần như hoàn hảo.`, (d) => `Chắc tay đó, ${d.san}.`, (d) => `${d.san} là lựa chọn đáng tin.`, (d) => `${d.san} gần ngang nước tốt nhất rồi.`, (d) => `Đi ${d.san} là chuẩn.`],
      good: [(d) => `${d.san} ổn áp.`, (d) => `${d.san} — đi vậy được rồi.`, (d) => `Không tệ, ${d.san}.`, (d) => `${d.san} là nước chơi được.`, (d) => `${d.san}, tạm ổn nhưng còn nước hay hơn.`, (d) => `Thế cờ vẫn ổn sau ${d.san}.`],
      book: [(d) => `${d.san} là nước khai cuộc quen thuộc.`, (d) => `${d.san} — đúng sách khai cuộc.`, (d) => `Khai cuộc chuẩn, ${d.san}.`, (d) => `${d.san}, nhiều cao thủ cũng chơi nước này.`, (d) => `Sách có ghi ${d.san} đó.`, (d) => `${d.san} nằm trong lý thuyết khai cuộc.`],
      inaccuracy: [(d) => `${d.san} hơi lệch một chút.`, (d) => `Chưa chuẩn lắm, ${d.san}.`, (d) => `Hừm, ${d.san} chưa phải nước hay nhất.`, (d) => `${d.san} hơi thiếu chính xác.`, (d) => `${d.side} có nước tốt hơn ${d.san} đó.`, (d) => `${d.san} không sai nhiều, nhưng có thể hay hơn.`],
      mistake: [(d) => `Ối, ${d.san} là một sai lầm.`, (d) => `${d.san} hơi đau đó.`, (d) => `Tiếc ghê, ${d.san} làm thế cờ xấu đi.`, (d) => `${d.san} khiến ${d.side} bị thiệt thế cờ.`, (d) => `Úi, ${d.san} chưa ổn rồi.`, (d) => `${d.san} — chỗ này lỡ tay rồi.`],
      blunder: [(d) => `Úi, ${d.san} là sai lầm nặng!`, (d) => `${d.san} — nước này trả giá đắt đó.`, (d) => `Khoan đã, ${d.san} làm hỏng cả thế cờ!`, (d) => `Trời ơi ${d.san}, ván cờ ai chẳng có lúc lỡ tay.`, (d) => `${d.san} là bước ngoặt xấu rồi.`, (d) => `Ôi không, ${d.san}...`],
    },
    mate: [(d) => `Chiếu hết luôn, ván cờ kết thúc!`, (d) => `Vua không còn đường thoát — chiếu hết!`, (d) => `${d.P} chiếu hết, gọn gàng!`],
    sac: [(d) => `Hy sinh ${d.P} để lấy thế tốt hơn, can đảm thật.`, (d) => `Dâng ${d.P} mà vẫn có lợi, tính toán sâu đó.`, (d) => `Bỏ ${d.P} nhưng bù lại bằng thế trận.`],
    promo: [(d) => `Tốt lên hàng cuối, phong thành ${d.PR}!`, (d) => `Phong cấp thành ${d.PR}, lực lượng mạnh thêm hẳn.`, (d) => `Có thêm ${d.PR} rồi, mạnh lên nhiều.`],
    cap: [(d) => `${d.P} ăn ${d.C} ở ${d.To}.`, (d) => `Thu về ${d.C} ở ${d.To} bằng ${d.P}.`, (d) => `${d.P} bắt ${d.C} tại ${d.To}.`],
    capFree: [(d) => `${d.P} ăn ${d.C} ở ${d.To} mà không bị ăn lại, lời trọn.`, (d) => `Ăn ${d.C} miễn phí tại ${d.To}.`, (d) => `${d.C} ở ${d.To} không ai bảo vệ nên bị ăn gọn.`],
    check: [(d) => `Chiếu! ${d.P} làm đối thủ phải lo cho Vua.`, (d) => `${d.P} chiếu vua, đối thủ phải trả lời ngay.`, (d) => `Chiếu từ ${d.To}, giữ thế chủ động.`, (d) => `Có chiếu nên đối thủ khó rảnh tay.`],
    castle: [(d) => `Nhập thành đưa Vua về chỗ an toàn và kích hoạt Xe.`, (d) => `Nhập thành — Vua yên vị, Xe vào cuộc.`, (d) => `Vua nhập thành, bớt lo nhiều thứ.`],
    develop: [(d) => `${d.P} vào trận, quân hoạt động tốt hơn hẳn.`, (d) => `Mang ${d.P} ra khỏi hàng cuối, hợp lý đó.`, (d) => `Đưa ${d.P} ra chơi, quân đang hoạt động hơn.`, (d) => `${d.P} rời hàng cuối để vào trận.`, (d) => `Phát triển ${d.P} sớm là ý hay.`],
    center: [(d) => `Chiếm trung tâm ở ${d.To}, đất vàng đó.`, (d) => `Tốt vào ${d.To} giữ trung tâm vững.`, (d) => `Tốt ${d.To} kiểm soát trung tâm.`],
    quiet: [(d) => `Thế cờ chắc, không có gì phải lo.`, (d) => `Một nước đi điềm tĩnh, đúng kiểu cờ vị trí.`, (d) => `Thế cờ vẫn chắc chắn.`, (d) => `Không có gì lớn, nhưng nước đi hợp lý.`, (d) => `Giữ thế trận gọn gàng.`, (d) => `${d.P} đi ${d.To} là lựa chọn hợp lý.`],
    book: [(d) => `Nhiều ván đấu đã đi theo hướng này.`, (d) => `Đây là đường quen thuộc của lý thuyết.`, (d) => `Cứ đi theo sách là an toàn.`],
    hang: [(d) => `${d.P} ở ${d.To} đang bị ${d.A} đe dọa${d.U ? " mà không ai bảo vệ" : ""}.`, (d) => `${d.A} có thể ăn ${d.P} tại ${d.To}${d.U ? ", và không có quân nào đỡ" : ""}.`, (d) => `Đi ${d.To} xong ${d.P} thành mục tiêu của ${d.A}${d.U ? " mà chẳng ai che" : ""}.`],
    threat: [(d) => `${d.C} ở ${d.TS} vẫn có thể bị ${d.TA} ăn.`, (d) => `Chưa lo cho ${d.C} ở ${d.TS}, ${d.TA} bắt được đó.`, (d) => `${d.C} ở ${d.TS} đang hở, ${d.TA} có thể ăn.`],
    quietBad: [(d) => `Nước này làm thế cờ xấu đi chút.`, (d) => `Đối thủ được thế tốt hơn sau nước này.`, (d) => `Thế cờ kém đi so với nước đúng.`],
    bMate: [(d) => `Có chiếu hết đó: ${d.best}.`, (d) => `${d.best} chiếu hết luôn, bỏ lỡ tiếc quá!`, (d) => `Nước thắng ngay là ${d.best}.`],
    bCapFree: [(d) => `${d.best} ăn ${d.BC} mà không mất gì.`, (d) => `Lẽ ra ${d.best}, lấy ${d.BC} miễn phí.`, (d) => `${d.BC} đang bị bỏ hở, ${d.best} ăn được ngay.`],
    bCap: [(d) => `${d.best} ăn ${d.BC} sẽ tốt hơn.`, (d) => `Thử ${d.best}, thu được ${d.BC}.`, (d) => `Nước hay hơn là ${d.best}, bắt ${d.BC}.`],
    bCheck: [(d) => `${d.best} chiếu vua sẽ mạnh hơn.`, (d) => `Thử ${d.best}, có chiếu giữ thế chủ động.`, (d) => `${d.best} có chiếu, ép đối thủ phải đỡ.`],
    bCastle: [(d) => `Nhập thành (${d.best}) sẽ an toàn hơn.`, (d) => `Nên ${d.best}, đưa Vua về chỗ yên ổn.`, (d) => `${d.best} là nước hợp hơn, Vua cần an toàn.`],
    bPromo: [(d) => `${d.best} phong cấp ngay sẽ mạnh hơn.`, (d) => `Nên ${d.best}, lên cấp luôn!`, (d) => `Phong cấp bằng ${d.best} lời hơn nhiều.`],
    bAny: [(d) => `Nước tốt hơn là ${d.best}.`, (d) => `Thử ${d.best} xem, ngon hơn đó.`, (d) => `Nyro thấy ${d.best} giữ thế cờ tốt hơn.`, (d) => `${d.best} mới là hướng đi đúng.`],
    loss: [(d) => `Mất khoảng ${d.loss}% cơ hội thắng.`, (d) => `Cơ hội thắng tụt ${d.loss}% sau nước này.`, (d) => `Tính ra lỗ ${d.loss}% khả năng thắng.`],
    ev: {
      lost: [(d) => `Thế cờ giờ gần như thua rồi.`, (d) => `${d.side} đang ở thế rất khó.`, (d) => `Giờ ${d.side} phải chống đỡ vất vả.`],
      worse: [(d) => `${d.side} đang kém thế một chút.`, (d) => `Thế cờ nghiêng về đối thủ.`, (d) => `Giờ ${d.side} là bên chịu áp lực.`],
      equal: [(d) => `Thế cờ vẫn cân bằng.`, (d) => `Hai bên ngang ngửa.`, (d) => `Chưa bên nào lấn át.`],
      better: [(d) => `${d.side} đang nhỉnh hơn.`, (d) => `Thế cờ hơi nghiêng về ${d.side}.`, (d) => `${d.side} nắm lợi thế nhẹ.`],
      winning: [(d) => `${d.side} đang thắng thế rõ ràng.`, (d) => `Thế cờ rất có lợi cho ${d.side}.`, (d) => `Giờ ${d.side} gần như nắm chắc ván này.`],
      drop: [(d) => `${d.side} vừa làm tuột lợi thế.`, (d) => `Đang ngon mà để vuột mất lợi thế rồi.`, (d) => `Lợi thế của ${d.side} bay mất.`],
      comeback: [(d) => `${d.side} vừa lội ngược dòng!`, (d) => `Đang khó mà gỡ lại được, hay đó.`, (d) => `Thế cờ xoay chiều có lợi cho ${d.side}.`],
    },
    ij: {
      pos: ["Hay!", "Tuyệt!", "Đẹp đó!", "Ngon!", "Chuẩn rồi!", "Được lắm!", "Ồ!", "Khá lắm!"],
      neu: ["Ừm,", "Để xem nào...", "Okay,", "Hmm,", "Cũng được,", "À,", "Nhìn qua thì", "Ừ,"],
      neg: ["Ối!", "Tiếc quá!", "Úi!", "Hừm...", "Khoan đã!", "Ôi không!", "Chà...", "Eo ơi,"],
    },
    mateThreat: [(d) => `Đối thủ có thể chiếu hết ngay bằng ${d.MS}!`, (d) => `Nguy hiểm! ${d.MS} sẽ là chiếu hết.`, (d) => `${d.MS} của đối thủ sẽ chiếu hết đó.`],
    quietMist: [(d) => `Thế cờ xấu đi nhiều sau nước này.`, (d) => `Đối thủ có cơ hội lớn sau nước này.`, (d) => `Nước này mở ra khó khăn lớn cho ${d.side}.`],
    capBad: [(d) => `Ăn ${d.C} ở ${d.To} trông hấp dẫn, nhưng còn nước hay hơn.`, (d) => `${d.P} ăn ${d.C} nghe ngon, tiếc là chưa phải hay nhất.`, (d) => `Thu ${d.C} ở ${d.To} thì được, nhưng thế cờ lại kém đi.`],
    side: { w: "Trắng", b: "Đen" },
  },
  en: {
    head: {
      brilliant: [(d) => `${d.san} — brilliant!`, (d) => `Wow, ${d.san} is gorgeous!`, (d) => `${d.san}! That gave Nyro goosebumps.`, (d) => `${d.san} is seriously creative.`, (d) => `Oh ${d.san}! Few people would find that.`, (d) => `${d.san} — the kind of move that makes opponents sweat.`],
      great: [(d) => `${d.san} is great!`, (d) => `Sharp eyes, ${d.san} is hard to find.`, (d) => `${d.san} — ${d.side} found the key move.`, (d) => `Nice, ${d.san} keeps the game in hand.`, (d) => `Ooh, ${d.san} is sharp!`, (d) => `${d.san} isn't easy to spot.`],
      best: [(d) => `${d.san} is the best move.`, (d) => `Same as Nyra, ${d.san}!`, (d) => `${d.san} — textbook.`, (d) => `Spot on, ${d.san} is the top choice.`, (d) => `${d.side} plays ${d.san}, no complaints.`, (d) => `${d.san}, exactly what Nyro would suggest.`],
      excellent: [(d) => `${d.san} is excellent.`, (d) => `${d.san} — nearly perfect.`, (d) => `Steady hands, ${d.san}.`, (d) => `${d.san} is a reliable choice.`, (d) => `${d.san} is almost as good as the best.`, (d) => `${d.san} is solid.`],
      good: [(d) => `${d.san} is fine.`, (d) => `${d.san} — that works.`, (d) => `Not bad, ${d.san}.`, (d) => `${d.san} is playable.`, (d) => `${d.san}, okay but there was better.`, (d) => `Still fine after ${d.san}.`],
      book: [(d) => `${d.san} is a familiar opening move.`, (d) => `${d.san} — straight from the opening book.`, (d) => `Good opening, ${d.san}.`, (d) => `${d.san}, strong players use it too.`, (d) => `The book has ${d.san}.`, (d) => `${d.san} is part of opening theory.`],
      inaccuracy: [(d) => `${d.san} is slightly off.`, (d) => `Not quite, ${d.san}.`, (d) => `Hmm, ${d.san} isn't the best.`, (d) => `${d.san} is a bit inaccurate.`, (d) => `${d.side} had better than ${d.san}.`, (d) => `${d.san} isn't terrible, but it could be sharper.`],
      mistake: [(d) => `Oof, ${d.san} is a mistake.`, (d) => `${d.san} hurts a bit.`, (d) => `Too bad, ${d.san} worsens the position.`, (d) => `${d.san} leaves ${d.side} with a worse position.`, (d) => `Yikes, ${d.san} isn't right.`, (d) => `${d.san} — slipped up here.`],
      blunder: [(d) => `Yikes, ${d.san} is a blunder!`, (d) => `${d.san} — that costs a lot.`, (d) => `Hold on, ${d.san} ruins the position!`, (d) => `Oh no ${d.san}, everyone slips sometimes.`, (d) => `${d.san} is a bad turning point.`, (d) => `Ouch, ${d.san}...`],
    },
    mate: [(d) => `Checkmate, game over!`, (d) => `No escape for the king — checkmate!`, (d) => `${d.P} delivers mate, clean!`],
    sac: [(d) => `Sacrificing the ${d.P} for a better position, bold.`, (d) => `Giving up the ${d.P} but it pays off, deep calculation.`, (d) => `The ${d.P} goes, but the position makes up for it.`],
    promo: [(d) => `Pawn reaches the end and becomes a ${d.PR}!`, (d) => `Promoting to a ${d.PR}, much stronger now.`, (d) => `A new ${d.PR} on the board.`],
    cap: [(d) => `${d.P} takes the ${d.C} on ${d.To}.`, (d) => `Collects the ${d.C} on ${d.To} with the ${d.P}.`, (d) => `${d.P} captures the ${d.C} at ${d.To}.`],
    capFree: [(d) => `${d.P} takes the ${d.C} on ${d.To} with no recapture, free material.`, (d) => `A free ${d.C} on ${d.To}.`, (d) => `The ${d.C} on ${d.To} was unprotected, so it falls.`],
    check: [(d) => `Check! The ${d.P} makes the opponent worry about the king.`, (d) => `${d.P} gives check, the opponent must respond.`, (d) => `Check from ${d.To}, keeping the initiative.`, (d) => `With check, the opponent has no spare time.`],
    castle: [(d) => `Castling tucks the king away and activates the rook.`, (d) => `Castled — king safe, rook in play.`, (d) => `King castles, one less worry.`],
    develop: [(d) => `The ${d.P} enters the game, pieces get busier.`, (d) => `Bringing the ${d.P} off the back rank, sensible.`, (d) => `Developing the ${d.P}, pieces get more active.`, (d) => `The ${d.P} leaves the back rank to join the game.`, (d) => `Early development of the ${d.P}, nice idea.`],
    center: [(d) => `Taking the center on ${d.To}, prime real estate.`, (d) => `Pawn to ${d.To} holds the center.`, (d) => `The ${d.To} pawn controls the center.`],
    quiet: [(d) => `Solid position, nothing to worry about.`, (d) => `A calm move, very positional.`, (d) => `The position stays solid.`, (d) => `Nothing flashy, but a sensible move.`, (d) => `Keeps the setup tidy.`, (d) => `${d.P} to ${d.To} is a reasonable choice.`],
    book: [(d) => `Many games have followed this path.`, (d) => `A well-known line of theory.`, (d) => `Following the book is safe.`],
    hang: [(d) => `The ${d.P} on ${d.To} is attacked by a ${d.A}${d.U ? " and nothing protects it" : ""}.`, (d) => `A ${d.A} can take the ${d.P} on ${d.To}${d.U ? ", and it has no defender" : ""}.`, (d) => `After ${d.To}, the ${d.P} becomes a target for the ${d.A}${d.U ? " with no cover" : ""}.`],
    threat: [(d) => `The ${d.C} on ${d.TS} can still be taken by a ${d.TA}.`, (d) => `Nobody looked after the ${d.C} on ${d.TS}, a ${d.TA} can grab it.`, (d) => `The ${d.C} on ${d.TS} is loose, a ${d.TA} can capture it.`],
    quietBad: [(d) => `This makes the position a bit worse.`, (d) => `The opponent gets the better position after this.`, (d) => `The position is worse than after the right move.`],
    bMate: [(d) => `There was a checkmate: ${d.best}.`, (d) => `${d.best} was mate, such a pity to miss!`, (d) => `The winning move was ${d.best}.`],
    bCapFree: [(d) => `${d.best} wins the ${d.BC} for nothing.`, (d) => `${d.best} was available, a free ${d.BC}.`, (d) => `The ${d.BC} was hanging, ${d.best} takes it right away.`],
    bCap: [(d) => `${d.best} taking the ${d.BC} is better.`, (d) => `Try ${d.best}, it wins the ${d.BC}.`, (d) => `The stronger move is ${d.best}, capturing the ${d.BC}.`],
    bCheck: [(d) => `${d.best} with check would be stronger.`, (d) => `Try ${d.best}, check keeps the initiative.`, (d) => `${d.best} gives check and forces a reply.`],
    bCastle: [(d) => `Castling (${d.best}) would be safer.`, (d) => `${d.best} was better, get the king to safety.`, (d) => `${d.best} fits better, the king needs shelter.`],
    bPromo: [(d) => `${d.best} promoting right away is stronger.`, (d) => `Better to play ${d.best} and promote!`, (d) => `Promoting with ${d.best} is far better.`],
    bAny: [(d) => `A better move was ${d.best}.`, (d) => `Try ${d.best}, it's nicer.`, (d) => `Nyro thinks ${d.best} keeps the position healthier.`, (d) => `${d.best} was the right idea.`],
    loss: [(d) => `That costs about ${d.loss}% winning chances.`, (d) => `Winning chances drop ${d.loss}% after this.`, (d) => `Roughly ${d.loss}% of the win probability is lost.`],
    ev: {
      lost: [(d) => `The position is practically lost now.`, (d) => `${d.side} is in serious trouble.`, (d) => `${d.side} now has to defend hard.`],
      worse: [(d) => `${d.side} is slightly worse.`, (d) => `The position leans toward the opponent.`, (d) => `${d.side} is under pressure now.`],
      equal: [(d) => `The position is still balanced.`, (d) => `Both sides are level.`, (d) => `Neither side is dominating.`],
      better: [(d) => `${d.side} is a little better.`, (d) => `The position leans slightly to ${d.side}.`, (d) => `${d.side} holds a small edge.`],
      winning: [(d) => `${d.side} is clearly winning.`, (d) => `The position strongly favors ${d.side}.`, (d) => `${d.side} has this game almost in hand.`],
      drop: [(d) => `${d.side} just let the advantage slip.`, (d) => `Was doing great, but the edge is gone.`, (d) => `${d.side}'s advantage vanished.`],
      comeback: [(d) => `${d.side} just turned it around!`, (d) => `Hard position, but nicely recovered.`, (d) => `The tide turns in favor of ${d.side}.`],
    },
    ij: {
      pos: ["Nice!", "Great!", "Lovely!", "Sweet!", "Spot on!", "Well done!", "Oh!", "Impressive!"],
      neu: ["Hmm,", "Let's see...", "Okay,", "Well,", "Alright,", "I see,", "At a glance,", "So,"],
      neg: ["Oops!", "Too bad!", "Yikes!", "Hmm...", "Hold on!", "Oh no!", "Ouch...", "Eek,"],
    },
    mateThreat: [(d) => `The opponent can deliver mate with ${d.MS}!`, (d) => `Danger! ${d.MS} would be checkmate.`, (d) => `${d.MS} from the opponent would be mate.`],
    quietMist: [(d) => `The position gets much worse after this.`, (d) => `The opponent gets a big chance after this move.`, (d) => `This opens up serious trouble for ${d.side}.`],
    capBad: [(d) => `Taking the ${d.C} on ${d.To} looks tempting, but there was better.`, (d) => `${d.P} takes ${d.C}, sounds good, just not the best.`, (d) => `Winning the ${d.C} on ${d.To} is fine, but the position gets worse.`],
    side: { w: "White", b: "Black" },
  },
};

// ---------- chọn câu, chống trùng ----------
const usedIdx = new Map();
function pick(lang, id, arr) {
  const key = lang + ":" + id;
  let s = usedIdx.get(key);
  if (!s || s.size >= arr.length) { s = new Set(); usedIdx.set(key, s); }
  const free = arr.map((_, i) => i).filter((i) => !s.has(i));
  const i = free[Math.floor(Math.random() * free.length)];
  s.add(i);
  return arr[i];
}
const cache = new WeakMap();
const IDLE = { vi: "Chọn một nước đi để Nyro nhận xét nha!", en: "Pick a move and Nyro will comment!" };

function evBucket(wp) {
  return wp >= 90 ? "winning" : wp >= 62 ? "better" : wp >= 38 ? "equal" : wp >= 12 ? "worse" : "lost";
}

// ctx: { Chess, fen (thế cờ trước nước đi), lang, evals (win% của Trắng sau mỗi nước) }
function buildLine(rv, ply, ctx) {
  const lang = ctx.lang === "en" ? "en" : "vi";
  const T = L[lang], N = NAME[lang];
  const say = (id, pool, d) => pick(lang, id, pool)(d);
  const bad = BAD.includes(rv.cls);
  let f = null, b = null;
  if (ctx.Chess && ctx.fen) {
    try { f = analyzeMove(ctx.Chess, ctx.fen, rv.uci); } catch (e) { f = null; }
    if (bad && rv.bestUci && rv.bestUci !== rv.uci) { try { b = analyzeMove(ctx.Chess, ctx.fen, rv.bestUci); } catch (e) { b = null; } }
  }
  const d = { san: rv.san, side: T.side[rv.side] || "", best: rv.bestSan, loss: Math.round(rv.loss || 0) };
  if (f) {
    Object.assign(d, { P: N[f.piece], To: f.to, C: f.cap ? N[f.cap] : "", PR: f.promo ? N[f.promo] : "" });
    if (f.hang) Object.assign(d, { A: N[f.hang.att], U: f.hang.undef });
    if (f.threat) Object.assign(d, { C: N[f.threat.cap], TS: f.threat.sq, TA: N[f.threat.by] });
    if (f.mateIn1) d.MS = f.mateIn1;
  }
  if (b) Object.assign(d, { BC: b.cap ? N[b.cap] : "" });

  let h = say("head." + rv.cls, T.head[rv.cls] || T.head.good, d);
  if (h.startsWith(rv.san) && Math.random() < 0.6) {
    const g = ["brilliant", "great", "best", "excellent"].includes(rv.cls) ? "pos" : ["mistake", "blunder"].includes(rv.cls) ? "neg" : "neu";
    h = pick(lang, "ij." + g, T.ij[g]) + " " + h;
  }
  const parts = [h];
  // chi tiết
  if (!bad) {
    const c = [];
    if (f && f.mate) c.push(["mate", T.mate]);
    else if (rv.sacrifice && f) c.push(["sac", T.sac]);
    if (f && !f.mate) {
      if (f.promo) c.push(["promo", T.promo]);
      if (f.cap) c.push([f.capFree ? "capFree" : "cap", f.capFree ? T.capFree : T.cap]);
      if (f.check) c.push(["check", T.check]);
      if (f.ks || f.qs) c.push(["castle", T.castle]);
      if (f.develop) c.push(["develop", T.develop]);
      if (f.center) c.push(["center", T.center]);
    }
    if (rv.cls === "book") c.push(["bookd", T.book]);
    if (!c.length) c.push(["quiet", T.quiet]);
    const n = rv.cls === "brilliant" || rv.cls === "great" ? 2 : 1;
    // lấy ngẫu nhiên n mục khác nhau trong danh sách ưu tiên (2 mục đầu có trọng số cao hơn)
    const chosen = c.slice(0, Math.max(n, 1) + (c.length > 2 ? 1 : 0));
    for (let i = 0; i < n && chosen.length; i++) {
      const k = Math.floor(Math.random() * chosen.length);
      const [id, pool] = chosen.splice(k, 1)[0];
      parts.push(say(id, pool, d));
    }
  } else {
    if (f && f.mateIn1) parts.push(say("mateThreat", T.mateThreat, d));
    else if (f && f.hang) parts.push(say("hang", T.hang, d));
    else if (f && f.threat) parts.push(say("threat", T.threat, d));
    else if (f && f.cap) parts.push(say("capBad", T.capBad, d));
    else if (rv.cls === "inaccuracy") parts.push(say("quietBad", T.quietBad, d));
    else parts.push(say("quietMist", T.quietMist, d));
    if (rv.bestSan && rv.bestUci !== rv.uci) {
      let id = "bAny", pool = T.bAny;
      if (b) {
        if (b.mate) { id = "bMate"; pool = T.bMate; }
        else if (b.cap && b.capFree) { id = "bCapFree"; pool = T.bCapFree; }
        else if (b.cap) { id = "bCap"; pool = T.bCap; }
        else if (b.promo) { id = "bPromo"; pool = T.bPromo; }
        else if (b.check) { id = "bCheck"; pool = T.bCheck; }
        else if (b.ks || b.qs) { id = "bCastle"; pool = T.bCastle; }
      }
      parts.push(say(id, pool, d));
    }
  }
  // đánh giá thế cờ (theo góc nhìn bên vừa đi) hoặc % mất
  const ev = ctx.evals;
  let tail = null;
  if (ev && typeof ev[ply] === "number" && typeof ev[ply + 1] === "number") {
    const sgn = rv.side === "w" ? 1 : -1;
    const wb = sgn === 1 ? ev[ply] : 100 - ev[ply];
    const wa = sgn === 1 ? ev[ply + 1] : 100 - ev[ply + 1];
    if (bad && wb >= 60 && wa < 45) tail = ["ev.drop", T.ev.drop];
    else if (!bad && wb <= 35 && wa >= 50) tail = ["ev.comeback", T.ev.comeback];
    else if (bad && Math.random() < 0.7) { const k = evBucket(wa); tail = ["ev." + k, T.ev[k]]; }
    else if (!bad && (wa >= 85 || wa <= 15) && Math.random() < 0.5) { const k = evBucket(wa); tail = ["ev." + k, T.ev[k]]; }
    else if (!bad && Math.random() < 0.25) { const k = evBucket(wa); tail = ["ev." + k, T.ev[k]]; }
  }
  if (tail) parts.push(say(tail[0], tail[1], d));
  else if (bad && d.loss >= 8 && Math.random() < 0.5) parts.push(say("loss", T.loss, d));

  let mood = MOOD[rv.cls] || "idle";
  if (f && f.mate) mood = "wow";
  const out = { mood, text: parts.join(" ") };
  return out;
}

const seenText = new Set();
export function coachLine(rv, ply, ctx = {}) {
  const lang = ctx.lang === "en" ? "en" : "vi";
  if (!rv) return { mood: "idle", text: IDLE[lang] };
  if (cache.has(rv)) return cache.get(rv);
  let out;
  for (let i = 0; i < 8; i++) { out = buildLine(rv, ply, ctx); if (!seenText.has(lang + out.text)) break; }
  seenText.add(lang + out.text);
  cache.set(rv, out);
  return out;
}

const THINK = {
  vi: ["Để Nyro xem nước này nào...", "Hmm, đang tính nhanh một chút...", "Chờ xíu, Nyro đang nghĩ nè.", "Nyro soi thế cờ đây...", "Đợi Nyro một nhịp nha!"],
  en: ["Let Nyro take a look...", "Hmm, calculating for a moment...", "One sec, Nyro is thinking.", "Nyro is checking the position...", "Give Nyro a moment!"],
};
const TRYHINT = {
  vi: ["Tới lượt bạn! Chạm vào quân rồi chạm ô đích để thử một nước.", "Thử một nước khác xem, Nyro sẽ chấm điểm ngay!", "Bạn sẽ đi nước nào? Nyro chờ nè.", "Đây là thế cờ lúc đó, thử tìm nước hay hơn đi!", "Thoải mái thử nha, đi sai cũng không sao đâu."],
  en: ["Your turn! Tap a piece, then tap a square to try a move.", "Try another move and Nyro will rate it right away!", "Which move will you play? Nyro is waiting.", "This is the position back then, try to find something better!", "Feel free to experiment, a wrong move costs nothing."],
};
export const coachThinking = (lang) => pick(lang === "en" ? "en" : "vi", "think", THINK[lang === "en" ? "en" : "vi"].map((t) => () => t))();
export const coachTryHint = (lang) => pick(lang === "en" ? "en" : "vi", "tryhint", TRYHINT[lang === "en" ? "en" : "vi"].map((t) => () => t))();

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
