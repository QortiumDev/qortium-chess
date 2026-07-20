// React glue: builds the GameService over the real chat transport when the
// Home bridge (and an account) is available, and re-renders on every ingest.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CHESS_GROUP_ID } from '../protocol/types';
import { classicRules } from '../rules/classic';
import { QortiumChatTransport } from '../transport/qortiumChat';
import type { Route } from '../transport/types';
import { getNodeApiUrl, hasHomeBridge, qdnRequest } from '../qdnRequest';
import { GameService, type TrackedGame } from './service';

export const LOBBY_ROUTE: Route = { mode: 'group', groupId: CHESS_GROUP_ID };

/** Home bridge actions this hook issues beyond the transport's own. */
export const SELECTED_ACCOUNT_ACTION = 'GET_SELECTED_ACCOUNT';
export const JOIN_GROUP_ACTION = 'JOIN_GROUP';

/** Node API read used to decide whether the account may post to the group. */
export const GROUP_MEMBERSHIP_PATH_PREFIX = '/groups/member/';

export type ChessServiceState = {
  status: 'connecting' | 'ready' | 'spectator' | 'unavailable';
  address: string | null;
  accountName: string | null;
  isGroupMember: boolean;
  service: GameService | null;
  games: TrackedGame[];
  error: string | null;
};

function webSocketUrlBase(): string | null {
  try {
    const base = hasHomeBridge() && typeof window !== 'undefined'
      ? window.location.origin
      : getNodeApiUrl();
    const url = new URL(base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

async function fetchSelectedAccount(): Promise<{ address: string; name: string | null } | null> {
  try {
    const account = (await qdnRequest({ action: SELECTED_ACCOUNT_ACTION })) as
      | { address?: string; name?: string }
      | null;
    return account?.address ? { address: account.address, name: account.name ?? null } : null;
  } catch {
    return null;
  }
}

async function fetchIsGroupMember(address: string): Promise<boolean> {
  try {
    const result = (await qdnRequest({
      action: 'FETCH_NODE_API',
      method: 'GET',
      path: `${GROUP_MEMBERSHIP_PATH_PREFIX}${encodeURIComponent(address)}`,
    })) as { data?: unknown };
    const groups = Array.isArray(result?.data) ? result.data : [];
    return groups.some((group) => (group as { groupId?: number }).groupId === CHESS_GROUP_ID);
  } catch {
    return false;
  }
}

export function useChessService(): ChessServiceState & { refreshMembership: () => void } {
  const [state, setState] = useState<ChessServiceState>({
    status: 'connecting',
    address: null,
    accountName: null,
    isGroupMember: false,
    service: null,
    games: [],
    error: null,
  });
  const serviceRef = useRef<GameService | null>(null);
  const [membershipNonce, setMembershipNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const account = await fetchSelectedAccount();
      if (cancelled) return;

      const address = account?.address ?? null;
      const transport = new QortiumChatTransport({
        request: (request) => qdnRequest(request as { action: string }),
        webSocketUrlBase: webSocketUrlBase(),
        createWebSocket: typeof WebSocket !== 'undefined' ? (url) => new WebSocket(url) : undefined,
      });
      // Without an account we can still read the lobby (spectator mode).
      const service = new GameService({
        me: address ?? 'spectator',
        transport,
        route: LOBBY_ROUTE,
        rules: classicRules,
      });
      serviceRef.current = service;

      const unsubscribe = service.onUpdate(() => {
        setState((previous) => ({ ...previous, games: service.games() }));
      });

      try {
        await service.start();
      } catch (error) {
        if (!cancelled) {
          setState((previous) => ({
            ...previous,
            status: 'unavailable',
            error: error instanceof Error ? error.message : String(error),
          }));
        }
        return;
      }
      if (cancelled) {
        service.stop();
        unsubscribe();
        return;
      }

      cleanup = () => {
        service.stop();
        unsubscribe();
      };

      const isGroupMember = address ? await fetchIsGroupMember(address) : false;
      if (cancelled) return;

      setState({
        status: address ? 'ready' : 'spectator',
        address,
        accountName: account?.name ?? null,
        isGroupMember,
        service,
        games: service.games(),
        error: null,
      });
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [membershipNonce]);

  return useMemo(
    () => ({ ...state, refreshMembership: () => setMembershipNonce((n) => n + 1) }),
    [state],
  );
}

export async function joinChessGroup(): Promise<void> {
  await qdnRequest({ action: JOIN_GROUP_ACTION, groupId: CHESS_GROUP_ID });
}
