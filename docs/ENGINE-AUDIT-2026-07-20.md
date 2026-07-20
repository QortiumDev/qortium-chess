# J-Chess engine — classic-chess mode audit

**Date:** 2026-07-20
**Auditor:** Claude (Fable 5), session with QuickMythril
**Subject:** `~/games/git/J-Chess` at commit `271bf5b` ("Reconcile J-Chess beta baseline"), `js/logik.js` (~21k lines)
**Question:** Can the J-Chess engine (oxomoa *schach* base + Minecraft variant work) host **standard classic chess** for qortium-chess, headlessly, correctly, today?
**Method:** Static code reading + empirical probes through the public `window.JCH_Autoplay` API (`loadPosition` / `listLegalActions` / `applyAction` / `getGameStatus` / `captureState`), plus a 500-position differential sweep against a chess.js oracle. Harness lives in `engine-audit/` in this repo; the J-Chess repo was not modified.

## Verdict

**Not viable for classic chess without substantial engine work.** The classic-chess path inside J-Chess is vestigial schach remnants: classic armies cannot even be fully constructed (no pawns), game-over semantics do not function for them (no royal), and move legality for classic pieces has several outright bugs. Where the classic path *does* work — base K/Q/R/B/N geometry, headless loading, deterministic action model — it works well: 329 of 500 random sparse positions produced move sets in full agreement with chess.js, and every disagreement traced to the specific defects below.

**Recommendation:** For the classic-only MVP, implement the QCH1 "rules adapter" with **chess.js** (already used here as the oracle) as the classic ruleset engine, and keep the adapter interface shaped so the J-Chess engine can slot in later as the `jchess` ruleset for variant play — its action-object API (`listLegalActions`/`applyAction`/`getGameStatus`) is exactly the right shape and directly informed the adapter design. Fixing classic mode inside logik.js is possible but is effectively "write a classic chess engine inside a 21k-line variant codebase" (findings F1–F9 all need fixing); that effort is better spent only if/when J-Chess multiplayer itself is on the roadmap.

## Findings

### F1 — Classic armies cannot be constructed (blocker)
`positionSpec` piece vocabulary (`pieceTypeFromString`, logik.js ≈18563–18606) has `KING/QUEEN/ROOK/BISHOP/KNIGHT` but **no `PAWN`**. The `Bauer` class exists (≈12890) but is unreachable from any setup path. Start types are `standard` / `position` / `nether` (≈21056) — there is no classic start preset, and the J-Chess standard start uses Zombies as pawn replacements.

### F2 — No royal ⇒ no game-over semantics (blocker)
Only piece type `"r"` (PLAYER) is registered as royal at placement (`placePiece`, ≈18748–18751). A classic KING is never royal, so with classic-only armies `karr_royalFigur` stays null and `getGameStatus()` immediately returns `{"status":"royal-dead","winner":"black"}` — game already "over", wrong winner, and checkmate/stalemate detection (which is royal-based, ≈4580–4623) can never fire. There is no positionSpec flag to designate a royal.

### F3 — Pins and discovered check not enforced for classic pieces
Full king-safety filtering ("after king-safety filtering" per the autoplay docs) applies to the PLAYER royal, not classic kings. Non-king classic pieces move freely out of absolute pins. Empirical: fixture wKe1 / wRe4 / bQe8 / bKa8 — the pinned rook is offered 7 moves off the e-file (smoke3.js). The 500-position sweep found **1,949** engine moves that chess.js rejects for king-safety reasons.

### F4 — Threat rays stop at the king ⇒ king retreats along the check ray
`bedrohungslage` field-threat marking treats the king as opaque, so squares *behind* the king on a checking ray are unmarked and the king may step backward along the ray, remaining in check. Minimal fixture: bKg7 checked by wRd7 → `g7-h7` is offered (illegal). This is the classic naive-threat-computation pitfall (king must be transparent to enemy sliding rays during evasion generation).

### F5 — King cannot capture an adjacent checker
Minimal fixture: bKb2, adjacent undefended wQb1 (wKh8 far away) → legal replies must include `b2xb1`; the engine offers only `a3, b3, c3` (and `b3` is itself illegal per F4). Capturing the adjacent checking piece is never generated. Every "missing move" case in the sweep was either this or F6 corruption.

### F6 — Castling: never offered, and enumeration corrupts the board
`zugPruefenKoenig` (≈10495; castle branch ≈10530) is shared by PLAYER and classic Koenig. With unmoved wKe1 + wRa1/wRh1, no castle action (`e1-c1`/`e1-g1`) is ever emitted — and worse, merely calling `listLegalActions()` **trial-moves the corner rooks to their castled squares (a1→d1, h1→f1) and never restores them** (smoke3/smoke4: `captureState` shows rooks placed correctly at a1/h1, but generated moves originate from d1/f1). Legal-action enumeration is state-mutating and non-reentrant whenever an unmoved king probes c/g-file back-rank targets with an unmoved corner rook. This corruption also polluted sweep positions containing home-square rooks.

### F7 — En passant commented out (and pre-existing bug)
The en-passant branch in `zugPruefenBauer` is entirely commented out (≈11841–11871). Even as written it indexed `karr_felder` by x-coordinate (`karr_felder[this.int_xPos+1]`) instead of board index, and mixed `.figur`/`.obj_figur` property names — it never worked. The `bol_doppelzug` flag is still set but never consumed.

### F8 — Classic promotion is dead code
`k_bauerTausch` (≈7959) implements Zombie→Skeleton and Piglin→Brute promotion; the classic Bauer (`"b"`) branch only calls `zeigeMeldung` (shows a message) — no piece exchange, no under-promotion choice. Moot today given F1, but must be built if classic pawns are added.

### F9 — No draw machinery
No threefold-repetition, fifty-move, or insufficient-material logic exists anywhere in logik.js (grep: `fifty|threefold|repetition` → no rule code). Stalemate detection exists but is royal-gated (F2). Draw by agreement is a UI/protocol concern, but claim validation needs engine support.

### F10 — No standard interchange formats
No FEN and no SAN anywhere; positions serialize as positionSpec JSON, moves as action objects. `formatActionNotation` renders classic pieces as `?` (its runtime code map lacks classic entries; a separate K/Q/R/B/N label map at ≈13482 serves another subsystem). Fine for J-Chess, but classic games need SAN/PGN at least at the archive layer for portability.

## What the engine gets right (why it stays on the roadmap)

- **Headless operation is real and easy**: `cli/autoplay.js` loads logik.js in Node with stub `window`/`document`; all probes here ran that way.
- **Determinism**: RNG (mulberry32) is confined to CPU-policy/autoplay layers; rules are deterministic given chosen actions — the property a hash-chained multiplayer protocol needs.
- **API shape**: `listLegalActions()` / `applyAction()` / `getGameStatus()` / `captureState()`/`restoreState()` is precisely the rules-adapter contract QCH1 wants; the QCH1 adapter interface is modeled on it so J-Chess can become the second ruleset without redesign.
- **Base geometry sound**: outside F3–F6 situations, K/Q/R/B/N move generation matched chess.js exactly (329/500 positions in full agreement, 0 crashes).

## Differential sweep summary

`engine-audit/differential.js` — 500 seeded random sparse positions (2 kings + 2–5 of Q/R/B/N; kings off e1/e8 to reduce F6 noise), engine move set vs chess.js:

| metric | count | attribution |
| --- | --- | --- |
| positions in full agreement | 329/500 | — |
| engine crashes | 0 | — |
| missing (oracle-legal, engine absent) | 57 | F5 (adjacent-checker captures) + F6 (corrupted rook origins) |
| extra, geometry-impossible per oracle | 166 | F4 (retreat along check ray, incl. king moves misclassified by the harness' pseudo-legal trick) + F6 artifacts |
| extra, king-safety-illegal | 1,949 | F3 (pins / ignoring check) |

## Reproduction

```bash
cd engine-audit
npm install          # chess.js oracle only
node smoke1.js       # status/royal-dead + castle absence (F2, F6 surface)
node smoke2.js       # placement round-trip fidelity
node smoke3.js       # decoded castle/check/pin probes (F3, F6)
node differential.js 500
```
Scripts point at `~/games/git/J-Chess/js/logik.js` (read-only).

## Cost sketch: fixing classic mode in logik.js (if ever desired)

Roughly in dependency order: PAWN placement + classic start preset (F1); royal designation for KING + status rework (F2); threat-ray transparency + adjacent-checker capture (F4, F5); full legality filter for classic pieces (F3); castling as a real emitted action with side-effect-free enumeration (F6); en passant rebuilt (F7); promotion UI+engine (F8); draw rules (F9); FEN/SAN (F10). Each is testable against the chess.js oracle with the harness here. This is meaningful work across the hottest paths of a 21k-line file — worthwhile only as part of a deliberate J-Chess-multiplayer investment, not as a prerequisite for classic qortium-chess.
