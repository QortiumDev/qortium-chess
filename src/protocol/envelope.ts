// QCH1 envelope codec + structural validation — spec §4.4/§4.5.
// Hand-rolled type guards instead of a schema library: the message surface is
// small and the guards double as precise TypeScript narrowing.

import {
  APP_MARKER,
  COLOR_CHOICES,
  GAME_ID_HEX_LENGTH,
  MAX_ADDRESS_LENGTH,
  MAX_CHAT_TEXT_LENGTH,
  MAX_ENVELOPE_BYTES,
  MAX_INVITE_NOTE_LENGTH,
  MIN_ADDRESS_LENGTH,
  NONCE_HEX_LENGTH,
  PROTO_TAG,
  PROTO_VERSION,
  QCH1_MESSAGE_TYPES,
  RULESET_IDS,
  STATE_HASH_HEX_LENGTH,
} from './types';
import type {
  ColorChoice,
  Qch1Envelope,
  Qch1Message,
  Qch1MessageType,
  RulesetId,
  Verdict,
} from './types';

/** Wire grammar for the identifier forms, built from the published lengths. */
export const HASH_HEX_PATTERN = `^[0-9a-f]{${STATE_HASH_HEX_LENGTH}}$`;
export const GAME_ID_HEX_PATTERN = `^[0-9a-f]{${GAME_ID_HEX_LENGTH}}$`;
export const UCI_PATTERN = '^[a-h][1-8][a-h][1-8][qrbn]?$';
export const NONCE_HEX_PATTERN = `^[0-9a-f]{${NONCE_HEX_LENGTH}}$`;
/** `major.minor`, no leading zeros — the only accepted `protoVersion` form. */
export const PROTO_VERSION_PATTERN = '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$';

const HEX_64 = new RegExp(HASH_HEX_PATTERN);
const HEX_32 = new RegExp(GAME_ID_HEX_PATTERN);
const NONCE_RE = new RegExp(NONCE_HEX_PATTERN);
const UCI_RE = new RegExp(UCI_PATTERN);
const PROTO_VERSION_RE = new RegExp(PROTO_VERSION_PATTERN);

const MESSAGE_TYPES: readonly Qch1MessageType[] = QCH1_MESSAGE_TYPES;

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

/** A `protoVersion` split into its two numeric components. */
export type ProtoVersion = { major: number; minor: number };

/** Parse `major.minor`; anything else (including a bare `"1"`) is malformed. */
export function parseProtoVersion(value: unknown): ProtoVersion | null {
  if (!isStr(value)) return null;
  const match = PROTO_VERSION_RE.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/** The version this build implements, parsed once from the published constant. */
export const SUPPORTED_PROTO_VERSION: ProtoVersion = parseProtoVersion(PROTO_VERSION)!;

/**
 * Version gate. Same major is compatible in both directions: an equal or lower
 * minor is fully understood, and a HIGHER minor is forward-compatible — the
 * fields this build knows are processed and unknown fields are ignored, which
 * is what lets a 1.0 client keep playing a 1.1 client. A different major is a
 * different protocol and is refused with `invalid.versionUnsupported`; an
 * unparseable version is a malformed record, so it fails as `invalid.schema`
 * like every other field-level grammar failure.
 */
export function checkProtoVersion(value: unknown): Verdict {
  const version = parseProtoVersion(value);
  if (!version) return fail('protoVersion');
  if (version.major !== SUPPORTED_PROTO_VERSION.major) {
    return {
      accepted: false,
      badge: 'invalid.versionUnsupported',
      detail: `protoVersion ${version.major}.${version.minor}; this build implements ${PROTO_VERSION}`,
    };
  }
  return OK;
}

/** True for a same-major version newer than this build — parsed leniently. */
export function isForwardCompatibleVersion(value: unknown): boolean {
  const version = parseProtoVersion(value);
  return (
    version !== null
    && version.major === SUPPORTED_PROTO_VERSION.major
    && version.minor > SUPPORTED_PROTO_VERSION.minor
  );
}

function validateBase(m: Record<string, unknown>): Verdict {
  if (m.protoTag !== PROTO_TAG) return fail('protoTag');
  const version = checkProtoVersion(m.protoVersion);
  if (!version.accepted) return version;
  if (!MESSAGE_TYPES.includes(m.type as Qch1MessageType)) return fail('type');
  if (!isStr(m.gameId) || !HEX_32.test(m.gameId)) return fail('gameId');
  if (
    !isStr(m.from)
    || m.from.length < MIN_ADDRESS_LENGTH
    || m.from.length > MAX_ADDRESS_LENGTH
  ) {
    return fail('from');
  }
  return OK;
}

function validatePerType(m: Record<string, unknown>): Verdict {
  switch (m.type) {
    case 'invite':
      if (!isStr(m.nonce) || !NONCE_RE.test(m.nonce)) return fail('invite.nonce');
      if (!RULESET_IDS.includes(m.ruleset as RulesetId)) return fail('invite.ruleset');
      if (!COLOR_CHOICES.includes(m.colorChoice as ColorChoice)) return fail('invite.colorChoice');
      if (typeof m.isPublic !== 'boolean') return fail('invite.isPublic');
      if (m.note !== undefined && (!isStr(m.note) || m.note.length > MAX_INVITE_NOTE_LENGTH)) {
        return fail('invite.note');
      }
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
      if (!isStr(m.text) || m.text.length === 0 || m.text.length > MAX_CHAT_TEXT_LENGTH) {
        return fail('chat.text');
      }
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

/** UTF-8 length of an encoded envelope — the unit the budget is expressed in. */
export function envelopeByteLength(wire: string): number {
  return new TextEncoder().encode(wire).length;
}

/** Serialize for SEND_CHAT_MESSAGE; enforces the size budget. */
export function encodeEnvelope(envelope: Qch1Envelope): string {
  const wire = JSON.stringify(envelope);
  const bytes = envelopeByteLength(wire);
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
  // Size is gated only once the payload is known to be ours: a long human chat
  // line is ordinary content, not an oversized envelope. A sender that skips
  // `encodeEnvelope` cannot make a receiver spend work on an over-budget record.
  const bytes = envelopeByteLength(wire);
  if (bytes > MAX_ENVELOPE_BYTES) {
    return {
      ok: false,
      reason: 'invalid',
      verdict: {
        accepted: false,
        badge: 'invalid.oversized',
        detail: `${bytes} bytes; budget is ${MAX_ENVELOPE_BYTES}`,
      },
    };
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
