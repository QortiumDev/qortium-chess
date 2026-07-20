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

Size check: 4000-byte CHAT limit; UCI history ≈ 5 B/ply → a 300-ply game ≈ 1.5 KB + envelope ≈ well under budget. Hard guard at 3800 B as in QC1, enforced on **both** sides: the sender's `encodeEnvelope` throws before transmitting, and a receiver badges an over-budget envelope `invalid.oversized`. The receive-side size gate runs only after `app` identifies the payload as ours — a long human chat line is ordinary content, not an oversized envelope — and before schema validation, so a hostile sender cannot make a receiver parse an over-budget record.

### 4.4 Message types

All messages: `{protoTag:"QCH1", protoVersion:"1.0", type, gameId, from}` + per-type fields.

**Version semantics (implemented 2026-07-20, `src/protocol/envelope.ts`):** `protoVersion` is parsed as `major.minor` (grammar `^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`), never compared as an opaque string.

| received version | outcome |
| --- | --- |
| same major, minor ≤ ours | fully valid; validated as this document describes |
| same major, minor **>** ours | **forward-compatible**: known fields are validated normally, unknown fields ignored, message accepted — a 1.0 client keeps playing a 1.1 client |
| different major | rejected with `invalid.versionUnsupported`; never mutates state, whatever the fields look like |
| unparseable (`"1"`, `"1.0.0"`, `"one"`, non-string) | rejected with `invalid.schema`, detail `protoVersion` |

Consequence for evolution: an additive change (new optional field, or a new `type` older clients may ignore) is a **minor** bump; a change that would make an older client misread a record it still accepts must be a **major** bump, since only the major is a hard gate. A newer minor carrying an unknown `type` is still recorded as `invalid.schema` — surfaced, never silently dropped, never state-mutating.

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

Sent as the `message` string of `SEND_CHAT_MESSAGE` (Home stores it as base58 UTF-8 in the tx `data`; 4000-byte cap enforced in `platform.ts`).

**Resolved (was TBD-1), verified against qortium-chat 2026-07-20:** qortium-chat's `unwrapChatTextEnvelope` (`src/chatText.ts`) only recognizes JSON objects carrying a string `message` field; anything else — including our envelope — falls through and is **rendered verbatim as raw JSON text**. There is no machine-message skip convention today. Therefore qortium-chat gets a small companion rule before/alongside chess going live in a shared group: *hide messages that decode to a JSON object with a string `app` field and no string `message` field* (registered machine messages). QCH1 envelopes are shaped to satisfy exactly that rule. Human `chat` messages are sent as ordinary text so all clients show them.

## 5. Validation (receive gates, per `move`)

Inherited from QC1 Part I, adapter-backed, with two envelope-level gates ahead of them: (0a) received envelope within the 3800-byte budget (`invalid.oversized`); (0b) version gate (§4.4 — foreign major → `invalid.versionUnsupported`). Then: (1) envelope shape + schema; (2) signer == `from`; (3) sender is a bound player; (4) game Active; (5) `ply == prev+1`; (6) `prevHash` matches; (7) side-to-move correct; (8) `decodeMove` succeeds and move ∈ `legalMoves` — **now via chess.js, the gate QC1 never implemented**; (9) recomputed `stateHash` matches. Failures annotate the event stream with QC1's badge taxonomy (`invalid.notYourTurn`, `invalid.illegalMove`, `invalid.historyMismatch`, …) and never mutate game state. Duplicate suppression by chat-tx signature.

## 6. Transports

### 6.1 Live play — CHAT (MVP)
- **Public games:** the `Chess` group — **created on Previewnet 2026-07-20: groupId 14**, owner `QaLdnApWW3hps1qXM8cpsL1pVgw7RtyJmN` (the publishing account), open membership, approvalThreshold NONE. Posting requires membership (Core enforces); offer in-app JOIN_GROUP. Spectating needs no membership (search/websocket read).
- **Private / direct-message games — DEFERRED, NOT IMPLEMENTED (decision 2026-07-20).** Out of scope for now: `QortiumChatTransport.send` throws `Direct-message games are not implemented yet.` for any non-group route, and `fetch`/`subscribe` return empty for them. The intended future shape is Qortium's E2E-encrypted direct chat (`SEND_CHAT_MESSAGE` + `SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES` family) — a real upgrade over QC1's plain DMs — but nothing in this document about private games describes behaviour that exists today. The `Route` seam is in place so adding it later needs no protocol change.
- **Bridge actions actually used:** `SEND_CHAT_MESSAGE`, `SEARCH_CHAT_MESSAGES`, `FETCH_NODE_API` (backlog fallback + group membership lookup), `JOIN_GROUP`, `GET_SELECTED_ACCOUNT`, `SHOW_ACTIONS`, `WHICH_UI`. Live updates via node websocket `/websockets/chat/messages` (pattern proven in qortium-chat) with search-polling fallback. **Correction:** earlier drafts listed `GET_HOST_INFO` here — the app never calls it. It is referenced only as the QAVS host-level mechanism (§8): a host advertises its platform level via `GET_HOST_INFO`, and the app's `qortium-app.json` version must respect the ≤ rule. Private-chat search/key actions are likewise not used (see the deferred item above). QDN publish/fetch/search belong to §6.2 and are not implemented yet either.
- Expiry: chat retention is **user-configurable**; 24 h is only the default. This is a newer Qortium feature that did not exist when the original q-chess `QC1` spec was written — QC1 could assume a flat 24 h horizon, QCH1 cannot. A client must therefore treat retention as unknown-but-finite rather than as a fixed 24 h clock: the QC1-style "expires in ~HH:MM" readout is a hint derived from the default, not a guarantee. An in-progress game older than the node's retention is simply gone from live view — but see 6.2.

### 6.2 Durability — QDN archives & saves (MVP)
On terminal state — **and at any earlier point, as a "save"** — either/both players (spectators optionally) publish a **game archive**:
- Identifier: `chess-game-<gameId>`; service: **`GAME` (1500)** — resolved (was TBD-3) from Core's `Service.java`: `JSON` (1110) validates content but caps at 25 KB single-file, which long archives with embedded envelopes can exceed; `GAME` is purpose-named, size-unlimited, multi-file capable. Trade-offs accepted: no Core-side JSON validation (clients validate) and no private variant (archives are public; private-game players who want secrecy simply don't publish).
- Content: `{meta:{players,ruleset,result,reason,dates}, history:[uci], pgn, finalStateHash, envelopes:[...full protocol messages...], txSignatures?:[...chat tx signatures where retrievable...]}`.
- Any client can re-validate an archive offline by replaying history through the adapter and re-deriving the hash chain. Archives from both players that agree on `finalStateHash` make the result effectively co-signed (each QDN publish is signed by its name owner). Ratings, profiles, and history views (§10.3) all read archives via `SEARCH_QDN_RESOURCES`.
- **Mid-game saves — in MVP (resolved, was TBD-4):** a player may publish the same format with `terminal:null` at any time ("save game"). Because the identifier is `chess-game-<gameId>`, re-saving the same match **updates in place** (same name+service+identifier = QDN update); different matches get distinct identifiers, so a player naturally accumulates one save per game. Save management UI (list/delete old saves) is a later addition. Resuming = re-validating the save and continuing the hash chain from its history.

### 6.3 Later — MESSAGE-tx correspondence & AT wagers (designed-for, not MVP)
- Correspondence mode: same envelope, one move per on-chain MESSAGE tx (4000 B, fee-less via mempow nonce). Blocked on send capability for apps: no `SEND_MESSAGE` bridge action exists in Home today; needs either a new bridge action (ship app-half first, per host/app protocol ordering) or client-side build/sign via `FETCH_NODE_API`.
- Wagers: escrow AT per the qortium-casino `FaucetV0` "sleep-until-MESSAGE, verify sender, pay out" pattern; payout on a result message referencing the archive. Requires the correspondence plumbing plus AT deploy capability. Explicitly out of MVP.

## 7. Lifecycle

QC1's state machine, kept: `Pending —join→ AwaitingApproval —approve→ Active —(mate/draw/resign)→ Terminal`, with `cancelInvite`/`reject` edges, plus the new abort restriction (§4.4) and auto-draw terminals. Color resolution: creator's choice or, for Random, derived from `blake2b(gameId || approveSignature)` low bit — deterministic for all observers rather than QC1's "creator's local RNG" (which spectators couldn't verify).

**Resolved in code 2026-07-20 (was the last flagged item).** `resolveColors` in `src/game/service.ts` uses the **chat-message signature of the `approve` message**, which every observer already holds: it arrives on the same `IncomingChat` record that carries the approve, from both the websocket and the search fallback, so a spectator derives the identical assignment. The proposed "fallback = low bit of gameId" was never needed and is **not** implemented — a gameId fallback would also be weaker, since the creator picks the nonce and could grind a gameId for a preferred colour. Covered by the "resolves Random colors identically on every client" lifecycle test across creator, joiner, and spectator services.

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

## 11. Decision log (formerly open questions)

All original open questions were answered by QuickMythril on 2026-07-20; decisions folded into the sections above:

1. **TBD-1 → resolved (§4.5):** qortium-chat renders our JSON as raw text today; add the machine-message skip rule (`app` field + no string `message`) to qortium-chat before/alongside public go-live.
2. **TBD-2 → resolved (§6.1):** the `Chess` group is owned by the publishing account; created 2026-07-20 as **groupId 14** (open, threshold NONE).
3. **TBD-3 → resolved (§6.2):** archive service = `GAME` (1500); `JSON`'s 25 KB cap is too tight.
4. **TBD-4 → resolved (§6.2):** mid-game saves in MVP; same-match saves update in place via the `chess-game-<gameId>` identifier; save-management UI later.
5. **Auto-draw → accepted** where appropriate (§4.4 stands).
6. **Spectator chat → allowed** from MVP with per-user local ignore (chat is public anyway).
7. **First release = 1.4.0** under QAVS (matters only once new Home/Core capabilities are used).
8. **§7 colour resolution → resolved in code (2026-07-20):** the approve chat-message signature is available to every observer; `resolveColors` uses it and the gameId fallback was never needed and is not implemented. Removed from the open list.
9. **Version gate → implemented (2026-07-20, §4.4):** `protoVersion` parsed as `major.minor`; same-major forward-compatible, foreign major `invalid.versionUnsupported`, unparseable `invalid.schema`.
10. **Private/direct-message games → deferred (§6.1):** explicitly out of scope; the transport throws for non-group routes.

No open questions remain in this list. Pending separately (not tracked here): the §6.2 QDN archive decisions.
