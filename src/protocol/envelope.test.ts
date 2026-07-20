import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_PROTO_VERSION,
  baseMessage,
  buildEnvelope,
  checkProtoVersion,
  decodeEnvelope,
  encodeEnvelope,
  envelopeByteLength,
  isForwardCompatibleVersion,
  parseProtoVersion,
  validateMessage,
} from './envelope';
import { APP_MARKER, MAX_ENVELOPE_BYTES, PROTO_TAG, PROTO_VERSION } from './types';
import type { Qch1Message } from './types';

const GAME_ID = '047f069c5a4e6ad5f4617ef063374cee';
const FROM = 'QALICEADDRESSXXXXXXXXXXXXXXXXXXXXX';

/** A structurally valid chat message, with the version overridable. */
function chatMessage(overrides: Record<string, unknown> = {}) {
  return {
    protoTag: PROTO_TAG,
    protoVersion: PROTO_VERSION,
    type: 'chat',
    gameId: GAME_ID,
    from: FROM,
    text: 'hello',
    ...overrides,
  };
}

/** An `app`-marked wire string of exactly `targetBytes` ASCII bytes. */
function paddedWire(targetBytes: number): string {
  const build = (pad: string) =>
    JSON.stringify({ app: APP_MARKER, qch1: chatMessage({ pad }) });
  const wire = build('x'.repeat(targetBytes - build('').length));
  if (wire.length !== targetBytes) {
    throw new Error(`padding helper produced ${wire.length} bytes, wanted ${targetBytes}`);
  }
  return wire;
}

describe('protoVersion parsing', () => {
  it('parses major.minor into numbers', () => {
    expect(parseProtoVersion('1.0')).toEqual({ major: 1, minor: 0 });
    expect(parseProtoVersion('1.12')).toEqual({ major: 1, minor: 12 });
    expect(parseProtoVersion('20.3')).toEqual({ major: 20, minor: 3 });
  });

  it('returns null for every malformed form', () => {
    for (const value of ['1', '1.', '.1', '1.0.0', 'one.zero', '01.0', '1.00', ' 1.0', '', 'v1.0']) {
      expect(parseProtoVersion(value), `expected ${JSON.stringify(value)} to be malformed`)
        .toBeNull();
    }
    for (const value of [1, 1.0, null, undefined, {}, ['1.0']]) {
      expect(parseProtoVersion(value)).toBeNull();
    }
  });

  it('parses the published constant, which is what the gate compares against', () => {
    expect(SUPPORTED_PROTO_VERSION).toEqual(parseProtoVersion(PROTO_VERSION));
    expect(baseMessage('chat', GAME_ID, FROM).protoVersion).toBe(PROTO_VERSION);
  });

  it('flags a same-major newer minor as forward compatible, nothing else', () => {
    const { major, minor } = SUPPORTED_PROTO_VERSION;
    expect(isForwardCompatibleVersion(`${major}.${minor + 1}`)).toBe(true);
    expect(isForwardCompatibleVersion(`${major}.${minor + 40}`)).toBe(true);
    expect(isForwardCompatibleVersion(PROTO_VERSION)).toBe(false);
    expect(isForwardCompatibleVersion(`${major + 1}.${minor + 1}`)).toBe(false);
    expect(isForwardCompatibleVersion('nonsense')).toBe(false);
  });
});

describe('version gate', () => {
  const { major, minor } = SUPPORTED_PROTO_VERSION;

  it('accepts the version this build publishes', () => {
    expect(checkProtoVersion(PROTO_VERSION)).toEqual({ accepted: true });
  });

  it('accepts any same-major minor, at or below ours', () => {
    for (let m = 0; m <= minor; m++) {
      expect(checkProtoVersion(`${major}.${m}`)).toEqual({ accepted: true });
    }
  });

  it('accepts a same-major GREATER minor as forward compatible', () => {
    expect(checkProtoVersion(`${major}.${minor + 1}`)).toEqual({ accepted: true });
    expect(checkProtoVersion(`${major}.99`)).toEqual({ accepted: true });
  });

  it('rejects a different major with invalid.versionUnsupported', () => {
    for (const version of [`${major + 1}.0`, `${major + 1}.${minor}`, '0.9', '7.4']) {
      expect(checkProtoVersion(version)).toMatchObject({
        accepted: false,
        badge: 'invalid.versionUnsupported',
      });
    }
  });

  it('names both versions in the unsupported detail', () => {
    const verdict = checkProtoVersion('2.5');
    expect(verdict).toMatchObject({ accepted: false, badge: 'invalid.versionUnsupported' });
    expect((verdict as { detail: string }).detail).toContain('2.5');
    expect((verdict as { detail: string }).detail).toContain(PROTO_VERSION);
  });

  it('rejects a malformed version as invalid.schema, not as unsupported', () => {
    for (const version of ['1', '1.0.0', 'one', '', 42, undefined]) {
      expect(checkProtoVersion(version)).toEqual({
        accepted: false,
        badge: 'invalid.schema',
        detail: 'protoVersion',
      });
    }
  });
});

describe('validateMessage version handling', () => {
  const { major, minor } = SUPPORTED_PROTO_VERSION;

  it('accepts a current-version message', () => {
    expect(validateMessage(chatMessage())).toEqual({ accepted: true });
  });

  it('accepts a newer same-major minor and ignores its unknown fields', () => {
    const future = chatMessage({
      protoVersion: `${major}.${minor + 1}`,
      clockMs: 90_000,
      variantHint: { name: 'chess960', castlingFile: 'g' },
    });
    expect(validateMessage(future)).toEqual({ accepted: true });
  });

  it('still enforces the fields it does understand on a newer minor', () => {
    const future = chatMessage({ protoVersion: `${major}.${minor + 1}`, text: '' });
    expect(validateMessage(future)).toEqual({
      accepted: false,
      badge: 'invalid.schema',
      detail: 'chat.text',
    });
  });

  it('rejects a foreign major with invalid.versionUnsupported', () => {
    expect(validateMessage(chatMessage({ protoVersion: `${major + 1}.0` }))).toMatchObject({
      accepted: false,
      badge: 'invalid.versionUnsupported',
    });
  });

  it('rejects a foreign major even when the rest of the record is valid', () => {
    const move = {
      protoTag: PROTO_TAG,
      protoVersion: '9.9',
      type: 'move',
      gameId: GAME_ID,
      from: FROM,
      ply: 1,
      move: 'e2e4',
      history: ['e2e4'],
      prevHash: 'ab'.repeat(32),
      stateHash: 'cd'.repeat(32),
    };
    expect(validateMessage(move)).toMatchObject({
      accepted: false,
      badge: 'invalid.versionUnsupported',
    });
  });

  it('rejects a malformed version with invalid.schema', () => {
    expect(validateMessage(chatMessage({ protoVersion: '1' }))).toEqual({
      accepted: false,
      badge: 'invalid.schema',
      detail: 'protoVersion',
    });
    expect(validateMessage(chatMessage({ protoVersion: 10 }))).toEqual({
      accepted: false,
      badge: 'invalid.schema',
      detail: 'protoVersion',
    });
  });

  it('checks protoTag before the version, so a foreign tag is never a version verdict', () => {
    expect(validateMessage(chatMessage({ protoTag: 'QC1', protoVersion: '9.9' }))).toEqual({
      accepted: false,
      badge: 'invalid.schema',
      detail: 'protoTag',
    });
  });
});

describe('envelope size gate', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(envelopeByteLength('abc')).toBe(3);
    expect(envelopeByteLength('é')).toBe(2);
    expect(envelopeByteLength('😀')).toBe(4);
  });

  it('accepts an envelope of exactly the budget', () => {
    const wire = paddedWire(MAX_ENVELOPE_BYTES);
    expect(envelopeByteLength(wire)).toBe(MAX_ENVELOPE_BYTES);
    expect(decodeEnvelope(wire).ok).toBe(true);
  });

  it('emits invalid.oversized one byte over the budget', () => {
    const wire = paddedWire(MAX_ENVELOPE_BYTES + 1);
    const result = decodeEnvelope(wire);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'invalid' });
    expect((result as { verdict: { badge: string; detail: string } }).verdict).toMatchObject({
      accepted: false,
      badge: 'invalid.oversized',
    });
    expect((result as { verdict: { detail: string } }).verdict.detail).toContain(
      String(MAX_ENVELOPE_BYTES + 1),
    );
  });

  it('measures bytes, so multi-byte padding trips the gate under the character count', () => {
    const pad = '€'.repeat(MAX_ENVELOPE_BYTES); // 3 bytes each
    const wire = JSON.stringify({ app: APP_MARKER, qch1: chatMessage({ pad }) });
    expect(decodeEnvelope(wire)).toMatchObject({
      ok: false,
      reason: 'invalid',
      verdict: { badge: 'invalid.oversized' },
    });
  });

  it('rejects oversized before schema, so a huge malformed record is not a schema verdict', () => {
    const wire = JSON.stringify({
      app: APP_MARKER,
      qch1: chatMessage({ type: 'nonsense', pad: 'x'.repeat(MAX_ENVELOPE_BYTES) }),
    });
    expect(decodeEnvelope(wire)).toMatchObject({
      ok: false,
      verdict: { badge: 'invalid.oversized' },
    });
  });

  it('leaves oversized non-QCH1 content alone as ordinary chat', () => {
    const human = JSON.stringify({ hello: 'x'.repeat(MAX_ENVELOPE_BYTES) });
    expect(decodeEnvelope(human)).toEqual({ ok: false, reason: 'not-qch1' });
    expect(decodeEnvelope('y'.repeat(MAX_ENVELOPE_BYTES + 500))).toEqual({
      ok: false,
      reason: 'not-qch1',
    });
  });

  it('still refuses to encode an over-budget envelope on the send side', () => {
    const message = {
      ...baseMessage('chat', GAME_ID, FROM),
      type: 'chat',
      text: 'x'.repeat(MAX_ENVELOPE_BYTES),
    } as unknown as Qch1Message;
    expect(() => encodeEnvelope(buildEnvelope(message))).toThrow(/budget is/);
  });
});
