# qortium-chess

Standard chess for Qortium: live play over fee-less CHAT messages with a hash-chained,
client-verified move protocol (`QCH1`), and finished games published to QDN as portable,
re-validatable archives. Successor to the Qortal-era Q-Chess prototype (protocol `QC1`),
redesigned for the Qortium stack. Target publish: QDN name `Chess` / identifier `Chess`.

**Status: design phase — no app code yet.**

- [`docs/QCH1-SPEC-DRAFT.md`](docs/QCH1-SPEC-DRAFT.md) — protocol & app design draft (under review)
- [`docs/ENGINE-AUDIT-2026-07-20.md`](docs/ENGINE-AUDIT-2026-07-20.md) — audit of the J-Chess
  engine's classic-chess mode, which drove the rules-engine decision (chess.js for classic;
  J-Chess engine reserved as a future variant ruleset)
- [`engine-audit/`](engine-audit/) — reproducible audit harness (probes + differential sweep
  vs chess.js)
