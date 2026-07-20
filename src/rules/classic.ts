// Classic-chess ruleset backed by chess.js (see docs/ENGINE-AUDIT-2026-07-20.md
// for why chess.js and not the J-Chess engine).

import { Chess } from 'chess.js';
import type { GameResult, Terminal, Uci } from '../protocol/types';
import type { Color, RulesAdapter, RulesStatus } from './adapter';

// State is the applied history plus a chess.js instance that has replayed it.
// The instance is private to the adapter and never mutated after construction;
// apply() always builds a fresh successor so states are safely shareable.
export type ClassicState = {
  readonly history: readonly Uci[];
  readonly game: Chess;
};

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

function toUci(move: { from: string; to: string; promotion?: string }): Uci {
  return move.from + move.to + (move.promotion ?? '');
}

function parseUci(uci: Uci) {
  const m = UCI_RE.exec(uci);
  if (!m) {
    throw new Error(`Not a UCI move: ${JSON.stringify(uci)}`);
  }
  return { from: m[1], to: m[2], promotion: m[3] };
}

function replayInto(history: readonly Uci[]): Chess {
  const game = new Chess();
  for (const uci of history) {
    const parsed = parseUci(uci);
    try {
      game.move(parsed);
    } catch {
      throw new Error(`Illegal move ${uci} at ply ${game.history().length + 1}`);
    }
  }
  return game;
}

function terminalOf(game: Chess): Terminal | null {
  if (game.isCheckmate()) {
    // The side to move is mated; the side that just moved wins.
    const result: GameResult = game.turn() === 'w' ? '0-1' : '1-0';
    return { result, reason: 'checkmate' };
  }
  if (game.isStalemate()) {
    return { result: '1/2-1/2', reason: 'stalemate' };
  }
  if (game.isInsufficientMaterial()) {
    return { result: '1/2-1/2', reason: 'insufficient-material' };
  }
  if (game.isThreefoldRepetition()) {
    return { result: '1/2-1/2', reason: 'threefold-repetition' };
  }
  if (game.isDrawByFiftyMoves()) {
    return { result: '1/2-1/2', reason: 'fifty-move' };
  }
  return null;
}

export const classicRules: RulesAdapter<ClassicState> = {
  rulesetId: 'classic',

  initialState() {
    return { history: [], game: new Chess() };
  },

  legalMoves(state) {
    if (terminalOf(state.game)) {
      return [];
    }
    return state.game.moves({ verbose: true }).map(toUci);
  },

  apply(state, move) {
    if (terminalOf(state.game)) {
      throw new Error('Game is over');
    }
    parseUci(move); // reject non-canonical encodings before consulting the engine
    const game = replayInto(state.history);
    const parsed = parseUci(move);
    try {
      game.move(parsed);
    } catch {
      throw new Error(`Illegal move ${move}`);
    }
    return { history: [...state.history, move], game };
  },

  status(state): RulesStatus {
    const terminal = terminalOf(state.game);
    if (terminal) {
      return { over: true, terminal };
    }
    const sideToMove: Color = state.game.turn() === 'w' ? 'white' : 'black';
    return { over: false, sideToMove, inCheck: state.game.inCheck() };
  },

  replay(history) {
    return { history: [...history], game: replayInto(history) };
  },

  snapshot(state) {
    return state.game.fen();
  },

  toPGN(history, meta) {
    const game = replayInto(history);
    game.setHeader('White', meta.white);
    game.setHeader('Black', meta.black);
    if (meta.result) {
      game.setHeader('Result', meta.result);
    }
    return game.pgn();
  },
};
