import { describe, expect, it } from 'vitest';
import { classicRules } from './classic';

const SCHOLARS_MATE = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
// Sam Loyd's 10-move stalemate.
const LOYD_STALEMATE = [
  'e2e3', 'a7a5', 'd1h5', 'a8a6', 'h5a5', 'h7h5', 'a5c7', 'a6h6', 'h2h4', 'f7f6',
  'c7d7', 'e8f7', 'd7b7', 'd8d3', 'b7b8', 'd3h7', 'b8c8', 'f7g6', 'c8e6',
];

describe('classicRules', () => {
  it('offers 20 legal moves from the initial position', () => {
    expect(classicRules.legalMoves(classicRules.initialState())).toHaveLength(20);
  });

  it('detects checkmate with the winner for the side that delivered it', () => {
    const state = classicRules.replay(SCHOLARS_MATE);
    const status = classicRules.status(state);
    expect(status).toEqual({ over: true, terminal: { result: '1-0', reason: 'checkmate' } });
    expect(classicRules.legalMoves(state)).toHaveLength(0);
  });

  it('detects stalemate as a draw', () => {
    const status = classicRules.status(classicRules.replay(LOYD_STALEMATE));
    expect(status).toEqual({ over: true, terminal: { result: '1/2-1/2', reason: 'stalemate' } });
  });

  it('detects threefold repetition as a draw', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const status = classicRules.status(classicRules.replay(shuffle));
    expect(status).toEqual({
      over: true,
      terminal: { result: '1/2-1/2', reason: 'threefold-repetition' },
    });
  });

  it('handles promotion, en passant, and castling in UCI form', () => {
    const promo = ['a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6b7', 'b8c6', 'b7a8q'];
    expect(classicRules.snapshot(classicRules.replay(promo))).toMatch(/^Q2qkbnr/);

    const enPassant = ['e2e4', 'g8f6', 'e4e5', 'd7d5', 'e5d6'];
    expect(() => classicRules.replay(enPassant)).not.toThrow();

    const castle = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1'];
    const pgn = classicRules.toPGN(castle, { white: 'A', black: 'B' });
    expect(pgn).toContain('O-O');
  });

  it('rejects illegal and malformed moves', () => {
    const start = classicRules.initialState();
    expect(() => classicRules.apply(start, 'e2e5')).toThrow(/Illegal/);
    expect(() => classicRules.apply(start, 'Nf3')).toThrow(/Not a UCI/);
    expect(() => classicRules.replay(['e2e4', 'e2e4'])).toThrow(/ply 2/);
  });

  it('apply does not mutate the input state', () => {
    const start = classicRules.initialState();
    const next = classicRules.apply(start, 'e2e4');
    expect(start.history).toHaveLength(0);
    expect(next.history).toEqual(['e2e4']);
    expect(classicRules.legalMoves(start)).toHaveLength(20);
  });

  it('refuses moves after the game is over', () => {
    const state = classicRules.replay(SCHOLARS_MATE);
    expect(() => classicRules.apply(state, 'a7a6')).toThrow(/over/);
  });
});
