# qortium-chess

Standard chess for Qortium: live play over fee-less CHAT messages with a hash-chained,
client-verified move protocol (`QCH1`), and finished games published to QDN as portable,
re-validatable archives. Successor to the Qortal-era Q-Chess prototype (protocol `QC1`),
redesigned for the Qortium stack. Target publish: QDN name `Chess` / identifier `Chess`.

**Status: scaffold — protocol core + local hot-seat board; no networking, not yet published.**

Implemented so far:
- `src/rules/` — ruleset-agnostic `RulesAdapter` with the classic ruleset on chess.js
- `src/protocol/` — QCH1 types, envelope codec/validation, blake2b-256 hash chain (pinned vectors)
- `src/game/` — `GameService`: lifecycle state machine, receive-side validation gates, send actions
- `src/transport/` — transport seam + deterministic `MemoryHub` for tests/dev
- `src/ui/` — local hot-seat board (the real chat transport is the next milestone)

```bash
npm install
npm test        # vitest: rules, hash vectors, full-lifecycle over memory transport
npm run build   # tsc + vite; emits dist/ with qortium-app.json + favicon.ico
npm run dev
```

- [`docs/QCH1-SPEC-DRAFT.md`](docs/QCH1-SPEC-DRAFT.md) — protocol & app design draft (decision log in §11)
- [`docs/ENGINE-AUDIT-2026-07-20.md`](docs/ENGINE-AUDIT-2026-07-20.md) — audit of the J-Chess
  engine's classic-chess mode, which drove the rules-engine decision (chess.js for classic;
  J-Chess engine reserved as a future variant ruleset)
- [`engine-audit/`](engine-audit/) — reproducible audit harness (probes + differential sweep
  vs chess.js)
