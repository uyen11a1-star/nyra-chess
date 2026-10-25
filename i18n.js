// i18n.js — Tiếng Việt / English.
// - t(key, params): từ điển cho phần mới (Puzzle, Cài đặt).
// - Lớp dịch DOM: dịch giao diện cũ (app.js, arena.js, review...) sang tiếng Anh khi chọn EN,
//   không cần sửa từng chuỗi trong code cũ. Chuỗi không có trong bảng thì giữ nguyên tiếng Việt.
const KEY = "nyraLang";
let lang = "vi";
try { const s = localStorage.getItem(KEY); if (s === "en" || s === "vi") lang = s; } catch (e) { /* bỏ qua */ }
export const getLang = () => lang;

// ---------------------------------------------------------------- phần mới
const DICT = {
  vi: {
    "settings.title": "Cài đặt", "settings.language": "Ngôn ngữ", "settings.puzzle": "Puzzle",
    "settings.autoNext": "Tự chuyển puzzle mới sau khi giải đúng",
    "settings.autoQueen": "Phong cấp tự động thành Hậu",
    "settings.showRating": "Hiện rating của puzzle",
    "settings.showThemes": "Hiện chủ đề (gợi ý) khi đang giải",
    "settings.nyraMs": "Nyra nghĩ mỗi nước",
    "settings.resetPuzzle": "Đặt lại rating & tiến độ puzzle",
    "settings.confirmReset": "Đặt lại rating và danh sách puzzle đã giải?",
    "settings.resetDone": "Đã đặt lại.", "settings.close": "Đóng", "settings.btn": "Cài đặt",
    "pz.yourRating": "Rating của bạn", "pz.streak": "Chuỗi đúng", "pz.solved": "Đã giải",
    "pz.mode.practice": "Luyện tập", "pz.mode.versus": "Bạn đấu Nyra", "pz.mode.nyra": "Nyra tự giải",
    "pz.diff": "Độ khó", "pz.theme": "Chủ đề",
    "pz.diff.auto": "Tự động", "pz.diff.easy": "Dễ (dưới 1000)", "pz.diff.medium": "Vừa (1000–1500)",
    "pz.diff.hard": "Khó (1500–2000)", "pz.diff.vhard": "Rất khó (2000–2500)", "pz.diff.extreme": "Siêu khó (2500+)",
    "pz.diff.ladder": "Leo thang (+100 mỗi puzzle)",
    "pz.theme.all": "Mọi chủ đề", "pz.theme.genius": "✦ Nước đi thiên tài", "pz.theme.none": "Chưa có chủ đề",
    "pz.loading": "Đang tải puzzle…", "pz.noData": "Không tải được dữ liệu puzzle.", "pz.noMatch": "Không có puzzle phù hợp bộ lọc.",
    "pz.prompt": "Tìm nước đi tốt nhất cho {side}", "pz.side.w": "Trắng", "pz.side.b": "Đen",
    "pz.oppMoving": "Đối thủ đang đi…", "pz.keepGoing": "Đúng rồi, đi tiếp…", "pz.wrong": "Chưa đúng, thử lại!",
    "pz.solvedMsg": "Giải xong!", "pz.failedMsg": "Chưa giải được.", "pz.ratingDelta": "Rating {d}",
    "pz.hint": "Gợi ý: thử đi quân ở ô {sq}", "pz.solutionIs": "Đáp án: {line}",
    "pz.btn.hint": "Gợi ý", "pz.btn.solution": "Đáp án", "pz.btn.next": "Puzzle tiếp", "pz.btn.start": "▶ Bắt đầu",
    "pz.btn.stop": "■ Dừng", "pz.btn.flip": "Đảo bàn", "pz.btn.skip": "Bỏ qua",
    "pz.genius": "Nước đi thiên tài!", "pz.puzzleNo": "Puzzle #{id} · ★{rating}", "pz.choosePromo": "Chọn quân phong cấp",
    "pz.vs.title": "Bạn đấu Nyra", "pz.vs.you": "Bạn", "pz.vs.nyra": "Nyra",
    "pz.vs.thinking": "Nyra đang giải ngầm…", "pz.vs.pending": "Giải xong để xem Nyra làm thế nào.",
    "pz.vs.nyraOk": "Nyra giải đúng sau {s}s", "pz.vs.nyraBad": "Nyra đi {san} — sai (đáp án {ans})",
    "pz.vs.nyraErr": "Nyra không chạy được: {msg}", "pz.vs.youFaster": "Bạn nhanh hơn Nyra!", "pz.vs.nyraFaster": "Nyra nhanh hơn bạn.",
    "pz.vs.bothOk": "Cả hai cùng giải đúng", "pz.vs.score": "Tỉ số",
    "pz.nyra.count": "Số puzzle", "pz.nyra.thinking": "Nyra đang nghĩ…", "pz.nyra.chose": "Nyra chọn {san}",
    "pz.nyra.ok": "✔ Nyra giải đúng", "pz.nyra.bad": "✘ Nyra sai — đáp án {ans}", "pz.nyra.score": "Nyra giải đúng {a}/{b}",
    "pz.nyra.ladderEnd": "Nyra dừng ở rating {r}", "pz.nyra.done": "Xong!", "pz.nyra.avg": "TB {s}s mỗi puzzle",
    "pz.nyra.log": "Nhật ký", "pz.nyra.idle": "Bấm “Bắt đầu” để Nyra tự giải puzzle.",
    "pz.nyra.stopped": "Đã dừng.", "pz.nyra.best": "Rating cao nhất Nyra giải được: {r}",
    "pz.source": "{n} puzzle · nguồn Lichess (CC0)", "pz.noThemesNote": " · chưa có chủ đề",
  },
  en: {
    "settings.title": "Settings", "settings.language": "Language", "settings.puzzle": "Puzzles",
    "settings.autoNext": "Auto-load the next puzzle after a correct solve",
    "settings.autoQueen": "Always promote to queen",
    "settings.showRating": "Show puzzle rating",
    "settings.showThemes": "Show themes (spoiler) while solving",
    "settings.nyraMs": "Nyra thinking time per move",
    "settings.resetPuzzle": "Reset puzzle rating & progress",
    "settings.confirmReset": "Reset your rating and solved-puzzle history?",
    "settings.resetDone": "Reset done.", "settings.close": "Close", "settings.btn": "Settings",
    "pz.yourRating": "Your rating", "pz.streak": "Streak", "pz.solved": "Solved",
    "pz.mode.practice": "Practice", "pz.mode.versus": "You vs Nyra", "pz.mode.nyra": "Nyra solves",
    "pz.diff": "Difficulty", "pz.theme": "Theme",
    "pz.diff.auto": "Auto", "pz.diff.easy": "Easy (under 1000)", "pz.diff.medium": "Medium (1000–1500)",
    "pz.diff.hard": "Hard (1500–2000)", "pz.diff.vhard": "Very hard (2000–2500)", "pz.diff.extreme": "Extreme (2500+)",
    "pz.diff.ladder": "Ladder (+100 per puzzle)",
    "pz.theme.all": "All themes", "pz.theme.genius": "✦ Genius moves", "pz.theme.none": "No themes yet",
    "pz.loading": "Loading puzzle…", "pz.noData": "Could not load puzzle data.", "pz.noMatch": "No puzzle matches the filter.",
    "pz.prompt": "Find the best move for {side}", "pz.side.w": "White", "pz.side.b": "Black",
    "pz.oppMoving": "Opponent is moving…", "pz.keepGoing": "Right — keep going…", "pz.wrong": "Not quite — try again!",
    "pz.solvedMsg": "Solved!", "pz.failedMsg": "Not solved.", "pz.ratingDelta": "Rating {d}",
    "pz.hint": "Hint: try moving the piece on {sq}", "pz.solutionIs": "Solution: {line}",
    "pz.btn.hint": "Hint", "pz.btn.solution": "Solution", "pz.btn.next": "Next puzzle", "pz.btn.start": "▶ Start",
    "pz.btn.stop": "■ Stop", "pz.btn.flip": "Flip board", "pz.btn.skip": "Skip",
    "pz.genius": "Genius move!", "pz.puzzleNo": "Puzzle #{id} · ★{rating}", "pz.choosePromo": "Choose promotion piece",
    "pz.vs.title": "You vs Nyra", "pz.vs.you": "You", "pz.vs.nyra": "Nyra",
    "pz.vs.thinking": "Nyra is solving in the background…", "pz.vs.pending": "Finish to see how Nyra did.",
    "pz.vs.nyraOk": "Nyra solved it in {s}s", "pz.vs.nyraBad": "Nyra played {san} — wrong (answer {ans})",
    "pz.vs.nyraErr": "Nyra could not run: {msg}", "pz.vs.youFaster": "You beat Nyra on time!", "pz.vs.nyraFaster": "Nyra was faster.",
    "pz.vs.bothOk": "Both solved it", "pz.vs.score": "Score",
    "pz.nyra.count": "Puzzles", "pz.nyra.thinking": "Nyra is thinking…", "pz.nyra.chose": "Nyra plays {san}",
    "pz.nyra.ok": "✔ Nyra solved it", "pz.nyra.bad": "✘ Nyra missed — answer {ans}", "pz.nyra.score": "Nyra solved {a}/{b}",
    "pz.nyra.ladderEnd": "Nyra stopped at rating {r}", "pz.nyra.done": "Done!", "pz.nyra.avg": "avg {s}s per puzzle",
    "pz.nyra.log": "Log", "pz.nyra.idle": "Press “Start” to let Nyra solve puzzles on her own.",
    "pz.nyra.stopped": "Stopped.", "pz.nyra.best": "Highest rating Nyra solved: {r}",
    "pz.source": "{n} puzzles · source: Lichess (CC0)", "pz.noThemesNote": " · no themes",
  },
};

// Tên chủ đề puzzle (EN lấy từ puzzleTheme.xml của Lichess)
export const THEME_NAMES = {
  mateIn1: ["Chiếu hết 1 nước", "Mate in 1"], mateIn2: ["Chiếu hết 2 nước", "Mate in 2"],
  mateIn3: ["Chiếu hết 3 nước", "Mate in 3"], mateIn4: ["Chiếu hết 4 nước", "Mate in 4"],
  mateIn5: ["Chiếu hết 5 nước trở lên", "Mate in 5 or more"], mate: ["Chiếu hết", "Checkmate"],
  fork: ["Đòn đôi (fork)", "Fork"], pin: ["Ghim", "Pin"], skewer: ["Xiên", "Skewer"],
  discoveredAttack: ["Tấn công lộ", "Discovered attack"], doubleCheck: ["Chiếu kép", "Double check"],
  sacrifice: ["Hy sinh quân", "Sacrifice"], quietMove: ["Nước đi lặng", "Quiet move"], zugzwang: ["Zugzwang", "Zugzwang"],
  clearance: ["Dọn đường", "Clearance"], interference: ["Chặn đường", "Interference"], intermezzo: ["Nước chen ngang", "Intermezzo"],
  deflection: ["Đánh lạc hướng", "Deflection"], attraction: ["Dẫn dụ", "Attraction"], xRayAttack: ["Tấn công tia X", "X-Ray attack"],
  trappedPiece: ["Quân bị vây", "Trapped piece"], hangingPiece: ["Quân bị bỏ hở", "Hanging piece"],
  capturingDefender: ["Ăn quân phòng thủ", "Capture the defender"], backRankMate: ["Chiếu hết hàng cuối", "Back rank mate"],
  smotheredMate: ["Chiếu hết ngạt", "Smothered mate"], attackingF2F7: ["Tấn công f2/f7", "Attacking f2 or f7"],
  exposedKing: ["Vua hở", "Exposed king"], kingsideAttack: ["Tấn công cánh Vua", "Kingside attack"],
  queensideAttack: ["Tấn công cánh Hậu", "Queenside attack"], advancedPawn: ["Tốt tiến sâu", "Advanced pawn"],
  promotion: ["Phong cấp", "Promotion"], underPromotion: ["Phong cấp thấp", "Underpromotion"], enPassant: ["Bắt tốt qua đường", "En passant"],
  castling: ["Nhập thành", "Castling"], defensiveMove: ["Nước phòng thủ", "Defensive move"], crushing: ["Đè bẹp", "Crushing"],
  advantage: ["Giành lợi thế", "Advantage"], equality: ["Cân bằng lại", "Equality"], opening: ["Khai cuộc", "Opening"],
  middlegame: ["Trung cuộc", "Middlegame"], endgame: ["Tàn cuộc", "Endgame"], pawnEndgame: ["Tàn cuộc tốt", "Pawn endgame"],
  rookEndgame: ["Tàn cuộc xe", "Rook endgame"], knightEndgame: ["Tàn cuộc mã", "Knight endgame"],
  bishopEndgame: ["Tàn cuộc tượng", "Bishop endgame"], queenEndgame: ["Tàn cuộc hậu", "Queen endgame"],
  short: ["Ngắn", "Short puzzle"], long: ["Dài", "Long puzzle"], veryLong: ["Rất dài", "Very long puzzle"], oneMove: ["Một nước", "One-move puzzle"],
};
// Các chủ đề được xem là "nước đi thiên tài": hy sinh, nước lặng, zugzwang...
export const GENIUS_THEMES = ["sacrifice", "quietMove", "zugzwang", "clearance", "interference", "intermezzo"];
export const themeName = (id) => (THEME_NAMES[id] ? THEME_NAMES[id][lang === "en" ? 1 : 0] : id);

export function t(key, p) {
  let s = (DICT[lang] && DICT[lang][key]) ?? DICT.vi[key] ?? key;
  if (p) for (const k in p) s = s.split(`{${k}}`).join(String(p[k]));
  return s;
}

// ---------------------------------------------------------------- dịch giao diện cũ (VI → EN)
const EXACT = {
  // thanh trên & menu
  "BÀN CỜ SẴN SÀNG": "BOARD READY", "NYRA WASM SẴN SÀNG": "NYRA WASM READY", "CHỜ CẤU HÌNH API": "WAITING FOR API CONFIG",
  "STOCKFISH ĐANG NGHĨ": "STOCKFISH THINKING", "ĐANG KẾT NỐI ENGINE": "CONNECTING TO ENGINE", "STOCKFISH ĐANG CHẠY": "STOCKFISH RUNNING",
  "NYRA WASM ĐANG CHẠY": "NYRA WASM RUNNING", "NYRA API ĐANG CHẠY": "NYRA API RUNNING", "LỖI KẾT NỐI ENGINE": "ENGINE CONNECTION ERROR",
  "Nyra Chess trang chủ": "Nyra Chess home", "Bàn cờ Nyra": "Nyra board", "Menu": "Menu",
  "Chơi cờ": "Play", "Đấu trường AI": "AI Arena", "Thống kê": "Statistics", "Lịch sử & Phân tích": "History & Analysis",
  "Lịch sử": "History", "Nhập PGN": "Import PGN",
  "Cài đặt": "Settings",
  // tab chơi
  "Chọn đối thủ": "Choose opponent", "Bàn cờ vua": "Chess board", "Lượt Trắng": "White to move", "Lượt Đen": "Black to move",
  "Về đầu ván": "Go to start", "Nước trước (←)": "Previous move (←)", "Nước trước": "Previous move", "Nước sau (→)": "Next move (→)",
  "Nước sau": "Next move", "Về nước hiện tại": "Go to current position", "Nước cuối (End)": "Last move (End)",
  "Trận đấu sẵn sàng": "Game ready", "Chọn một quân Trắng để bắt đầu.": "Move a White piece to start.",
  "Ván mới": "New game", "Tạm dừng": "Pause", "▶ Tiếp tục": "▶ Resume", "Hoàn tác": "Undo", "Đảo bàn": "Flip board",
  "Tải PGN": "Download PGN", "Chưa có ván cờ nào.": "No game yet.", "PGN ở trên": "PGN above",
  "Kết quả & phân tích": "Result & analysis", "Phân tích lại ván này": "Re-analyse this game",
  "Xem lại bàn cờ với nhãn": "Review board with labels", "Phân tích ván bằng Nyra": "Analyse game with Nyra",
  "Đang diễn ra": "In progress", "Chiến thắng!": "Victory!", "Hòa cờ!": "Draw!", "Trắng": "White", "Đen": "Black",
  "Bạn": "You", "Trống.": "Empty.", "Đang xem lại ván": "Reviewing game", "Bấm ⏭ (về hiện tại) trước khi đi nước mới.": "Press ⏭ (back to current) before making a new move.",
  "Nước đi không hợp lệ": "Invalid move", "Hãy chọn lại ô đến.": "Pick the destination square again.",
  "Đang tìm nước đi tốt nhất...": "Looking for the best move...", "Lỗi Stockfish": "Stockfish error", "Lỗi API": "API error",
  "Dùng ◀ ▶ hoặc phím ← → để tua · ⏭ để về hiện tại.": "Use ◀ ▶ or the ← → keys to step · ⏭ to return to the current position.",
  "Ván nhập từ PGN": "Game imported from PGN", "Đã nhập PGN": "PGN imported",
  "ngẫu nhiên": "random", "sách khai cuộc": "opening book",
  // phân tích
  "Thiên tài": "Brilliant", "Rất hay": "Great", "Tốt nhất": "Best", "Rất tốt": "Excellent", "Ổn": "Good", "Sách khai cuộc": "Book",
  "Thiếu chính xác": "Inaccuracy", "Sai lầm": "Mistake", "Sai lầm nặng": "Blunder", "Độ chính xác": "Accuracy",
  "Phân tích tự động không chạy được: trình duyệt chưa hỗ trợ Nyra WebAssembly. Nhấn “Phân tích lại” sau khi có API.":
    "Auto-analysis can't run: this browser doesn't support Nyra WebAssembly. Press “Re-analyse” once an API is available.",
  "Chưa có nước đi nào để phân tích.": "No moves to analyse yet.",
  "Trình duyệt này chưa chạy được Nyra WebAssembly nên không phân tích được.": "This browser can't run Nyra WebAssembly, so analysis isn't available.",
  "Xem lại ván vừa chơi": "Review of the game just played",
  "Mỗi nước có nhãn Nyra đánh giá. Mũi tên đỏ: nước đã đi · mũi tên xanh mờ: nước Nyra gợi ý.":
    "Every move carries Nyra's rating. Red arrow: the move played · faded green arrow: Nyra's suggestion.",
  "Ván này chưa có phân tích của Nyra — bấm “Phân tích ván bằng Nyra”.": "No Nyra analysis for this game yet — press “Analyse game with Nyra”.",
  "Chưa có nước đi nào để xem lại.": "No moves to review yet.",
  // alert/prompt/PGN
  "Phong cấp (q/r/b/n):": "Promote to (q/r/b/n):", "Đã lưu API": "API saved", "Chưa có ván cờ nào để copy PGN.": "No game to copy as PGN yet.",
  "Đã copy PGN vào clipboard": "PGN copied to clipboard", "Đã copy PGN (dùng select+copy)": "PGN copied (via select+copy)",
  "Chưa có ván cờ nào để xuất PGN.": "No game to export as PGN yet.", "Chưa có nội dung PGN.": "No PGN content.",
  "PGN không có nước đi nào.": "The PGN has no moves.", "Không đọc được file": "Could not read the file",
  "Dán PGN hoặc chọn file .pgn. Ván sẽ được đưa lên bàn cờ để tua lại, phân tích và chơi tiếp.":
    "Paste a PGN or choose a .pgn file. The game is loaded onto the board so you can step through it, analyse it and keep playing.",
  "Tải vào bàn cờ": "Load onto board", "Đóng": "Close",
  // thống kê, thời gian, engine
  "Thống kê của bạn": "Your statistics", "Tổng số ván": "Total games", "Thắng": "Wins", "Thua": "Losses", "Hòa": "Draws",
  "Lịch sử nước đi": "Move history", "Thời gian": "Time", "Không giới hạn": "Unlimited", "3 phút": "3 min", "3 phút + 2s": "3 min + 2s",
  "5 phút": "5 min", "10 phút": "10 min", "Engine của bạn": "Your engine", "Lưu cấu hình API": "Save API settings", "Chưa kết nối": "Not connected",
  // arena
  "▴ Thu gọn": "▴ Collapse", "⚙ Cài đặt": "⚙ Setup", "Số ván": "Games", "Tốc độ xem": "Watch speed", "Nhanh nhất": "Fastest",
  "Vừa": "Medium", "Chậm": "Slow", "Rất chậm": "Very slow", "Đổi màu mỗi ván": "Alternate colours each game",
  "Khai cuộc ngẫu nhiên": "Random openings", "▶ Bắt đầu đấu": "▶ Start match", "■ Dừng": "■ Stop", "✕ Thoát": "✕ Exit",
  "Sẵn sàng": "Ready", "Chọn hai bên rồi bấm “Bắt đầu đấu”.": "Pick both sides, then press “Start match”.",
  "Nghĩ/nước (ms)": "Think/move (ms)", "Giảm 50": "Decrease 50", "Tăng 50": "Increase 50", "Thanh chỉnh Elo": "Elo slider",
  "Ngẫu nhiên": "Random", "Bàn cờ Arena": "Arena board", "không giới hạn": "unlimited",
  "Đã hoàn thành!": "Completed!", "Đã dừng.": "Stopped.", "Đã dừng": "Stopped", "Hoàn thành": "Completed", "Lỗi": "Error",
  "Bắt đầu ván": "Game start", "chiếu hết": "checkmate", "hết nước đi (hòa)": "stalemate (draw)",
  "không đủ quân chiếu hết": "insufficient material", "lặp thế 3 lần": "threefold repetition", "luật 50 nước": "50-move rule", "hòa": "draw",
  "trên thang Stockfish": "on the Stockfish scale",
  "Elo Stockfish là thang": "Stockfish Elo is the engine's own",
  "của chính engine (CCRL 40/4, chuẩn hoá ở 60s+0.6s), nằm trong 1320–3190 —": "scale (CCRL 40/4, normalised at 60s+0.6s), in the range 1320–3190 —",
  "không": "not",
  "bằng Elo Chess.com/FIDE. Elo cao cần đủ thời gian nghĩ mới đạt đúng sức. Ô “Nghĩ/nước” để trống = tự động.":
    "the same as Chess.com/FIDE Elo. High Elo needs enough thinking time to reach its true strength. Leave “Think/move” empty = automatic.",
};
// Quy tắc theo mẫu (có tham số). `$1` là nhóm bắt; hàm nhận (match, ...nhóm) và có thể gọi lại translate().
const RULES = [
  [/^Lượt (Trắng|Đen)\.(?: · (.+))?$/, (m, c, rest) => `${c === "Trắng" ? "White" : "Black"} to move.` + (rest ? ` · ${translate(rest)}` : "")],
  [/^(Trắng|Đen) thắng!$/, (m, c) => `${c === "Trắng" ? "White" : "Black"} wins!`],
  [/^(Trắng|Đen) đã hết giờ\.$/, (m, c) => `${c === "Trắng" ? "White" : "Black"} ran out of time.`],
  [/^(.+) đang tính\.\.\.$/, "$1 is calculating..."],
  [/^(.+) chọn (\S+)$/, "$1 plays $2"],
  [/^Nước đi của (.+) không hợp lệ$/, "$1 made an invalid move"],
  [/^Đã đi (\S+) thay thế để ván không bị kẹt\.$/, "Played $1 instead so the game isn't stuck."],
  [/^Xem lại nước (\d+)\/(\d+)$/, "Reviewing move $1/$2"],
  [/^(.+): sách khai cuộc$/, "$1: opening book"],
  [/^UCI_Elo (\d+) \+ sai ngẫu nhiên$/, "UCI_Elo $1 + random mistakes"],
  [/^UCI_Elo (\d+)$/, "UCI_Elo $1"],
  [/^(\d+) nước · dùng ◀ ▶ để tua lại\.$/, "$1 moves · use ◀ ▶ to step through."],
  [/^Lỗi PGN: (.+)$/, (m, e) => `PGN error: ${translate(e)}`],
  [/^Không đọc được file: (.+)$/, "Could not read the file: $1"],
  [/^Đã đọc (.+) — bấm “Tải vào bàn cờ”\.$/, "Read $1 — press “Load onto board”."],
  [/^(?:Phân tích tự động|Nyra đang phân tích)… (\d+)\/(\d+)$/, "Analysing… $1/$2"],
  [/^Không phân tích được(?: tự động)?: (.+)$/, (m, e) => `Could not analyse: ${translate(e)}`],
  [/^Tốt hơn: (.+) \(−(\d+)% cơ hội thắng\)$/, "Better: $1 (−$2% win chance)"],
  [/^Bên ([AB])$/, "Side $1"], [/^Engine bên ([AB])$/, "Engine side $1"],
  [/^Ván (\d+)\/(\d+)$/, "Game $1/$2"], [/^Ván (\d+): (.+)$/, (m, g, r) => `Game ${g}: ${translate(r)}`],
  [/^Khai cuộc: (.+)$/, "Opening: $1"], [/^(.+) đang nghĩ…$/, "$1 is thinking…"],
  [/^(.+) đi nước không hợp lệ \((\S+)\)$/, "$1 played an invalid move ($2)"],
  [/^Dừng do lỗi — (.+)$/, "Stopped due to an error — $1"],
  [/^Xong (\d+) ván\.$/, "Finished $1 games."],
  [/^Hòa — (.+)$/, (m, w) => `Draw — ${translate(w)}`],
  [/^(.+) thắng — (.+)$/, (m, n, w) => `${n} wins — ${translate(w)}`],
  [/^(.+) \((\d+) nước\)$/, (m, a, n) => `${translate(a)} (${n} moves)`],
  [/^quá (\d+) nước \(xử hòa\)$/, "over $1 moves (declared a draw)"],
  [/^(\d+)ms \/ nước$/, "$1ms / move"], [/^Elo (\d+) · (\d+)ms$/, "Elo $1 · $2ms"], [/^không giới hạn · (\d+)ms$/, "unlimited · $1ms"],
  [/^Cần thêm ván để ước lượng Elo \(mới (\d+)\)\.$/, "More games are needed to estimate Elo ($1 so far)."],
  [/^Mới (\d+) ván — cần ≥ 30 ván mới tin được\.$/, "Only $1 games — you need ≥ 30 to trust it."],
  [/^Chênh lệch A−B: $/, "Difference A−B: "], [/^\(95%: /, "(95%: "], [/^\(cận 95%\)$/, "(95% bound)"],
  [/^Theo Elo đã đặt: (.+)$/, "By the Elo you set: $1"],
  [/^([^\p{L}\d]+) (\p{L}.*)$/u, (m, ic, rest) => `${ic} ${translate(rest)}`],   // nhãn có biểu tượng đứng trước, vd. "☰ Sách khai cuộc"
];
// Mảnh nhỏ nằm giữa các thẻ (<b>, <small>…) — thay thế khi cả chuỗi không khớp
const FRAGS = [
  [/ · Nyra gợi ý /g, " · Nyra suggests "], [/ · mất (\d+)% cơ hội thắng/g, " · loses $1% win chance"],
  [/(?<![\p{L}])Trắng(?![\p{L}])/gu, "White"], [/(?<![\p{L}])Đen(?![\p{L}])/gu, "Black"],
  [/sách khai cuộc/g, "opening book"], [/trên thang Stockfish/g, "on the Stockfish scale"],
  [/ nước\)/g, " moves)"], [/(?<![\p{L}])Elo(?![\p{L}])/gu, "Elo"],
];

const HAS_VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i;
export function translate(str) {
  const s = String(str);
  const core = s.trim();
  if (!core || !HAS_VI.test(core)) return s;
  const lead = s.slice(0, s.indexOf(core)), trail = s.slice(s.indexOf(core) + core.length);
  let out = EXACT[core];
  if (out === undefined) {
    for (const [re, rep] of RULES) {
      if (re.test(core)) { out = core.replace(re, rep); break; }
    }
  }
  if (out === undefined) {
    let tmp = core;
    for (const [re, rep] of FRAGS) tmp = tmp.replace(re, rep);
    out = tmp;
  }
  return lead + out + trail;
}

// ---------------------------------------------------------------- áp dụng vào DOM
const ATTRS = ["title", "aria-label", "placeholder", "alt"];
const textRec = new WeakMap();   // text node -> { vi, en }
const attrRec = new WeakMap();   // element -> { attr: { vi, en } }
let observer = null, busy = false;

function skipNode(n) {
  const p = n.parentNode;
  return !p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName) || (p.closest && p.closest("[data-no-i18n]"));
}
function fixText(n) {
  if (skipNode(n)) return;
  const v = n.nodeValue, rec = textRec.get(n);
  if (rec && rec.en === v) return;          // đây là bản dịch do mình đặt
  if (rec) textRec.delete(n);
  if (lang !== "en" || !HAS_VI.test(v)) return;
  const en = translate(v);
  if (en !== v) { textRec.set(n, { vi: v, en }); n.nodeValue = en; }
}
function fixAttrs(el) {
  let rec = attrRec.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute || !el.hasAttribute(a)) continue;
    const v = el.getAttribute(a), r = rec && rec[a];
    if (r && r.en === v) continue;
    if (r) delete rec[a];
    if (lang !== "en" || !HAS_VI.test(v)) continue;
    const en = translate(v);
    if (en !== v) { if (!rec) { rec = {}; attrRec.set(el, rec); } rec[a] = { vi: v, en }; el.setAttribute(a, en); }
  }
}
function walk(root) {
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1) return;
  fixAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = tw.nextNode();
  while (n) { if (n.nodeType === 3) fixText(n); else fixAttrs(n); n = tw.nextNode(); }
}
function restoreAll() {
  // trả bản tiếng Việt cho mọi nút văn bản/thuộc tính đang hiển thị bản dịch do mình đặt
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = tw.nextNode();
  while (n) {
    if (n.nodeType === 3) { const r = textRec.get(n); if (r && n.nodeValue === r.en) n.nodeValue = r.vi; textRec.delete(n); }
    else { const rec = attrRec.get(n); if (rec) { for (const a in rec) if (n.getAttribute(a) === rec[a].en) n.setAttribute(a, rec[a].vi); attrRec.delete(n); } }
    n = tw.nextNode();
  }
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver((muts) => {
    if (lang !== "en") return;
    for (const m of muts) {
      if (m.type === "characterData") fixText(m.target);
      else if (m.type === "attributes") fixAttrs(m.target);
      else m.addedNodes.forEach((n) => walk(n));
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

export function setLang(l) {
  if ((l !== "en" && l !== "vi") || l === lang) return;
  try { localStorage.setItem(KEY, l); } catch (e) { /* bỏ qua */ }
  lang = l;
  document.documentElement.lang = l;
  if (l === "en") { walk(document.body); startObserver(); } else restoreAll();
  window.dispatchEvent(new CustomEvent("nyra-langchange", { detail: l }));
}

export function initI18n() {
  document.documentElement.lang = lang;
  // alert/prompt cũng đi qua bộ dịch
  const _alert = window.alert.bind(window), _prompt = window.prompt.bind(window);
  window.alert = (m) => _alert(lang === "en" ? translate(m) : m);
  window.prompt = (m, d) => _prompt(lang === "en" ? translate(m) : m, d);
  if (lang === "en") { walk(document.body); startObserver(); }
}
