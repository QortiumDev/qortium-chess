import { describe, expect, it, vi } from 'vitest';
import { CHESS_GROUP_ID } from '../protocol/types';
import { mapRawChatMessage, QortiumChatTransport } from './qortiumChat';
import type { Route } from './types';

const ROUTE: Route = { mode: 'group', groupId: CHESS_GROUP_ID };

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  return btoa(String.fromCharCode(...bytes));
}

const RAW = {
  data: base64('{"app":"chess"}'),
  encoding: 'BASE64' as const,
  isText: true,
  sender: 'QSENDER',
  signature: 'sig-1',
  timestamp: 1000,
  txGroupId: CHESS_GROUP_ID,
};

describe('mapRawChatMessage', () => {
  it('decodes base64 data and keeps signer/signature/timestamp', () => {
    expect(mapRawChatMessage(RAW, ROUTE)).toEqual({
      data: '{"app":"chess"}',
      signer: 'QSENDER',
      signature: 'sig-1',
      timestamp: 1000,
      route: ROUTE,
    });
  });

  it('drops encrypted, non-text, unsigned, and non-base64 messages', () => {
    expect(mapRawChatMessage({ ...RAW, isEncrypted: true }, ROUTE)).toBeNull();
    expect(mapRawChatMessage({ ...RAW, isText: false }, ROUTE)).toBeNull();
    expect(mapRawChatMessage({ ...RAW, signature: null }, ROUTE)).toBeNull();
    expect(mapRawChatMessage({ ...RAW, encoding: 'BASE58' }, ROUTE)).toBeNull();
    expect(mapRawChatMessage({ ...RAW, data: null }, ROUTE)).toBeNull();
  });
});

describe('QortiumChatTransport', () => {
  it('sends through SEND_CHAT_MESSAGE with the group id', async () => {
    const request = vi.fn().mockResolvedValue({ signature: 'tx-sig' });
    const transport = new QortiumChatTransport({ request, webSocketUrlBase: null });

    const result = await transport.send('{"app":"chess"}', ROUTE);

    expect(request).toHaveBeenCalledWith({
      action: 'SEND_CHAT_MESSAGE',
      groupId: CHESS_GROUP_ID,
      message: '{"app":"chess"}',
    });
    expect(result.signature).toBe('tx-sig');
  });

  it('fetches, filters by after, and returns ascending order', async () => {
    const older = { ...RAW, signature: 'sig-old', timestamp: 500 };
    const newer = { ...RAW, signature: 'sig-new', timestamp: 2000 };
    const request = vi.fn().mockResolvedValue([newer, RAW, older]);
    const transport = new QortiumChatTransport({ request, webSocketUrlBase: null });

    const messages = await transport.fetch(ROUTE, { after: 600 });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SEARCH_CHAT_MESSAGES', groupId: CHESS_GROUP_ID, after: 600 }),
    );
    expect(messages.map((m) => m.signature)).toEqual(['sig-1', 'sig-new']);
  });

  it('delivers websocket frames (single object or array) to subscribers', () => {
    type Handler = ((event: { data: unknown }) => void) | null;
    const socket = { close: vi.fn(), onclose: null, onmessage: null as Handler, onopen: null };
    const transport = new QortiumChatTransport({
      request: vi.fn().mockResolvedValue([]),
      webSocketUrlBase: 'ws://127.0.0.1:24891',
      createWebSocket: () => socket,
      pollIntervalMs: 1_000_000,
    });

    const received: string[] = [];
    const unsubscribe = transport.subscribe(ROUTE, (msg) => received.push(msg.signature));

    socket.onmessage?.({ data: JSON.stringify([RAW]) });
    socket.onmessage?.({ data: JSON.stringify({ ...RAW, signature: 'sig-2' }) });
    socket.onmessage?.({ data: 'not-json' });

    expect(received).toEqual(['sig-1', 'sig-2']);
    unsubscribe();
    expect(socket.close).toHaveBeenCalled();
  });
});

describe('node-API fallback', () => {
  it('falls back to FETCH_NODE_API when SEARCH_CHAT_MESSAGES is unavailable', async () => {
    const request = vi.fn(async (req: Record<string, unknown>) => {
      if (req.action === 'SEARCH_CHAT_MESSAGES') {
        throw new Error('not available');
      }
      expect(req.action).toBe('FETCH_NODE_API');
      expect(String(req.path)).toContain(`txGroupId=${CHESS_GROUP_ID}`);
      return { data: [RAW] };
    });
    const transport = new QortiumChatTransport({ request, webSocketUrlBase: null });

    const messages = await transport.fetch(ROUTE);

    expect(messages).toHaveLength(1);
    expect(messages[0].signature).toBe('sig-1');
  });
});
