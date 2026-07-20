// Differential sweep: J-Chess classic piece movesets vs chess.js oracle.
// Scope: K/Q/R/B/N only (no pawns placeable in the engine), sparse random
// positions, kings kept off e1/e8 to avoid the castling enumeration
// state-corruption bug found in smoke3/smoke4.
//
// Expectation model:
//   - chess.js gives fully legal moves (check/pin aware).
//   - Engine is believed check-aware only for king steps, not pins/blocks.
// So we classify diffs:
//   MISSING  = oracle-legal move the engine does not offer   (geometry/logic bug)
//   EXTRA    = engine move the oracle rejects
//       EXTRA/pin-or-check = oracle rejects only for king-safety reasons (known gap)
//       EXTRA/geometry     = oracle says the piece cannot even pseudo-legally go there (bug)
const { Chess } = require("chess.js");
global.window = {};
global.document = {};
require("/home/user/games/git/J-Chess/js/logik.js");
const A = global.window.JCH_Autoplay;

const FILES = "abcdefgh";
const sq = id => FILES[(id % 10) - 1] + Math.floor(id / 10);
const TYPES = ["QUEEN", "ROOK", "BISHOP", "KNIGHT"];
const FEN_OF = { KING: "k", QUEEN: "q", ROOK: "r", BISHOP: "b", KNIGHT: "n" };

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPosition(rng) {
  // sparse: 2 kings + 2-5 other classic pieces, unique squares, kings not adjacent/not on e1/e8
  const used = new Set();
  function pick(pred) {
    for (let tries = 0; tries < 200; tries++) {
      const f = 1 + Math.floor(rng() * 8), r = 1 + Math.floor(rng() * 8);
      const key = f + "," + r;
      if (used.has(key)) continue;
      if (pred && !pred(f, r)) continue;
      used.add(key);
      return { f, r, coord: FILES[f - 1] + r };
    }
    return null;
  }
  const wk = pick((f, r) => !(f === 5 && r === 1));
  const bk = pick((f, r) => !(f === 5 && r === 8) && (Math.abs(f - wk.f) > 1 || Math.abs(r - wk.r) > 1));
  if (!wk || !bk) return null;
  const pieces = [
    { type: "KING", color: "white", coord: wk.coord },
    { type: "KING", color: "black", coord: bk.coord }
  ];
  const n = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const p = pick();
    if (!p) break;
    pieces.push({ type: TYPES[Math.floor(rng() * TYPES.length)], color: rng() < 0.5 ? "white" : "black", coord: p.coord });
  }
  return pieces;
}

function toFen(pieces, sideToMove) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const p of pieces) {
    const f = FILES.indexOf(p.coord[0]), r = Number(p.coord[1]) - 1;
    let c = FEN_OF[p.type];
    if (p.color === "white") c = c.toUpperCase();
    board[r][f] = c;
  }
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = "", empty = 0;
    for (let f = 0; f < 8; f++) {
      if (board[r][f]) { if (empty) { row += empty; empty = 0; } row += board[r][f]; }
      else empty++;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join("/") + " " + (sideToMove === "white" ? "w" : "b") + " - - 0 1";
}

function engineMoves(pieces, sideToMove) {
  if (typeof A.newGame === "function") A.newGame();
  A.loadPosition({ sideToMove, pieces, smallUnits: [], bows: [], pearls: [], arrows: [] });
  return (A.listLegalActions() || [])
    .filter(a => a.type === "move")
    .map(a => sq(a.fromFieldId) + sq(a.toFieldId));
}

function oracleMoves(fen) {
  const c = new Chess(fen);
  return c.moves({ verbose: true }).map(m => m.from + m.to);
}

function oraclePseudoLegal(fen, from, to) {
  // Is from->to at least pseudo-legal (piece geometry + path), ignoring king safety?
  // Trick: strip the mover's own king off the board and re-ask the oracle.
  const c = new Chess(fen);
  const piece = c.get(from);
  if (!piece) return false;
  const turn = fen.split(" ")[1];
  const kingSq = c.findPiece({ type: "k", color: turn })[0];
  if (piece.type !== "k" && kingSq) c.remove(kingSq);
  try {
    return c.moves({ square: from, verbose: true }).some(m => m.to === to);
  } catch { return false; }
}

const N = Number(process.argv[2] || 500);
const rng = mulberry32(20260720);
let positions = 0, agree = 0;
const missing = new Map(), extraGeom = new Map(), extraSafety = new Map();
let crashes = 0;

for (let i = 0; i < N; i++) {
  const pieces = randomPosition(rng);
  if (!pieces) continue;
  const side = rng() < 0.5 ? "white" : "black";
  const fen = toFen(pieces, side);
  let oc;
  try { oc = new Chess(fen); } catch { continue; } // skip invalid (e.g. side-not-to-move in check is fine for chess.js? keep simple)
  if (oc.isCheck() && oc.turn() !== fen.split(" ")[1]) continue;
  let em, om;
  try { em = new Set(engineMoves(pieces, side)); } catch (e) { crashes++; continue; }
  try { om = new Set(oracleMoves(fen)); } catch { continue; }
  positions++;
  let ok = true;
  for (const m of om) if (!em.has(m)) {
    ok = false;
    const key = "missing " + m + "  fen: " + fen;
    missing.set(key, (missing.get(key) || 0) + 1);
  }
  for (const m of em) if (!om.has(m)) {
    ok = false;
    const from = m.slice(0, 2), to = m.slice(2, 4);
    if (oraclePseudoLegal(fen, from, to)) {
      extraSafety.set("extra(safety) " + m, (extraSafety.get("extra(safety) " + m) || 0) + 1);
    } else {
      const key = "extra(GEOMETRY) " + m + "  fen: " + fen;
      extraGeom.set(key, (extraGeom.get(key) || 0) + 1);
    }
  }
  if (ok) agree++;
}

console.log(`positions compared: ${positions}, full agreement: ${agree}, engine crashes: ${crashes}`);
console.log(`MISSING moves (oracle-legal, engine absent): ${[...missing.values()].reduce((a, b) => a + b, 0)} across ${missing.size} cases`);
for (const [k] of [...missing].slice(0, 12)) console.log("  " + k);
console.log(`EXTRA geometry-impossible moves: ${[...extraGeom.values()].reduce((a, b) => a + b, 0)}`);
for (const [k] of [...extraGeom].slice(0, 12)) console.log("  " + k);
console.log(`EXTRA king-safety-illegal moves (pins / ignoring check): ${[...extraSafety.values()].reduce((a, b) => a + b, 0)} (expected gap)`);
