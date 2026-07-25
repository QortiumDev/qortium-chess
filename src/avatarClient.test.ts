import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AVATAR_MAX_BYTES,
  fetchAccountAvatar,
  parseAccountAvatar,
  revokeAvatarObjectUrl,
} from './avatarClient';

const ADDRESS = 'QACCOUNTADDRESSXXXXXXXXXXXXXXXXXXXXX';

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

describe('pointer-aware account avatar parsing', () => {
  it('accepts a matching, bounded pointer response and creates an in-memory Blob URL', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar');
    const result = parseAccountAvatar(
      {
        address: ADDRESS,
        body: '/w==',
        contentLength: 1,
        contentType: 'image/png; charset=binary',
        descriptor: { service: 'THUMBNAIL', name: 'alice', identifier: 'avatar' },
        encoding: 'base64',
        source: 'POINTER',
      },
      ADDRESS,
    );

    expect(result).toEqual({ kind: 'ready', source: 'POINTER', src: 'blob:avatar' });
    expect(createObjectURL).toHaveBeenCalledOnce();
  });

  it('rejects mismatched addresses, malformed payloads, oversized data, and a descriptorless pointer', () => {
    expect(parseAccountAvatar({ address: 'QOTHER', source: 'LEGACY' }, ADDRESS)).toEqual({ kind: 'unavailable' });
    expect(parseAccountAvatar({ address: ADDRESS, source: 'POINTER' }, ADDRESS)).toEqual({ kind: 'unavailable' });
    expect(
      parseAccountAvatar(
        { address: ADDRESS, body: 'not base64!', contentLength: 1, contentType: 'image/png', encoding: 'base64', source: 'LEGACY' },
        ADDRESS,
      ),
    ).toEqual({ kind: 'unavailable' });
    expect(
      parseAccountAvatar(
        { address: ADDRESS, body: '/w==', contentLength: AVATAR_MAX_BYTES + 1, contentType: 'image/png', encoding: 'base64', source: 'LEGACY' },
        ADDRESS,
      ),
    ).toEqual({ kind: 'unavailable' });
  });

  it('keeps the bridge retry signal bounded', () => {
    expect(parseAccountAvatar({ address: ADDRESS, source: 'LEGACY', status: 'PENDING', retryAfterSeconds: 0 }, ADDRESS)).toEqual({
      kind: 'pending',
      retryAfterSeconds: 1,
      source: 'LEGACY',
    });
    expect(
      parseAccountAvatar(
        { address: ADDRESS, source: 'POINTER', descriptor: { service: 'THUMBNAIL', name: 'alice', identifier: '' }, status: 'PENDING', retryAfterSeconds: 100 },
        ADDRESS,
      ),
    ).toEqual({ kind: 'pending', retryAfterSeconds: 30, source: 'POINTER' });
  });
});

describe('pointer-aware account avatar bridge use', () => {
  it('does not issue an avatar request when SHOW_ACTIONS lacks the capability', async () => {
    const request = vi.fn();
    (globalThis as { window?: unknown }).window = { qdnRequest: request };

    await expect(fetchAccountAvatar(ADDRESS, ['SHOW_ACTIONS'])).resolves.toEqual({ kind: 'unavailable' });
    expect(request).not.toHaveBeenCalled();
  });

  it('revokes only object URLs created for avatars', () => {
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
    revokeAvatarObjectUrl('https://example.invalid/avatar.png');
    revokeAvatarObjectUrl('blob:avatar');
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:avatar');
  });
});
