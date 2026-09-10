# qortium-chess

Standard chess for Qortium, played live over fee-less CHAT messages with a
hash-chained, client-verified move protocol (`QCH1`). Successor to the
Qortal-era Q-Chess prototype (protocol `QC1`), redesigned for the Qortium stack.

Published on QDN as `qdn://APP/Chess/Chess` (name `Chess`, identifier `Chess`).
Current version: **1.4.2** (QAVS `1.4` = minimum platform level, `.2` = app counter).

## What the shipped app does

- **Live play over CHAT.** Every protocol message is the `message` string of a
  Qortium CHAT transaction posted to the public Previewnet Chess lobby,
  **group 14** (open membership; posting needs membership, spectating does not).
  `src/transport/qortiumChat.ts` sends through `SEND_CHAT_MESSAGE`, reads through
  `SEARCH_CHAT_MESSAGES` with `FETCH_NODE_API` as the fallback, and follows the
  node chat websocket with a polling safety net.
- **Lobby and game room.** Create an invite (colour choice, optional note), join,
  approve or reject a joiner, move, offer/accept/decline draws, resign, abort
  before ply 2, and chat. Colours for `Random` are resolved deterministically
  from the approve transaction signature.
- **Client-side verification.** `src/protocol/` holds the QCH1 types, envelope
  codec/validation, `major.minor` version gate, and the blake2b-256 hash chain
  with pinned vectors; `src/game/service.ts` applies every receive gate (signer
  equals `from`, ply sequence, legality under the ruleset, both hashes) and
  badges failures instead of mutating state. Moves are lowercase UCI.
- **Local board.** A hot-seat board that needs no account or node.
- **Developers workspace.** `?view=developers` renders the always-English QCH1
  reference (`src/Reference.tsx`); every constant, enum, limit, and example on
  the page is imported from the implementation and pinned by
  `src/reference.test.tsx`. Section links are base-URL safe and scroll only the
  app's own document (`src/ReferenceNavigation.tsx`).
- **Runtime modes.** Inside Home with a selected account: play. With an account
  but no membership: read everything and be offered `JOIN_GROUP`. With no
  account, or outside Home against a local node: spectate and verify.
- **Home 2 display contract.** Theme, accent (ten accents including Home's
  `clay`), text size, UI style (Classic / Modern / Fun) and language from the URL
  params or the `DISPLAY_SETTINGS_CHANGED` / `*_CHANGED` messages; 23 locales in
  `src/locales/`, including the RTL `ar` and `he`. The reference page stays
  `lang="en" dir="ltr"` regardless.

## What is NOT implemented

- **No archive or durability layer.** Finished games are not published to QDN.
  `docs/QCH1-SPEC-DRAFT.md` §6.2 designs a `GAME`-service archive but marks it
  "DESIGNED, NOT IMPLEMENTED": there is no publish path, no fetch path, no
  archive format, and no service or identifier constant in `src/`. A game
  survives only as long as its chat messages do — Core's retention default is
  24 hours and users may change it, so treat the horizon as unknown-but-finite.
- **No private or direct-message games.** Only the group route exists; the
  transport throws for a direct route (spec §6.1).
- **Promotion is always to a queen.** There is no underpromotion picker yet.
- **One ruleset.** Classic chess via chess.js; the J-Chess engine remains a
  future variant ruleset (`docs/ENGINE-AUDIT-2026-07-20.md`).

## Layout

- `src/rules/` — ruleset-agnostic `RulesAdapter` with the classic ruleset on chess.js
- `src/protocol/` — QCH1 types, envelope codec/validation, hash chain
- `src/game/` — `GameService` lifecycle state machine and receive-side gates
- `src/transport/` — transport seam, the live `QortiumChatTransport`, and the
  in-memory hub used by tests
- `src/ui/` — lobby, game room, board, local board
- `src/Reference.tsx`, `src/ReferenceNavigation.tsx` — Developers workspace
- `src/deepLink.ts` — `?view=lobby|local|game|developers[&gameId=…]` routes
  (`developer` and `reference` are read-time aliases of `developers`)
- `src/displaySettings.ts`, `index.html` — Home display contract; the inline
  boot script in `index.html` duplicates the attribute slice on purpose and is
  pinned by `src/bootTheme.test.ts`

## Develop, test, build, publish

```bash
npm ci
npm test        # vitest
npm run build   # tsc + vite; emits dist/ with qortium-app.json + favicon.ico
npm run dev
npm run qdn:publish   # scripts/publish-qdn.mjs, see below
```

`scripts/publish-qdn.mjs` publishes `dist/` as `APP/Chess/Chess` through a
local Previewnet node. It reads the running node's API key from
`~/.config/qortium-core/runtime/apikey.txt` and the publishing account from
`~/qortium/git/qortium-core/preview/secrets/initial-minting-accounts.json`;
every default can be overridden with `QORTIUM_CHESS_*` environment variables
(`NODE_API_URL`, `QDN_NAME`, `QDN_IDENTIFIER`, `QDN_SERVICE`, `DIST_PATH`,
`NODE_API_KEY_PATH`, `PREVIEW_ACCOUNTS_PATH`). Publish only from merged `main`.

## Versioning

Qortium App Versioning Standard (QAVS): `major.minor` is the minimum platform
level the app requires, the patch position is the app counter. Bump the patch
in `package.json` and `package-lock.json` for every republish; `vite.config.ts`
regenerates `dist/qortium-app.json` from it and Home reads that manifest.

## Documents

- [`docs/QCH1-SPEC-DRAFT.md`](docs/QCH1-SPEC-DRAFT.md) — protocol and app design
  draft (decision log in §11; §6.2 archives and §6.1 private games are design only)
- [`docs/ENGINE-AUDIT-2026-07-20.md`](docs/ENGINE-AUDIT-2026-07-20.md) — audit of
  the J-Chess engine's classic-chess mode, which drove the rules-engine decision
- [`engine-audit/`](engine-audit/) — reproducible audit harness (probes +
  differential sweep vs chess.js)
