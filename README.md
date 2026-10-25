# ♞ Nyra Chess

**A browser chess app powered by a custom C++ engine, compiled to WebAssembly and running entirely in your browser.**

Nyra Chess is a self-contained chess application: the board UI is plain HTML/CSS/JavaScript, and the opponent is a chess engine written from scratch in C++ (alpha-beta search with PVS, LMR, null-move pruning, a transposition table and a tapered evaluation) that ships as a 326 KB WebAssembly module and executes in a Web Worker.

No build step, no bundler, no framework — the whole app is a static site.

> **Live demo →** https://uyen11a1-star.github.io/nyra-chess/

---

## Table of contents

- [Highlights](#highlights)
- [Quick start](#quick-start)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [The engine (C++)](#the-engine-c)
- [WebAssembly build](#webassembly-build)
- [REST API](#rest-api)
- [Game review](#game-review)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)
- [Credits](#credits)
- [License](#license)

---

## Highlights

- **Engine in the browser.** The C++ engine is compiled to WASI WebAssembly and runs in a Web Worker, so the UI never blocks and no server round-trip is needed for normal play.
- **Automatic API fallback.** If the WebAssembly module cannot be loaded, the app transparently falls back to the hosted REST engine.
- **Opening book.** The engine plays book moves from an embedded opening database before searching.
- **Pondering.** The server-side engine keeps searching the opponent's reply while you think.
- **Vietnamese interface.** The entire UI is in Vietnamese.
- **Clocks and time controls.** Unlimited, 3 min, 3 min + 2 s, 5 min, 10 min (default), with pause, undo and board flip.
- **Nyra Arena.** Two engines play a match on a dedicated board: Nyra, Stockfish 19 (runs locally in WebAssembly, real `UCI_Elo` 1320–3190) or a random bot. Per-side Elo and think-time are adjustable, colours alternate every game, paired random openings, live score + Elo-difference estimate with 95% interval, PGN export, and a clean “video mode” for screen recording.
- **Game review.** Analyse a finished game move by move: win-percentage graph, per-side accuracy, and a move classification from *brilliant* to *blunder*.
- **One-command deploy.** Pushing to `main` publishes the site to GitHub Pages automatically.

---

## Quick start

The app uses ES modules, Web Workers and `fetch()` for the `.wasm` file, so it **must be served over HTTP** — opening `index.html` via `file://` will not work.

```bash
git clone https://github.com/uyen11a1-star/nyra-chess.git
cd nyra-chess
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

Any static file server works:

```bash
npx serve .
# or
php -S localhost:8080
```

**Requirements:** any modern browser (WebAssembly + Web Workers). Node.js is only needed to serve the files locally.

---

## Project structure

```
nyra-chess/
├── index.html            # App shell: 4 tabs, board, clocks, side panel
├── app.js                # Main application: board rendering, input, clocks, review UI
├── arena.js              # Nyra Arena: match loop, own board, Elo settings, score/Elo estimate
├── stockfish-client.js   # Stockfish (WASM Worker) wrapper using UCI_LimitStrength + UCI_Elo
├── stockfish/            # Stockfish 19 lite single-thread build (GPL-3.0, see Copying.txt)
├── style.css             # Dark + gold theme, responsive layout
├── nyra-client.js        # Engine transport: WebAssembly first, REST API fallback
├── nyra-worker.js        # Classic Web Worker that hosts the WASM engine
├── nyra-wasi.js          # Minimal hand-written WASI shim (no Emscripten needed)
├── nyra.wasm             # The compiled C++ engine (WASI target)
├── nyra-review.js        # Post-game analysis engine
└── .github/workflows/
    └── deploy.yml        # GitHub Pages auto-deploy
```

The matching engine server lives in a separate repository: **[nyra-chess-api](https://github.com/uyen11a1-star/nyra-chess-api)**.

---

## Architecture

```
                        ┌──────────────────────────┐
  Play tab ────────────►│      nyra-client.js      │
                        └────────────┬─────────────┘
                                     │
                   ┌─────────────────┴─────────────────┐
                   │ 1. local (preferred)              │ 2. remote (fallback)
                   ▼                                   ▼
        ┌────────────────────┐              ┌──────────────────────┐
        │  nyra-worker.js    │              │ POST /move           │
        │  └─ nyra.wasm      │              │ nyra-chess-api       │
        │     (C++ engine)   │              │ (C++ + cpp-httplib)  │
        └────────────────────┘              └──────────────────────┘
                   │                                   │
                   └─────────► JSON ───────────────────┘
                                │
                                ▼
                        chess.js board state
                                │
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                        ▼
    Play tab              Nyra Arena              History tab
    (vs engine)         (engine vs engine)         (nyra-review.js)
```

### 1. Browser layer (this repository)

| File | Responsibility |
| --- | --- |
| `index.html` | Layout and tab structure; no logic. |
| `app.js` | Board rendering, square selection, legal-move highlighting, clocks, review rendering. |
| `arena.js` | Arena UI and match loop (alternating colours, paired openings, adjudication at 150 moves, score + Elo estimate, PGN). |
| `stockfish-client.js` | Runs `stockfish/stockfish-19-lite-single.js` in a Worker and talks UCI; sets `UCI_LimitStrength` / `UCI_Elo` per side. |
| `nyra-client.js` | Decides *how* to reach the engine. Exposes `getNyraMove(fen, legalMoves, apiUrl, timeMs)` and `hasLocalNyra()`. |
| `nyra-worker.js` | Classic Web Worker. Fetches `nyra.wasm`, instantiates it, and exposes `nyra_move` / `nyra_analyze` over a simple message protocol. |
| `nyra-wasi.js` | A ~30-line WASI implementation. The engine's only imports are the ten `wasi_snapshot_preview1` functions listed below, all of which are provided here. |
| `nyra-review.js` | Runs the game, analyses every position with the engine and classifies each move. |
| `nyra.wasm` | The engine binary. |

### 2. Engine server (`nyra-chess-api`)

| File | Responsibility |
| --- | --- |
| `nyra_server.cpp` | The engine (search + evaluation + opening book) and an HTTP server built on `cpp-httplib`. |
| `build.sh` | Downloads the two header-only dependencies and compiles the server. |

### Worker protocol

```js
// request
worker.postMessage({ id, fen, timeMs, type: "move" | "analyze" });

// response
{ id, result: { ...engine json... } }
{ id, error: "message" }
```

Engine JSON returned by `nyra_move`:

```json
{
  "uci": "e2a6",
  "search": { "depth": 14, "time_ms": 1682, "nodes": 1933325, "score": -117 }
}
```

Engine JSON returned by `nyra_analyze` (used by the review tab):

```json
{
  "best": "e2e4",
  "score": 48,
  "depth": 12,
  "pv": ["e2e4", "e7e6", "d2d4"],
  "legal": 20,
  "second": 15,
  "book": ["e2e4", "d2d4", "g1f3", "c2c4"]
}
```

`score` is expressed in centipawns from the point of view of the side to move; `±100000` encodes a forced mate.

---

## The engine (C++)

`nyra_server.cpp` is a from-scratch engine built on the header-only
[Disservin/chess-library](https://github.com/Disservin/chess-library) for board representation and move generation.

### Search

- **Iterative deepening** with a hard time limit (default 2 000 ms) and a soft limit (1 300 ms) that stops the next iteration from starting too late.
- **Principal Variation Search** — non-PV moves are searched with a null window and re-searched on a fail-high.
- **Aspiration windows** at the root, widened progressively on failure.
- **Null-move pruning** (`R = 3 + depth / 4`) when the static evaluation is high enough.
- **Reverse futility pruning** for shallow non-PV nodes.
- **Late move pruning** and **futility pruning** for late quiet moves.
- **Late move reductions** with a reduction table, adjusted for PV nodes, killer moves and history score.
- **Quiescence search** for captures and promotions, avoiding horizon effects.
- **Transposition table**: 2²⁰ entries (~24 MB) with exact/lower/upper bounds and mate-score correction.
- **Killer moves** (2 per ply) and a **history heuristic** for move ordering.
- Move ordering: TT move → PV move → captures (MVV/LVA with a bad-capture penalty) → promotions → killers → history.
- Draw detection: fifty-move rule, insufficient material and repetition.

### Evaluation

A **tapered** evaluation that interpolates between a middlegame and an endgame score using the game phase:

- material + piece-square tables (king, queen, rook, bishop, knight, pawn),
- piece mobility for knights, bishops, rooks and queens,
- passed pawns, isolated pawns and defended pawns,
- rook and bishop pair bonuses, and rooks on open/semi-open files,
- king safety: pawn shield, open files near the king, and an attack-weighted king danger term,
- endgame terms: king activation and centralisation, and a "no pawns left" draw-ish scaling.

### Opening book

An embedded opening database is consulted before every search. A legal book move is picked at random among the candidates, and the response is tagged with `"method": "Opening Book"`. The book key ignores the en-passant square and the half-move counter.

### Pondering

After answering a move, the server starts a background search on the resulting position (up to 20 s) so the reply is already available when the opponent moves. The search is cancelled when a new request arrives.

### Engine configuration

All values are compile-time constants in `nyra_server.cpp`, except where noted:

| Constant | Default | Meaning |
| --- | --- | --- |
| `TIME_LIMIT_MS` | 2000 | Hard limit per move. |
| `SOFT_LIMIT_MS` | 1300 | Do not start a new iteration past this point. |
| `MAX_DEPTH` | 64 | Maximum search depth. |
| `MAX_PLY` | 96 | Maximum search ply. |
| `TT_BITS` | 20 | Transposition table size (2²⁰ entries). |
| `PONDER_LIMIT_MS` | 20000 | Maximum pondering time. |
| `PORT` | 8081 | Listening port (environment variable). |
| `NYRA_TIME_MS` | — | Overrides the time limit (environment variable, min. 50 ms). Useful for testing. |
| `NYRA_PONDER_MS` | — | Overrides the pondering limit (environment variable, 0 disables it). |

---

## WebAssembly build

The engine is compiled to a **WASI** target and exposes a tiny C API. The module imports exactly ten WASI functions and no other runtime:

```
wasi_snapshot_preview1::environ_get          wasi_snapshot_preview1::environ_sizes_get
wasi_snapshot_preview1::clock_time_get        wasi_snapshot_preview1::fd_close
wasi_snapshot_preview1::fd_prestat_get        wasi_snapshot_preview1::fd_prestat_dir_name
wasi_snapshot_preview1::fd_seek               wasi_snapshot_preview1::fd_write
wasi_snapshot_preview1::proc_exit             wasi_snapshot_preview1::random_get
```

`nyra-wasi.js` implements them directly, so the project needs **no Emscripten toolchain and no WASI polyfill package** — the browser build is just a `.wasm` file plus a 30-line shim.

Exported functions:

| Export | Purpose |
| --- | --- |
| `nyra_init()` | Initialises the engine (magic tables, opening book). |
| `nyra_move(fenPtr, timeMs)` | Returns a JSON string describing the chosen move. |
| `nyra_analyze(fenPtr, timeMs)` | Returns a JSON string with full analysis (best move, score, PV, second-best, book). |
| `nyra_alloc(n)` / `nyra_free(ptr)` | Allocate and free a string buffer in the module's linear memory. |

> **Note:** `nyra.wasm` is committed to the repository as a binary artefact. There is no reproducible WASM build script in the repository yet, so the binary can drift from the C++ source. See [Known limitations](#known-limitations).

---

## REST API

The hosted engine is available at `https://nyra-chess-api.onrender.com`. All responses include `Access-Control-Allow-Origin: *`.

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/` | `{"status":"ok"}` |
| `GET` | `/health` | `{"status":"ready"}` |
| `POST` | `/move` | The engine's move — see below. |

### `POST /move`

**Request**

```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "legal_moves": [
    { "uci": "e2e4", "san": "e4" }
  ]
}
```

`legal_moves` is accepted for convenience but currently ignored — the server regenerates the legal move list itself.

**Response**

```json
{
  "uci": "d2d4",
  "search": { "depth": 0, "method": "Opening Book" }
}
```

or, when the position is not in the book:

```json
{
  "uci": "e2a6",
  "search": { "depth": 14, "time_ms": 1682, "nodes": 1933325, "score": -117 }
}
```

**Example**

```bash
curl -X POST https://nyra-chess-api.onrender.com/move \
  -H 'Content-Type: application/json' \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}'
```

**Errors**

| Status | Body |
| --- | --- |
| `400` | `{"error":"No FEN"}` |
| `500` | `{"error":"Internal Engine Error"}` |

---

## Game review

The **Lịch sử** (History) tab analyses a finished game with the local WebAssembly engine and renders a summary card: a win-percentage graph, the accuracy of each side, and a per-move breakdown.

The analysis math follows Lichess:

- **Win percentage** — the standard logistic curve over centipawn score, clamped to ±1000 cp.
- **Move accuracy** — `103.1668 · e^(−0.04354 · loss) − 3.1669`, where `loss` is the win-percentage drop between the best move and the move played. The engine's top move scores 100 %.
- **Move classification** — Nyra's own thresholds, based on the win-percentage loss, whether the move was the engine's first choice, whether it sacrifices material, and whether it comes from the opening book:

| Class | Icon | Label | Criterion |
| --- | --- | --- | --- |
| `brilliant` | !! | Thiên tài | Near-best move that sacrifices material while keeping the win chance at or above 50 % (and the best line below 85 %). |
| `great` | ! | Rất hay | The engine's first choice, clearly ahead of the second best (≥ 15 % win-percentage gap), with at least 2 legal moves. |
| `best` | ★ | Tốt nhất | The engine's top move, or within 0.5 % of it. |
| `excellent` | ✔ | Rất tốt | Win-percentage loss ≤ 2 %. |
| `good` | ○ | Ổn | Win-percentage loss ≤ 5 %. |
| `book` | ☰ | Sách khai cuộc | The move is present in the engine's opening book. |
| `inaccuracy` | ?! | Thiếu chính xác | Win-percentage loss ≤ 10 %. |
| `mistake` | ? | Sai lầm | Win-percentage loss ≤ 20 %. |
| `blunder` | ?? | Sai lầm nặng | Win-percentage loss > 20 %. |

Reviewing requires the WebAssembly engine — if it cannot be loaded, the app explains that the analysis is unavailable.

---

## Configuration

**Engine endpoint.** The *Engine của bạn* panel in the sidebar contains the API URL used for the remote fallback. It is persisted in `localStorage` under the key `nyraChessEndpoint` and defaults to:

```
https://nyra-chess-api.onrender.com/move
```

**Time control.** The dropdown in the sidebar sets the initial clock:

| Value | Time |
| --- | --- |
| `unlimited` | No clock |
| `180` | 3 minutes |
| `180+2` | 3 minutes + 2 s per move |
| `300` | 5 minutes |
| `600` | 10 minutes (default) |

---

## Deployment

### Web app — GitHub Pages

`.github/workflows/deploy.yml` publishes the repository root to GitHub Pages on every push to `main`:

```yaml
on:
  push:
    branches: ["main"]
  workflow_dispatch:
```

The job checks out the repository, uploads the whole directory as a Pages artefact and deploys it. Because the site is a plain static bundle, **no build command is required** — the deployed root *is* the repository root.

Live at <https://uyen11a1-star.github.io/nyra-chess/>.

### Engine server — Render

Build the server with `build.sh` and start the resulting binary:

```bash
./build.sh          # downloads chess.hpp + httplib.h, then compiles with g++ -O3
./nyra_server       # listens on $PORT (default 8081)
```

`build.sh` currently also downloads the ONNX Runtime archive and the `nyra_net.onnx` weights (the latter requires an `HF_TOKEN` environment variable). The present engine source uses a purely classical evaluation and does **not** call into ONNX Runtime, so those two steps are leftovers from an earlier neural-network version of the engine — removing them makes the build self-contained.

---

## Known limitations

- **The Statistics tab is not wired up yet.** The counters exist in `index.html` but no code updates them, so they always show `0`.
- **The connection indicator is static.** The status label in the header and the dot in the *Engine của bạn* panel never change state.
- **Arena Elo is Stockfish's own scale.** `UCI_Elo` is anchored to CCRL 40/4 and calibrated by Stockfish at 60s+0.6s per game; it is not Chess.com/FIDE Elo, and the supported range is 1320–3190. Very short think times make high settings play weaker than nominal.
- **The Arena runs on its own board**, so it no longer touches the game in the Play tab.
- **`nyra.wasm` is a committed binary.** There is no build script for the WASM target in this repository, so the artefact can drift from the C++ source. A reproducible WASM build is the most valuable next step.
- **Promotion uses a browser `prompt()`** instead of an in-app piece picker.
- **The hosted API is a free instance** and may be slow to answer the first request after a period of inactivity. Normal play is unaffected because the browser runs the engine locally.

---

## Credits

- [chess.js](https://github.com/jhlywa/chess.js) — board state, legal moves and SAN/notation handling.
- [Disservin/chess-library](https://github.com/Disservin/chess-library) — header-only C++ board representation and move generation.
- [cpp-httplib](https://github.com/yhirose/cpp-httplib) — the engine server's HTTP layer.
- [Stockfish](https://stockfishchess.org/) and [Stockfish.js](https://github.com/nmrugg/stockfish.js) (WASM build by Nathan Rugg, GPL-3.0) — the Stockfish opponent in the Nyra Arena, bundled in `stockfish/`.

---

## Related repositories

- **[nyra-chess-api](https://github.com/uyen11a1-star/nyra-chess-api)** — the C++ engine and its HTTP server.

---

## License

This repository does not currently include a `LICENSE` file. All rights reserved by the author.
