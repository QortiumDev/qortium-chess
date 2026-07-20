import { describe, expect, it } from 'vitest';
import { canonicalStatePayload, deriveGameId, initialStateHash, stateHash } from './hash';

// Pinned vectors — regenerating these means the wire protocol changed and
// every deployed client breaks. Do not update casually.
const CREATOR = 'QCREATORADDRESSXXXXXXXXXXXXXXXXXXX';
const NONCE = '00112233445566778899aabbccddeeff';
const GAME_ID = '047f069c5a4e6ad5f4617ef063374cee';
const PLAYERS = {
  white: 'QWHITEADDRESSXXXXXXXXXXXXXXXXXXXXX',
  black: 'QBLACKADDRESSXXXXXXXXXXXXXXXXXXXXX',
};
const BASE = { ruleset: 'classic' as const, gameId: GAME_ID, players: PLAYERS };

describe('QCH1 hashing', () => {
  it('derives gameId from creator + nonce (pinned)', () => {
    expect(deriveGameId(CREATOR, NONCE)).toBe(GAME_ID);
  });

  it('matches the pinned hash-chain vectors', () => {
    expect(initialStateHash(BASE)).toBe(
      'ee017e94b2907ef230fdb08fcc42d66222c7d40e804bc0cb1eb6c9786b15b1e0',
    );
    expect(stateHash({ ...BASE, history: ['e2e4'], terminal: null })).toBe(
      'f36124b6b30c6a36105e1a6465eec02cd85b0988e42d7a0051871a4df6a7268d',
    );
    expect(stateHash({ ...BASE, history: ['e2e4', 'e7e5'], terminal: null })).toBe(
      '3629108cac5d5d80f2f6e4bcb8a784b90b8d0e8043c22d12a2a353e21202b1f2',
    );
    expect(
      stateHash({
        ...BASE,
        history: ['e2e4', 'e7e5'],
        terminal: { result: '1-0', reason: 'resign' },
      }),
    ).toBe('57817921b10a778f4ee9f789440bf1a6c16722ec66254e8c69bdad49b90535ee');
  });

  it('serializes with exact key order regardless of input object order', () => {
    const payload = canonicalStatePayload({
      terminal: null,
      history: ['e2e4'],
      players: { black: PLAYERS.black, white: PLAYERS.white },
      gameId: GAME_ID,
      ruleset: 'classic',
    } as never);
    expect(payload.startsWith('{"protoTag":"QCH1","ruleset":"classic","gameId":"')).toBe(true);
    expect(payload.indexOf('"white"')).toBeLessThan(payload.indexOf('"black"'));
  });

  it('changes hash on any component change', () => {
    const base = stateHash({ ...BASE, history: ['e2e4'], terminal: null });
    expect(stateHash({ ...BASE, history: ['d2d4'], terminal: null })).not.toBe(base);
    expect(
      stateHash({ ...BASE, history: ['e2e4'], terminal: { result: '1-0', reason: 'resign' } }),
    ).not.toBe(base);
    expect(
      stateHash({
        ...BASE,
        players: { white: PLAYERS.black, black: PLAYERS.white },
        history: ['e2e4'],
        terminal: null,
      }),
    ).not.toBe(base);
  });
});
