// QCH1 envelope codec + structural validation — spec §4.4/§4.5.
// Hand-rolled type guards instead of a schema library: the message surface is
// small and the guards double as precise TypeScript narrowing.

import {
  APP_MARKER,
  MAX_ENVELOPE_BYTES,
  PROTO_TAG,
  PROTO_VERSION,
} from './types';
import type {
  Qch1Envelope,
  Qch1Message,
  Qch1MessageType,
  Verdict,
} from './types';

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_32 = /^[0-9a-f]{32}$/;
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

const MESSAGE_TYPES: readonly Qch1MessageType[] = [
  'invite', 'cancelInvite', 'join', 'approve', 'reject', 'move',
  'drawOffer', 'drawAccept', 'drawDecline', 'resign', 'abort', 'chat',
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

function fail(detail: string): Verdict {
  return { accepted: false, badge: 'invalid.schema', detail };
}

const OK: Verdict = { accepted: true };

function validateBase(m: Record<string, unknown>): Verdict {
  if (m.protoTag !== PROTO_TAG) return fail('protoTag');
  if (!isStr(m.protoVersion)) return fail('protoVersion');
  if (!MESSAGE_TYPES.includes(m.type as Qch1MessageType)) return fail('type');
  if (!isStr(m.gameId) || !HEX_32.test(m.gameId)) return fail('gameId');
  if (!isStr(m.from) || m.from.length < 20 || m.from.length > 64) return fail('from');
  return OK;
}

function validatePerType(m: Record<string, unknown>): Verdict {
  switch (m.type) {
    case 'invite':
      if (!isStr(m.nonce) || !HEX_32.test(m.nonce)) return fail('invite.nonce');
      if (m.ruleset !== 'classic') return fail('invite.ruleset');
      if (!['White', 'Black', 'Random'].includes(m.colorChoice as string)) return fail('invite.colorChoice');
      if (typeof m.isPublic !== 'boolean') return fail('invite.isPublic');
      if (m.note !== undefined && (!isStr(m.note) || m.note.length > 160)) return fail('invite.note');
      return OK;
    case 'approve':
    case 'reject':
      if (!isStr(m.opponent)) return fail(`${m.type}.opponent`);
      return OK;
    case 'move': {
      if (!Number.isInteger(m.ply) || (m.ply as number) < 1) return fail('move.ply');
      if (!isStr(m.move) || !UCI_RE.test(m.move)) return fail('move.move');
      if (!Array.isArray(m.history) || !m.history.every((h) => isStr(h) && UCI_RE.test(h))) {
        return fail('move.history');
      }
      if (m.history.length !== m.ply) return fail('move.history.length');
      if (m.history[m.history.length - 1] !== m.move) return fail('move.history.last');
      if (!isStr(m.prevHash) || !HEX_64.test(m.prevHash)) return fail('move.prevHash');
      if (!isStr(m.stateHash) || !HEX_64.test(m.stateHash)) return fail('move.stateHash');
      if (m.fen !== undefined && !isStr(m.fen)) return fail('move.fen');
      return OK;
    }
    case 'drawOffer':
    case 'drawAccept':
    case 'drawDecline':
      if (!Number.isInteger(m.atPly) || (m.atPly as number) < 0) return fail(`${m.type}.atPly`);
      return OK;
    case 'resign':
    case 'abort':
      if (!isStr(m.prevHash) || !HEX_64.test(m.prevHash)) return fail(`${m.type}.prevHash`);
      return OK;
    case 'chat':
      if (!isStr(m.text) || m.text.length === 0 || m.text.length > 2000) return fail('chat.text');
      return OK;
    default:
      return OK; // cancelInvite / join carry no extra fields
  }
}

export function validateMessage(value: unknown): Verdict {
  if (!isRecord(value)) return fail('not an object');
  const base = validateBase(value);
  if (!base.accepted) return base;
  return validatePerType(value);
}

export function buildEnvelope(message: Qch1Message): Qch1Envelope {
  return { app: APP_MARKER, qch1: message };
}

/** Serialize for SEND_CHAT_MESSAGE; enforces the size budget. */
export function encodeEnvelope(envelope: Qch1Envelope): string {
  const wire = JSON.stringify(envelope);
  const bytes = new TextEncoder().encode(wire).length;
  if (bytes > MAX_ENVELOPE_BYTES) {
    throw new Error(`Envelope is ${bytes} bytes; budget is ${MAX_ENVELOPE_BYTES}`);
  }
  return wire;
}

export type DecodeResult =
  | { ok: true; message: Qch1Message }
  | { ok: false; reason: 'not-qch1' | 'invalid'; verdict?: Verdict };

/** Decode an incoming CHAT message string. Non-QCH1 content is not an error. */
export function decodeEnvelope(wire: string): DecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(wire);
  } catch {
    return { ok: false, reason: 'not-qch1' };
  }
  if (!isRecord(parsed) || parsed.app !== APP_MARKER || !isRecord(parsed.qch1)) {
    return { ok: false, reason: 'not-qch1' };
  }
  const verdict = validateMessage(parsed.qch1);
  if (!verdict.accepted) {
    return { ok: false, reason: 'invalid', verdict };
  }
  return { ok: true, message: parsed.qch1 as unknown as Qch1Message };
}

export function baseMessage(type: Qch1MessageType, gameId: string, from: string) {
  return { protoTag: PROTO_TAG, protoVersion: PROTO_VERSION, type, gameId, from } as const;
}
