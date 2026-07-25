import { qdnRequest } from './qdnRequest';

export const AVATAR_MAX_BYTES = 500 * 1024;

const SAFE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp']);
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type AvatarSource = 'POINTER' | 'LEGACY';
type AvatarDescriptor = { identifier: string; name: string; service: string };

export type AccountAvatarFetch =
  | { kind: 'pending'; retryAfterSeconds: number; source: AvatarSource }
  | { kind: 'ready'; source: AvatarSource; src: string }
  | { kind: 'unavailable' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseDescriptor(value: unknown): AvatarDescriptor | null {
  if (!isRecord(value)) return null;

  const service = text(value.service);
  const name = text(value.name);

  return service && name && typeof value.identifier === 'string' ? { identifier: value.identifier, name, service } : null;
}

function decodeBase64(value: string) {
  if (!value || !BASE64_PATTERN.test(value)) return null;

  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function parseAccountAvatar(value: unknown, expectedAddress: string): AccountAvatarFetch {
  if (!isRecord(value) || value.address !== expectedAddress || (value.source !== 'POINTER' && value.source !== 'LEGACY')) {
    return { kind: 'unavailable' };
  }

  const source = value.source;
  const descriptor = parseDescriptor(value.descriptor);

  // A claimed pointer without its resource tuple is not safe to display as a
  // pointer result. Home owns its exact-404-only legacy fallback.
  if (source === 'POINTER' && !descriptor) return { kind: 'unavailable' };

  if (value.status === 'PENDING') {
    const requestedDelay = typeof value.retryAfterSeconds === 'number' && Number.isFinite(value.retryAfterSeconds)
      ? value.retryAfterSeconds
      : 5;

    return { kind: 'pending', retryAfterSeconds: Math.min(Math.max(Math.floor(requestedDelay), 1), 30), source };
  }

  if (value.encoding !== 'base64' || typeof value.body !== 'string' || typeof value.contentType !== 'string') {
    return { kind: 'unavailable' };
  }

  const contentType = value.contentType.toLowerCase().split(';', 1)[0];
  const contentLength = value.contentLength;
  const bytes = decodeBase64(value.body);

  if (
    !SAFE_IMAGE_MIME_TYPES.has(contentType) ||
    typeof contentLength !== 'number' ||
    !Number.isSafeInteger(contentLength) ||
    contentLength < 1 ||
    contentLength > AVATAR_MAX_BYTES ||
    !bytes ||
    bytes.byteLength !== contentLength
  ) {
    return { kind: 'unavailable' };
  }

  return {
    kind: 'ready',
    source,
    src: URL.createObjectURL(new Blob([bytes.buffer], { type: contentType })),
  };
}

/** Query the host once per mounted Game Room before any avatar byte requests. */
export async function getAvatarActions(): Promise<string[]> {
  try {
    const value = await qdnRequest<unknown>({ action: 'SHOW_ACTIONS' });
    return Array.isArray(value) ? value.filter((action): action is string => typeof action === 'string') : [];
  } catch {
    return [];
  }
}

/** Home owns pointer resolution and its narrow legacy compatibility fallback. */
export async function fetchAccountAvatar(address: string, actions: readonly string[]): Promise<AccountAvatarFetch> {
  if (!actions.includes('FETCH_ACCOUNT_AVATAR')) return { kind: 'unavailable' };

  try {
    return parseAccountAvatar(
      await qdnRequest<unknown>({ action: 'FETCH_ACCOUNT_AVATAR', address, maxBytes: AVATAR_MAX_BYTES }),
      address,
    );
  } catch {
    return { kind: 'unavailable' };
  }
}

export function revokeAvatarObjectUrl(src: string | null | undefined) {
  if (typeof src === 'string' && src.startsWith('blob:')) URL.revokeObjectURL(src);
}
