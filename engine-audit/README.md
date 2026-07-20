# Engine audit harness

Probes and a differential sweep used for `docs/ENGINE-AUDIT-2026-07-20.md`. All scripts
load `~/games/git/J-Chess/js/logik.js` read-only via the same stub-`window` technique as
J-Chess's own `cli/autoplay.js`.

```bash
npm install          # chess.js oracle
node smoke1.js       # classic positions: status + castle absence
node smoke2.js       # placement round-trip fidelity
node smoke3.js       # decoded castle/check/pin probes
node differential.js 500   # seeded sweep vs chess.js
```

The sweep seed is fixed (`20260720`) so runs are reproducible.
