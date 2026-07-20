// In-memory transport for tests and local development. Deterministic:
// timestamps and signatures come from a counter, sender identity is injected.

import type { Address } from '../protocol/types';
import type { ChatTransport, IncomingChat, Route } from './types';

function routeKey(route: Route): string {
  return route.mode === 'group' ? `g:${route.groupId}` : `d:${route.to}`;
}

export class MemoryHub {
  private messages: IncomingChat[] = [];
  private listeners = new Map<string, Set<(msg: IncomingChat) => void>>();
  private clock = 1_000;
  private seq = 0;

  deliver(data: string, signer: Address, route: Route): { signature: string } {
    const msg: IncomingChat = {
      data,
      signer,
      signature: `sig-${++this.seq}`,
      timestamp: (this.clock += 1_000),
      route,
    };
    this.messages.push(msg);
    for (const listener of this.listeners.get(routeKey(route)) ?? []) {
      listener(msg);
    }
    return { signature: msg.signature };
  }

  fetch(route: Route, opts?: { after?: number; limit?: number }): IncomingChat[] {
    const key = routeKey(route);
    let result = this.messages.filter(
      (m) => routeKey(m.route) === key && m.timestamp > (opts?.after ?? 0),
    );
    if (opts?.limit !== undefined) {
      result = result.slice(0, opts.limit);
    }
    return result;
  }

  subscribe(route: Route, onMessage: (msg: IncomingChat) => void): () => void {
    const key = routeKey(route);
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(onMessage);
    return () => set.delete(onMessage);
  }

  /** A transport bound to one sender identity, sharing this hub. */
  client(signer: Address): ChatTransport {
    const hub = this;
    return {
      async send(data, route) {
        return hub.deliver(data, signer, route);
      },
      async fetch(route, opts) {
        return hub.fetch(route, opts);
      },
      subscribe(route, onMessage) {
        return hub.subscribe(route, onMessage);
      },
    };
  }
}
