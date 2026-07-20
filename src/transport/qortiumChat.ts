// Real Qortium chat transport for group routes: sends through the Home bridge
// (SEND_CHAT_MESSAGE / SEARCH_CHAT_MESSAGES with node-API fallback for reads),
// live updates via the node's chat websocket with polling as a safety net.
// Request and websocket factories are injectable for tests.

import type { ChatTransport, IncomingChat, Route } from './types';

export type BridgeRequest = (request: Record<string, unknown>) => Promise<unknown>;

export type RawChatMessage = {
  data?: string | null;
  encoding?: 'BASE58' | 'BASE64';
  isEncrypted?: boolean;
  isText?: boolean;
  sender: string;
  signature?: string | null;
  timestamp: number;
  txGroupId: number;
};

// Loose handler params so the DOM WebSocket satisfies this interface under
// strict function-type checking.
type WebSocketLike = {
  close(): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onclose: ((event: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onmessage: ((event: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onopen: ((event: any) => void) | null;
};

export type QortiumChatTransportOptions = {
  request: BridgeRequest;
  /** ws:// or wss:// base derived from the node API origin; null disables live sockets. */
  webSocketUrlBase: string | null;
  createWebSocket?: (url: string) => WebSocketLike;
  fetchLimit?: number;
  pollIntervalMs?: number;
};

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function mapRawChatMessage(raw: RawChatMessage, route: Route): IncomingChat | null {
  if (!raw || typeof raw.timestamp !== 'number' || typeof raw.sender !== 'string') {
    return null;
  }
  if (raw.isEncrypted || raw.isText === false || !raw.data || !raw.signature) {
    return null;
  }
  if (raw.encoding && raw.encoding !== 'BASE64') {
    return null;
  }
  let data: string;
  try {
    data = decodeBase64Utf8(raw.data);
  } catch {
    return null;
  }
  return { data, signer: raw.sender, signature: raw.signature, timestamp: raw.timestamp, route };
}

export class QortiumChatTransport implements ChatTransport {
  private readonly request: BridgeRequest;
  private readonly webSocketUrlBase: string | null;
  private readonly createWebSocket?: (url: string) => WebSocketLike;
  private readonly fetchLimit: number;
  private readonly pollIntervalMs: number;

  constructor(options: QortiumChatTransportOptions) {
    this.request = options.request;
    this.webSocketUrlBase = options.webSocketUrlBase;
    this.createWebSocket = options.createWebSocket;
    this.fetchLimit = options.fetchLimit ?? 100;
    this.pollIntervalMs = options.pollIntervalMs ?? 15_000;
  }

  async send(data: string, route: Route): Promise<{ signature: string }> {
    if (route.mode !== 'group') {
      throw new Error('Direct-message games are not implemented yet.');
    }
    const result = (await this.request({
      action: 'SEND_CHAT_MESSAGE',
      groupId: route.groupId,
      message: data,
    })) as { signature?: string } | null;
    return { signature: result?.signature ?? `sent-${Date.now()}` };
  }

  private async searchRaw(groupId: number, opts?: { after?: number; limit?: number }): Promise<RawChatMessage[]> {
    const limit = opts?.limit ?? this.fetchLimit;
    const after = typeof opts?.after === 'number' && opts.after > 0 ? opts.after : undefined;
    try {
      const raw = (await this.request({
        action: 'SEARCH_CHAT_MESSAGES',
        encoding: 'BASE64',
        groupId,
        limit,
        reverse: true,
        ...(after !== undefined ? { after } : {}),
      })) as RawChatMessage[] | null;
      if (Array.isArray(raw)) {
        return raw;
      }
    } catch {
      // Bridge action unavailable (e.g. local-browser spectator mode) —
      // read the node API directly, which the local fallback supports.
    }
    const query = new URLSearchParams({
      txGroupId: String(groupId),
      encoding: 'BASE64',
      limit: String(limit),
      reverse: 'true',
    });
    if (after !== undefined) {
      query.set('after', String(after));
    }
    const result = (await this.request({
      action: 'FETCH_NODE_API',
      method: 'GET',
      path: `/chat/messages?${query.toString()}`,
    })) as { data?: unknown } | null;
    return Array.isArray(result?.data) ? (result.data as RawChatMessage[]) : [];
  }

  async fetch(route: Route, opts?: { after?: number; limit?: number }): Promise<IncomingChat[]> {
    if (route.mode !== 'group') {
      return [];
    }
    const raw = await this.searchRaw(route.groupId, opts);
    return raw
      .map((message) => mapRawChatMessage(message, route))
      .filter((message): message is IncomingChat => message !== null)
      .filter((message) => message.timestamp > (opts?.after ?? 0))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  subscribe(route: Route, onMessage: (msg: IncomingChat) => void): () => void {
    if (route.mode !== 'group') {
      return () => {};
    }

    let closed = false;
    let socket: WebSocketLike | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSeen = 0;

    const deliver = (incoming: IncomingChat) => {
      lastSeen = Math.max(lastSeen, incoming.timestamp);
      onMessage(incoming);
    };

    const handlePayload = (payload: unknown) => {
      const entries = Array.isArray(payload) ? payload : [payload];
      for (const entry of entries) {
        const mapped = mapRawChatMessage(entry as RawChatMessage, route);
        if (mapped) {
          deliver(mapped);
        }
      }
    };

    const connect = () => {
      if (closed || !this.webSocketUrlBase || !this.createWebSocket) {
        return;
      }
      const query = new URLSearchParams({
        txGroupId: String(route.groupId),
        encoding: 'BASE64',
        limit: '50',
        reverse: 'true',
      });
      try {
        socket = this.createWebSocket(`${this.webSocketUrlBase}/websockets/chat/messages?${query.toString()}`);
      } catch {
        socket = null;
        return;
      }
      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') {
          return;
        }
        try {
          handlePayload(JSON.parse(event.data));
        } catch {
          // Non-JSON frames (pings) are ignored.
        }
      };
      socket.onclose = () => {
        socket = null;
        if (!closed) {
          reconnectTimer = setTimeout(connect, 5_000);
        }
      };
    };

    connect();

    // Polling safety net: catches messages the socket missed (or everything,
    // when no socket is available). GameService dedupes by signature.
    const pollTimer = setInterval(() => {
      this.fetch(route, { after: lastSeen })
        .then((messages) => messages.forEach(deliver))
        .catch(() => {});
    }, this.pollIntervalMs);

    return () => {
      closed = true;
      clearInterval(pollTimer);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
      socket = null;
    };
  }
}
