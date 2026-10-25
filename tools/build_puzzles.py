#!/usr/bin/env python3
"""Tạo bộ ~100.000 puzzle (có chủ đề) cho web Nyra từ kho puzzle của Lichess (CC0).

Cách dùng (Termux):
    pkg install -y python zstd
    curl -L -o ~/lichess_puzzle.csv.zst https://database.lichess.org/lichess_puzzle.csv.zst
    cd ~/nyra-chess && python3 tools/build_puzzles.py ~/lichess_puzzle.csv.zst

Cũng nhận file .csv thường hoặc đọc từ stdin:  zstd -dc file.zst | python3 tools/build_puzzles.py -
Kết quả: thư mục puzzles/ (index.json + p-XXXX.txt, mỗi file một dải 100 rating).
Định dạng CSV Lichess: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags[,DailyDate]
"""
import heapq, json, os, subprocess, sys, shutil, itertools

TARGET = 100_000
OUT = "puzzles"
BAND = 50                      # độ rộng dải rating khi chia hạn ngạch
GENIUS = ["sacrifice", "quietMove", "zugzwang", "clearance", "interference", "intermezzo"]
EXTRA_QUOTA = 2500             # mỗi chủ đề "thiên tài" được đảm bảo tối thiểu chừng này puzzle (nếu kho có đủ)
KEEP_THEMES = set("""mateIn1 mateIn2 mateIn3 mateIn4 mateIn5 mate fork pin skewer discoveredAttack doubleCheck sacrifice quietMove
zugzwang clearance interference intermezzo deflection attraction xRayAttack trappedPiece hangingPiece capturingDefender backRankMate
smotheredMate attackingF2F7 exposedKing kingsideAttack queensideAttack advancedPawn promotion underPromotion enPassant castling
defensiveMove crushing advantage equality opening middlegame endgame pawnEndgame rookEndgame knightEndgame bishopEndgame queenEndgame
short long veryLong oneMove""".split())


def open_stream(path):
    if path == "-":
        return sys.stdin
    if path.endswith(".zst"):
        if not shutil.which("zstd"):
            sys.exit("Thiếu zstd: chạy  pkg install -y zstd")
        p = subprocess.Popen(["zstd", "-dc", path], stdout=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1 << 20)
        return p.stdout
    return open(path, encoding="utf-8")


def band_quotas(total):
    """Hạn ngạch theo dải rating: nhiều ở 700–2300, thưa ở hai đầu."""
    centers = list(range(400, 3300, BAND))
    def w(r):
        if r < 700: return 0.5
        if r <= 2300: return 1.0
        if r <= 2700: return 0.6
        return 0.25
    ws = [w(c) for c in centers]
    s = sum(ws)
    return {c: max(40, int(total * x / s)) for c, x in zip(centers, ws)}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = open_stream(sys.argv[1])
    quotas = band_quotas(int(TARGET * 0.85))           # 85% theo dải rating, 15% dành cho chủ đề thiên tài
    band_heaps = {b: [] for b in quotas}
    theme_heaps = {t: [] for t in GENIUS}
    counter = itertools.count()
    n_rows = 0
    header = True
    for line in src:
        if header:                                       # bỏ dòng tiêu đề (nếu có)
            header = False
            if line.startswith("PuzzleId"):
                continue
        f = line.rstrip("\n").split(",", 9)
        if len(f) < 8:
            continue
        try:
            rating, rd, pop, plays = int(f[3]), int(f[4]), int(f[5]), int(f[6])
        except ValueError:
            continue
        n_rows += 1
        if pop < 50 or plays < 100 or len(f[2].split(" ")) < 2:
            continue
        themes = [x for x in f[7].split(" ") if x in KEEP_THEMES]
        # điểm xếp hạng: rating ổn định (RD thấp) > độ phổ biến > số lượt chơi
        key = (rd <= 110, pop, plays, next(counter))
        row = (f[0], f[1], f[2], rating, " ".join(themes))
        b = (rating // BAND) * BAND
        b = min(max(b, 400), 3250)
        h = band_heaps[b]
        item = (key, row)
        if len(h) < quotas[b]:
            heapq.heappush(h, item)
        elif key > h[0][0]:
            heapq.heapreplace(h, item)
        for th in GENIUS:
            if th in themes:
                h2 = theme_heaps[th]
                if len(h2) < EXTRA_QUOTA:
                    heapq.heappush(h2, item)
                elif key > h2[0][0]:
                    heapq.heapreplace(h2, item)
        if n_rows % 500_000 == 0:
            print(f"  đã đọc {n_rows:,} dòng…", file=sys.stderr, flush=True)

    chosen = {}
    for h in band_heaps.values():
        for _, row in h:
            chosen[row[0]] = row
    for h in theme_heaps.values():
        for _, row in h:
            chosen.setdefault(row[0], row)
    rows = sorted(chosen.values(), key=lambda r: (r[3], r[0]))
    print(f"Đã đọc {n_rows:,} dòng, chọn {len(rows):,} puzzle.", file=sys.stderr)
    if not rows:
        sys.exit("Không chọn được puzzle nào — kiểm tra lại file đầu vào.")

    # ghi ra thư mục tạm rồi đổi tên, để lỗi giữa chừng không làm hỏng bộ cũ
    tmp = OUT + ".new"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    by = {}
    for r in rows:
        by.setdefault(r[3] // 100 * 100, []).append(r)
    buckets = []
    for b in sorted(by):
        fn = f"p-{b:04d}.txt"
        with open(os.path.join(tmp, fn), "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(",".join([r[0], r[1], r[2], str(r[3]), r[4]]) for r in by[b]) + "\n")
        buckets.append({"min": b, "max": b + 99, "n": len(by[b]), "file": fn})
    counts = {t: sum(1 for r in rows if t in r[4].split(" ")) for t in GENIUS}
    idx = {"version": 2, "source": "lichess", "themes": True, "total": len(rows), "genius": GENIUS, "geniusCounts": counts, "buckets": buckets}
    with open(os.path.join(tmp, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(idx, fh, separators=(",", ":"))
    shutil.rmtree(OUT, ignore_errors=True)
    os.rename(tmp, OUT)
    size = sum(os.path.getsize(os.path.join(OUT, x)) for x in os.listdir(OUT)) / 1e6
    print(f"Xong: {len(rows):,} puzzle, {len(buckets)} file, {size:.1f} MB trong thư mục {OUT}/", file=sys.stderr)
    print("Puzzle theo chủ đề thiên tài:", counts, file=sys.stderr)


if __name__ == "__main__":
    main()
