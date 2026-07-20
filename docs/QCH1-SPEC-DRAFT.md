# QCH1 — Qortium Chess protocol & app design (draft for review)

**Status:** Draft v0.1 — 2026-07-20 — for QuickMythril's review; nothing here is locked.
**Protocol tag:** `QCH1` • **App:** qortium-chess, publish target QDN name `Chess` / identifier `Chess`
**Ancestry:** Revises the Qortal-era Q-Chess `QC1` spec (2025-08); carries over its hash-chain, lifecycle, and transparency model; replaces its SAN canonicalization, Q-Chat envelope coupling, and 24h-only persistence. Engine strategy is driven by `ENGINE-AUDIT-2026-07-20.md`.

---

## 1. Goals & non-goals

**MVP goals**
- Two Qortium users play standard chess over fee-less CHAT messages; public games spectatable live.
- Every protocol message is self-contained: full move history + hash chain, so any client reconstructs and verifies the game from the latest message alone.
- Deterministic validation on every client; invalid messages are surfaced with a reason, never silently dropped.
- **Durable outcomes:** finished games are published to QDN as portable, verifiable archives (this is the big functional gap QC1 left open — everything died at chat expiry).

**Non-goals (MVP)** — time controls/clocks; ratings; wagers; correspondence (on-chain) mode; J-Chess variant play; moderation beyond local ignore. All have designed-for hooks (§10).

## 2. Architecture

Four layers, strictly separated:

```
UI (board, lobby, game room)
  └─ GameService        — lifecycle rules, validation gates, streams
       ├─ RulesAdapter  — pluggable per ruleset (§3)
       └─ Transport     — pluggable per channel (§6): chat (MVP), qdn-archive, later message-tx
```

UI never touches Qortium APIs directly; GameService never contains chess logic; RulesAdapter never knows about transports. (Same seams QC1 planned; they tested well there.)

## 3. Rules adapter

Interface (shaped after J-Chess `JCH_Autoplay`, so its engine can become a second ruleset later without redesign):

```ts
interface RulesAdapter {
  rulesetId: string;                       // "classic" (MVP)
  initialState(): GameState;
  legalMoves(state: GameState): Move[];    // fully legal (check/pin aware)
  apply(state: GameState, move: Move): GameState;      // throws on illegal
  status(state: GameState): Status;        // active | checkmate | stalemate | draw(reason) | ...
  encodeMove(move: Move): string;          // canonical wire string (§4.2)
  decodeMove(s: string, state: GameState): Move;
  snapshot(state: GameState): string;      // display/preview form (FEN for classic)
  toPGN?(history: string[], meta): string; // archive layer, classic only
}
```

**Classic ruleset = chess.js (^1.4.0).** Decision per the engine audit: the J-Chess engine cannot host classic chess today (no pawns placeable, no royal semantics for kings, pin/ray/castling/en-passant/promotion/draw defects — see audit F1–F10), while chess.js passed as our differential oracle and provides legality, SAN/FEN/PGN, and full draw detection in one small battle-tested dependency (bundled, not CDN). The J-Chess engine remains the intended `jchess` ruleset when variant multiplayer becomes a goal (§10.4).

## 4. Protocol

### 4.1 Identifiers
- `gameId = blake2b-256(creatorAddress || nonce)[:16 bytes, hex]`; `nonce` = 16 random bytes hex, carried in the invite (kept from QC1 — deterministic for all observers).
- `from` = sender address; must equal the CHAT transaction signer (checked on receive).
- Chat-message timestamps drive UI only (ordering display, expiry countdown), never validity.

### 4.2 Canonical move encoding — UCI, not SAN
Moves on the wire are lowercase UCI coordinate form: `e2e4`, `e7e8q` (promotion suffix `q|r|b|n`), castling as king move `e1g1`/`e1c1`. **Change from QC1**, which hashed canonicalized SAN and needed a page of normalization rules plus hand-rolled test vectors. UCI is already canonical (one string per move, no check/mate/disambiguation decoration), trivially validated, and ruleset-agnostic enough for future variants (a J-Chess action can define its own canonical string under the same contract). SAN is derived for display; PGN only at the archive layer.

### 4.3 Hash chain
- `statePayload = {"protoTag":"QCH1","ruleset":"classic","gameId":..., "players":{"white":addr,"black":addr},"history":[...uci...],"terminal":null|{"result":"1-0|0-1|1/2-1/2","reason":...}}`
- Serialization: UTF-8, minified JSON, keys in exactly the order above; `players` ordered white,black.
- `stateHash = blake2b-256(serialized)` hex lowercase (`@noble/hashes`, as in QC1).
- Every `move` message carries `ply`, `move` (UCI), full `history`, `prevHash` (last accepted stateHash), `stateHash` (after this move). Ply-1 `prevHash` is the hash of the empty-history payload.
- Terminal messages (`resign`, result records) reference the last accepted `stateHash` and the terminal-payload hash.

Size check: 4000-byte CHAT limit; UCI history ≈ 5 B/ply → a 300-ply game ≈ 1.5 KB + envelope ≈ well under budget. Hard guard at 3800 B as in QC1.

### 4.4 Message types

All messages: `{protoTag:"QCH1", protoVersion:"1.0", type, gameId, from}` + per-type fields.

| type | fields | rules |
| --- | --- | --- |
| `invite` | `nonce`, `ruleset`, `colorChoice(White\|Black\|Random)`, `isPublic`, `note?` | one open invite per creator (client-enforced, as QC1) |
| `cancelInvite` | — | creator only, pre-approve |
| `join` | — | game Pending, `from` ≠ creator |
| `approve` / `reject` | `opponent` | creator only; one `approve` binds players, resolves colors, → Active |
| `move` | `ply`, `move`, `history`, `prevHash`, `stateHash`, `fen?` | all gates in §5 |
| `drawOffer` / `drawAccept` / `drawDecline` | `atPly` | players only, game Active; accept must reference a live offer |
| `resign` | `prevHash` | players only, Active |
| `abort` | `prevHash` | **players only, and only while `history.length < 2`** — change from QC1, where unilateral abort at any time let a losing player kill the game. After both sides have moved, only resign or draw ends a game early. |
| `chat` | `text` | never affects state; spectators allowed on public games |

**Draw termination (simplification, flagged for review):** stalemate, insufficient material, 50-move, and threefold are **auto-terminal** the moment the adapter reports them (chess.js `isDraw` semantics) — both clients agree deterministically, and no claim messages exist. This deviates from FIDE's claim-based 50-move/threefold (where players may play on), in exchange for protocol simplicity. If we want FIDE semantics later, a `claimDraw` type slots in cleanly.

### 4.5 Envelope
Own compact JSON, **no Q-Chat coupling** (QC1's `version:3` / ProseMirror / `specialId` mimicry is dropped — that was Qortal-Hub internals):

```json
{"app":"chess","qch1":{ ...message... }}
```

Sent as the CHAT message data. **TBD-1:** the convention for machine-only chat messages on Qortium — what qortium-chat renders vs skips — needs to be checked against qortium-chat's parser and, if necessary, agreed as a platform convention (e.g. skip messages whose payload parses to JSON with a registered `app` key). Human `chat` messages are ordinary text so generic clients show them.

## 5. Validation (receive gates, per `move`)

Inherited from QC1 Part I, adapter-backed: (1) envelope shape + schema; (2) signer == `from`; (3) sender is a bound player; (4) game Active; (5) `ply == prev+1`; (6) `prevHash` matches; (7) side-to-move correct; (8) `decodeMove` succeeds and move ∈ `legalMoves` — **now via chess.js, the gate QC1 never implemented**; (9) recomputed `stateHash` matches. Failures annotate the event stream with QC1's badge taxonomy (`invalid.notYourTurn`, `invalid.illegalMove`, `invalid.historyMismatch`, …) and never mutate game state. Duplicate suppression by chat-tx signature.

## 6. Transports

### 6.1 Live play — CHAT (MVP)
- **Public games:** a dedicated Previewnet group (create `Chess` group; id TBD-2 — QC1's Qortal group 853 does not transfer). Posting requires membership (Core enforces); offer in-app JOIN_GROUP. Spectating needs no membership (search/websocket read).
- **Private games:** Qortium's E2E-encrypted direct chat (`SEND_CHAT_MESSAGE` + `SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES` family) — a real upgrade over QC1's plain DMs: private games are actually private.
- **Bridge actions used (all exist in Home today):** `SEND_CHAT_MESSAGE`, `SEARCH_CHAT_MESSAGES`, private-chat search/key actions, `GET_HOST_INFO`, `JOIN_GROUP`, QDN publish/fetch/search (§6.2). Live updates via node websocket `/websockets/chat/messages` (pattern proven in qortium-chat) with search-polling fallback.
- Expiry: chat retention is node-configurable, default 24 h. UI shows the QC1-style "expires in ~HH:MM" from the latest valid message. An in-progress game older than retention is simply gone from live view — but see 6.2.

### 6.2 Durability — QDN archives (MVP)
On terminal state, either/both players (spectators optionally) publish a **game archive**:
- Identifier: `chess-game-<gameId>`; service/format: JSON document (boards-pattern publish; exact service TBD-3).
- Content: `{meta:{players,ruleset,result,reason,dates}, history:[uci], pgn, finalStateHash, envelopes:[...full protocol messages...], txSignatures?:[...chat tx signatures where retrievable...]}`.
- Any client can re-validate an archive offline by replaying history through the adapter and re-deriving the hash chain. Archives from both players that agree on `finalStateHash` make the result effectively co-signed (each QDN publish is signed by its name owner). Ratings, profiles, and history views (§10.3) all read archives via `SEARCH_QDN_RESOURCES`.
- **Mid-game checkpoints** (optional, post-MVP): a player may publish the same format with `terminal:null` to survive chat expiry of long games; resuming = re-posting from checkpoint history. TBD-4.

### 6.3 Later — MESSAGE-tx correspondence & AT wagers (designed-for, not MVP)
- Correspondence mode: same envelope, one move per on-chain MESSAGE tx (4000 B, fee-less via mempow nonce). Blocked on send capability for apps: no `SEND_MESSAGE` bridge action exists in Home today; needs either a new bridge action (ship app-half first, per host/app protocol ordering) or client-side build/sign via `FETCH_NODE_API`.
- Wagers: escrow AT per the qortium-casino `FaucetV0` "sleep-until-MESSAGE, verify sender, pay out" pattern; payout on a result message referencing the archive. Requires the correspondence plumbing plus AT deploy capability. Explicitly out of MVP.

## 7. Lifecycle

QC1's state machine, kept: `Pending —join→ AwaitingApproval —approve→ Active —(mate/draw/resign)→ Terminal`, with `cancelInvite`/`reject` edges, plus the new abort restriction (§4.4) and auto-draw terminals. Color resolution: creator's choice or, for Random, derived from `blake2b(gameId || approveTxSignature)` low bit — deterministic for all observers rather than QC1's "creator's local RNG" (which spectators couldn't verify). **(flagged: verify approve-tx signature is available to all observers at approve time; fallback = low bit of gameId.)**

## 8. App packaging

- Vite + TypeScript + React QDN app per current qortium app conventions (qortium-qdn-app-builder patterns); Classic/Modern uiStyle support.
- `qortium-app.json` + QAVS: first release versions as **1.4.0** (platform level 1.4, app counter 0) unless platform level moves first; respects `GET_HOST_INFO` ≤ rule.
- `favicon.ico` in the published bundle (Home tile).
- Repo `qortium-chess` (this repo). Publish only from merged main; QDN name `Chess` must be registered on Previewnet before first publish; single-owner account → serialized publishes.

## 9. Testing plan

- **Adapter/protocol:** hash-chain vectors (regenerate QC1-style fixture tables for UCI payloads); envelope JSON-schema fixtures (pass/fail, QC1 Part J style); full-lifecycle tests over a memory transport (QC1's `MemoryTransport` seam worked well — rebuild it small).
- **Engine trust:** chess.js is upstream-tested; our tests cover the adapter contract (encode/decode round-trip, auto-draw mapping, terminal reasons).
- **Integration:** two headless clients over a mock chat transport playing a scripted game incl. draw offer, invalid-move injection, duplicate/replay injection, abort-window enforcement.
- **Live smoke:** Previewnet group, two accounts, one full game + archive publish + archive re-validation.

## 10. Future hooks

1. **Clocks/time controls** — new envelope fields + per-move deadline semantics; needs abandonment adjudication design.
2. **Correspondence mode** (§6.3) and **wagers** (§6.3).
3. **Ratings/leaderboards** — computed client-side from QDN archives (deterministic Elo/Glicko over verifiable games); no server.
4. **J-Chess ruleset** — `rulesetId:"jchess"` behind the same adapter; engine work per audit §"cost sketch" plus a canonical action-string encoding; protocol needs zero structural change (that's why moves are opaque strings).
5. **FIDE-style draw claims** — `claimDraw` message if auto-draw proves unpopular.

## 11. Open questions for QuickMythril

1. **TBD-1** Machine-message convention: is a JSON `{"app":...}` payload already skipped by qortium-chat, or do we add that rule to qortium-chat first?
2. **TBD-2** Public lobby group: create as `Chess` on Previewnet under which account? Open or approval-gated membership?
3. **TBD-3** QDN archive service type: plain JSON under an existing service vs. a dedicated service name — preference?
4. **TBD-4** Are mid-game QDN checkpoints wanted in MVP, or is "games must finish within chat retention" acceptable initially?
5. Auto-draw simplification (§4.4) acceptable, or FIDE claim semantics from day one?
6. Spectator game-chat on public games: allowed from MVP (QC1 said yes, with per-user local ignore) — still the call?
7. First-release version: confirm 1.4.0 under QAVS at time of first publish.
