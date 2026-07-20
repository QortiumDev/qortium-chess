// QCH1 hash chain — spec §4.3.
// Canonical serialization is achieved by constructing objects in the exact
// key order the spec mandates and minified-JSON-stringifying them (JS object
// key order is insertion order for string keys).

import { blake2b } from '@noble/hashes/blake2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { PROTO_TAG } from './types';
import type { Address, GameId, HashHex, RulesetId, Terminal, Uci } from './types';

export function blake2b256Hex(data: string): HashHex {
  return bytesToHex(blake2b(utf8ToBytes(data), { dkLen: 32 }));
}

/** gameId = blake2b-256(creatorAddress || nonce), truncated to 16 bytes, hex. */
export function deriveGameId(creatorAddress: Address, nonce: string): GameId {
  return blake2b256Hex(creatorAddress + nonce).slice(0, 32);
}

export type StatePayloadInput = {
  ruleset: RulesetId;
  gameId: GameId;
  players: { white: Address; black: Address };
  history: readonly Uci[];
  terminal: Terminal | null;
};

export function canonicalStatePayload(input: StatePayloadInput): string {
  return JSON.stringify({
    protoTag: PROTO_TAG,
    ruleset: input.ruleset,
    gameId: input.gameId,
    players: { white: input.players.white, black: input.players.black },
    history: input.history,
    terminal: input.terminal === null
      ? null
      : { result: input.terminal.result, reason: input.terminal.reason },
  });
}

export function stateHash(input: StatePayloadInput): HashHex {
  return blake2b256Hex(canonicalStatePayload(input));
}

/** prevHash for ply 1: hash of the empty-history, non-terminal payload. */
export function initialStateHash(
  base: Omit<StatePayloadInput, 'history' | 'terminal'>,
): HashHex {
  return stateHash({ ...base, history: [], terminal: null });
}
