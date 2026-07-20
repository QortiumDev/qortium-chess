// Transport seam — QCH1 spec §6. GameService talks only to this interface;
// implementations: MemoryTransport (tests/dev), ChatTransport (Home bridge).

import type { Address } from '../protocol/types';

export type Route =
  | { mode: 'group'; groupId: number }
  | { mode: 'direct'; to: Address };

export type IncomingChat = {
  /** Raw CHAT message string (JSON envelope or human text). */
  data: string;
  /** Verified sender address (the CHAT tx signer). */
  signer: Address;
  /** Chat tx signature — dedupe key. */
  signature: string;
  /** Node timestamp, ms. UI only, never consensus. */
  timestamp: number;
  route: Route;
};

export interface ChatTransport {
  send(data: string, route: Route): Promise<{ signature: string }>;
  /** Historical fetch, ascending timestamp. */
  fetch(route: Route, opts?: { after?: number; limit?: number }): Promise<IncomingChat[]>;
  /** Live updates. Returns unsubscribe. */
  subscribe(route: Route, onMessage: (msg: IncomingChat) => void): () => void;
}
