// Round-trip + castling + check-legality probes for classic pieces
global.window = {};
global.document = {};
require("/home/user/games/git/J-Chess/js/logik.js");
const A = global.window.JCH_Autoplay;

function load(posSpec) {
  if (typeof A.newGame === "function") A.newGame();
  A.loadPosition(posSpec);
}

function dumpPieces() {
  const snap = A.captureState();
  const figs = snap && (snap.figuren || snap.pieces || snap.figs);
  if (figs) {
    for (const f of figs) {
      console.log("  piece:", JSON.stringify({typ: f.cha_typ || f.typ, farbe: f.int_farbe ?? f.farbe, x: f.int_xPos ?? f.x, y: f.int_yPos ?? f.y, feld: f.int_feldIndex ?? f.feldIndex, id: f.str_id || f.id}));
    }
  } else {
    console.log("  snapshot keys:", Object.keys(snap || {}));
  }
}

console.log("=== Round trip: lone white ROOK h1, kings e1/e8 ===");
load({
  sideToMove: "white",
  pieces: [
    {type: "KING", color: "white", coord: "e1"},
    {type: "ROOK", color: "white", coord: "h1"},
    {type: "KING", color: "black", coord: "e8"}
  ],
  smallUnits: [], bows: [], pearls: [], arrows: []
});
dumpPieces();
const acts = A.listLegalActions() || [];
console.log("actions:", acts.map(a => JSON.stringify({t: a.actionType, from: a.from, to: a.to})).slice(0, 8).join(" "));
console.log("raw action sample:", JSON.stringify(acts[0]));

console.log("=== Can classic king castle? Ke1, Ra1+Rh1, nothing else ===");
load({
  sideToMove: "white",
  pieces: [
    {type: "KING", color: "white", coord: "e1"},
    {type: "ROOK", color: "white", coord: "a1"},
    {type: "ROOK", color: "white", coord: "h1"},
    {type: "KING", color: "black", coord: "e8"}
  ],
  smallUnits: [], bows: [], pearls: [], arrows: []
});
const acts2 = A.listLegalActions() || [];
const kingActs = acts2.filter(a => {
  const s = JSON.stringify(a);
  return s.includes("e1");
});
console.log("king-related actions:", kingActs.map(a => JSON.stringify({t: a.actionType, from: a.from, to: a.to})).join(" "));

console.log("=== Does classic king ignore check? bKe8 black to move, wQe5 gives check along e-file ===");
load({
  sideToMove: "black",
  pieces: [
    {type: "KING", color: "black", coord: "e8"},
    {type: "QUEEN", color: "white", coord: "e5"},
    {type: "KING", color: "white", coord: "a1"}
  ],
  smallUnits: [], bows: [], pearls: [], arrows: []
});
const acts3 = A.listLegalActions() || [];
console.log("black actions while in check:", acts3.map(a => JSON.stringify({from: a.from, to: a.to})).join(" "));
console.log("status:", JSON.stringify(A.getGameStatus()));
