// Decoded probes: castling availability + check legality for classic pieces
global.window = {};
global.document = {};
require("/home/user/games/git/J-Chess/js/logik.js");
const A = global.window.JCH_Autoplay;

const files = " abcdefgh";
function sq(fieldId) {
  const y = Math.floor(fieldId / 10), x = fieldId % 10;
  return files[x] + y;
}
function fmt(a) {
  return (a.pieceId || "?") + ":" + sq(a.fromFieldId) + "-" + sq(a.toFieldId) + (a.isCapture ? "x" : "");
}
function load(posSpec) {
  if (typeof A.newGame === "function") A.newGame();
  A.loadPosition(posSpec);
}

console.log("=== Castling probe: wKe1, wRa1, wRh1 (all unmoved), white to move ===");
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
console.log((A.listLegalActions() || []).map(fmt).join("  "));

console.log("=== Check probe: bKe8 in check from wQe5, black to move ===");
load({
  sideToMove: "black",
  pieces: [
    {type: "KING", color: "black", coord: "e8"},
    {type: "QUEEN", color: "white", coord: "e5"},
    {type: "KING", color: "white", coord: "a1"}
  ],
  smallUnits: [], bows: [], pearls: [], arrows: []
});
console.log((A.listLegalActions() || []).map(fmt).join("  "));

console.log("=== Pin probe: wKe1, wRe4 pinned by bQe8; white rook must not leave e-file ===");
load({
  sideToMove: "white",
  pieces: [
    {type: "KING", color: "white", coord: "e1"},
    {type: "ROOK", color: "white", coord: "e4"},
    {type: "QUEEN", color: "black", coord: "e8"},
    {type: "KING", color: "black", coord: "a8"}
  ],
  smallUnits: [], bows: [], pearls: [], arrows: []
});
const acts = A.listLegalActions() || [];
const rookOffEFile = acts.filter(a => a.pieceId === "id0t0" && (a.toFieldId % 10) !== 5);
console.log("all:", acts.map(fmt).join("  "));
console.log("PINNED-ROOK-LEAVES-E-FILE offered:", rookOffEFile.length);
