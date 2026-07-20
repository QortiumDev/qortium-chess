// Smoke test: can J-Chess engine host a classic-chess position headlessly?
global.window = {};
global.document = {};
require("/home/user/games/git/J-Chess/js/logik.js");
const A = global.window.JCH_Autoplay;

function show(label, posSpec) {
  console.log("=== " + label + " ===");
  try {
    if (typeof A.newGame === "function") A.newGame();
    A.loadPosition(posSpec);
    const acts = A.listLegalActions() || [];
    console.log("legal actions (" + acts.length + "):", acts.map(a => {
      try { return A.formatActionNotation(a); } catch (e) { return JSON.stringify({type: a.actionType}); }
    }).join("  "));
    console.log("status:", JSON.stringify(A.getGameStatus()));
  } catch (e) {
    console.log("ERROR:", e && e.message, e && e.stack && e.stack.split("\n")[1]);
  }
}

// 1. Castling-ready classic position, black queen pinning nothing but covering d-file
show("K+2R vs K+Q (white to move, Qd5 covers d1/d-file)", {
  sideToMove: "white",
  pieces: [
    {type: "KING", color: "white", coord: "e1"},
    {type: "ROOK", color: "white", coord: "a1"},
    {type: "ROOK", color: "white", coord: "h1"},
    {type: "KING", color: "black", coord: "e8"},
    {type: "QUEEN", color: "black", coord: "d5"}
  ],
  smallUnits: [], bows: [], pearls: [], arrows: []
});

// 2. Back-rank mate pattern: white Ra8 mates black king g8 behind pawnless rank?
//    (No pawns available; use knights as blockers f8 is free, so use classic mate: K g8, white R a8, white K g6)
show("Back-rank-ish mate: bKg8, wRa8, wKg6, black to move", {
  sideToMove: "black",
  pieces: [
    {type: "KING", color: "black", coord: "g8"},
    {type: "ROOK", color: "white", coord: "a8"},
    {type: "KING", color: "white", coord: "g6"}
  ],
  smallUnits: [], bows: [], pearls: [], arrows: []
});

// 3. Classic stalemate: bKa8, wQb6, wKc6, black to move — not in check, no legal moves.
show("Stalemate: bKa8, wQb6, wKc6, black to move", {
  sideToMove: "black",
  pieces: [
    {type: "KING", color: "black", coord: "a8"},
    {type: "QUEEN", color: "white", coord: "b6"},
    {type: "KING", color: "white", coord: "c6"}
  ],
  smallUnits: [], bows: [], pearls: [], arrows: []
});
