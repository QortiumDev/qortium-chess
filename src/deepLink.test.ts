import { describe, expect, it, vi } from 'vitest';
import {
  APP_ROUTE_QUERY_PARAMS,
  buildChessRoute,
  buildGameLink,
  GAME_ID_QUERY_PARAM,
  getAppBaseAddress,
  parseChessRoute,
  resolveChessRouteViewState,
  shouldReplaceHistory,
  subscribeToChessRoute,
  VIEW_QUERY_PARAM,
  type ChessRoute,
} from './deepLink';

// Every route kind, used for the round-trip property below.
const ALL_ROUTES: ChessRoute[] = [
  { view: 'lobby' },
  { view: 'local' },
  { view: 'developers' },
  { gameId: 'game-abc123', view: 'game' },
];

// Home's own query parameters, per SPEC-spec-first-qortium-apps.md §3. The app
// must never consume or drop these.
const HOME_PARAMS = 'qdnHomeBridge=1&theme=dark&lang=fr&textSize=large&accent=teal&uiStyle=modern';

describe('route query keys', () => {
  it('owns exactly the view and gameId keys', () => {
    expect(VIEW_QUERY_PARAM).toBe('view');
    expect(GAME_ID_QUERY_PARAM).toBe('gameId');
    expect([...APP_ROUTE_QUERY_PARAMS]).toEqual(['view', 'gameId']);
  });
});

describe('parseChessRoute', () => {
  it('parses each canonical view', () => {
    expect(parseChessRoute('?view=lobby')).toEqual({ view: 'lobby' });
    expect(parseChessRoute('?view=local')).toEqual({ view: 'local' });
    expect(parseChessRoute('?view=developers')).toEqual({ view: 'developers' });
    expect(parseChessRoute('?view=game&gameId=g1')).toEqual({ gameId: 'g1', view: 'game' });
  });

  it('accepts developer and reference as read-time aliases of developers', () => {
    expect(parseChessRoute('?view=developer')).toEqual({ view: 'developers' });
    expect(parseChessRoute('?view=reference')).toEqual({ view: 'developers' });
    expect(parseChessRoute('?view=DEVELOPERS')).toEqual({ view: 'developers' });
    expect(parseChessRoute('?view=%20Reference%20')).toEqual({ view: 'developers' });
  });

  it('normalizes case and surrounding whitespace on every view value', () => {
    expect(parseChessRoute('?view=LOBBY')).toEqual({ view: 'lobby' });
    expect(parseChessRoute('?view=%20Local%20')).toEqual({ view: 'local' });
    expect(parseChessRoute('?view=Game&gameId=%20g2%20')).toEqual({ gameId: 'g2', view: 'game' });
  });

  it('defaults to the lobby for absent, blank, and invalid views', () => {
    expect(parseChessRoute('')).toEqual({ view: 'lobby' });
    expect(parseChessRoute('?')).toEqual({ view: 'lobby' });
    expect(parseChessRoute(`?${HOME_PARAMS}`)).toEqual({ view: 'lobby' });
    expect(parseChessRoute('?view=')).toEqual({ view: 'lobby' });
    expect(parseChessRoute('?view=%20%20')).toEqual({ view: 'lobby' });
    expect(parseChessRoute('?view=bogus')).toEqual({ view: 'lobby' });
    expect(parseChessRoute('?view=settings')).toEqual({ view: 'lobby' });
  });

  // Precedence rule 3: an incomplete game link is not a game route.
  it('degrades view=game with a missing or blank gameId to the lobby', () => {
    expect(parseChessRoute('?view=game')).toEqual({ view: 'lobby' });
    expect(parseChessRoute('?view=game&gameId=')).toEqual({ view: 'lobby' });
    expect(parseChessRoute('?view=game&gameId=%20%20')).toEqual({ view: 'lobby' });
    expect(parseChessRoute(`?view=game&${HOME_PARAMS}`)).toEqual({ view: 'lobby' });
  });

  // Precedence rule 2: a recognized view wins over a stale gameId riding along.
  it('ignores gameId when a recognized view is not game', () => {
    expect(parseChessRoute('?view=local&gameId=g1')).toEqual({ view: 'local' });
    expect(parseChessRoute('?view=lobby&gameId=g1')).toEqual({ view: 'lobby' });
    expect(parseChessRoute('?view=developers&gameId=g1')).toEqual({ view: 'developers' });
    expect(parseChessRoute('?view=reference&gameId=g1')).toEqual({ view: 'developers' });
  });

  // Precedence rule 4: a bare or unrecognized view still honours a game target.
  it('promotes a lone gameId to the game view', () => {
    expect(parseChessRoute('?gameId=g1')).toEqual({ gameId: 'g1', view: 'game' });
    expect(parseChessRoute('?view=&gameId=g1')).toEqual({ gameId: 'g1', view: 'game' });
    expect(parseChessRoute('?view=bogus&gameId=g1')).toEqual({ gameId: 'g1', view: 'game' });
    expect(parseChessRoute(`?gameId=g1&${HOME_PARAMS}`)).toEqual({ gameId: 'g1', view: 'game' });
  });

  // Precedence rule 1.
  it('takes the first occurrence when a route key is repeated', () => {
    expect(parseChessRoute('?view=local&view=developers')).toEqual({ view: 'local' });
    expect(parseChessRoute('?view=game&gameId=first&gameId=second')).toEqual({
      gameId: 'first',
      view: 'game',
    });
  });

  it('accepts a full href as well as a bare search string', () => {
    expect(parseChessRoute('/render/APP/Chess/Chess?view=game&gameId=g1#anchor')).toEqual({
      gameId: 'g1',
      view: 'game',
    });
    expect(parseChessRoute('http://localhost:5173/?view=developers')).toEqual({ view: 'developers' });
  });

  it('does not mistake a host parameter for a route key', () => {
    expect(parseChessRoute('?overview=game&subgameId=g1')).toEqual({ view: 'lobby' });
  });
});

describe('buildChessRoute', () => {
  const location = {
    hash: '#board-anchor',
    pathname: '/render/APP/Chess/Chess',
    search: `?${HOME_PARAMS}&view=game&gameId=stale&futureHostParam=42`,
  };

  it('serializes each view and replaces stale Chess keys in place', () => {
    expect(buildChessRoute({ view: 'lobby' }, location)).toBe(
      '/render/APP/Chess/Chess?qdnHomeBridge=1&theme=dark&lang=fr&textSize=large&accent=teal&uiStyle=modern&futureHostParam=42&view=lobby#board-anchor',
    );
    expect(buildChessRoute({ view: 'local' }, location)).toBe(
      '/render/APP/Chess/Chess?qdnHomeBridge=1&theme=dark&lang=fr&textSize=large&accent=teal&uiStyle=modern&futureHostParam=42&view=local#board-anchor',
    );
    expect(buildChessRoute({ view: 'developers' }, location)).toBe(
      '/render/APP/Chess/Chess?qdnHomeBridge=1&theme=dark&lang=fr&textSize=large&accent=teal&uiStyle=modern&futureHostParam=42&view=developers#board-anchor',
    );
    expect(buildChessRoute({ gameId: 'g-9', view: 'game' }, location)).toBe(
      '/render/APP/Chess/Chess?qdnHomeBridge=1&theme=dark&lang=fr&textSize=large&accent=teal&uiStyle=modern&futureHostParam=42&view=game&gameId=g-9#board-anchor',
    );
  });

  it('always serializes the developers alias canonically', () => {
    const aliased = { pathname: '/', search: '?view=reference' };

    expect(buildChessRoute(parseChessRoute(aliased.search), aliased)).toBe('/?view=developers');
    expect(buildChessRoute(parseChessRoute('?view=developer'), { pathname: '/', search: '?view=developer' })).toBe(
      '/?view=developers',
    );
  });

  it('drops the gameId when leaving the game view', () => {
    expect(
      buildChessRoute({ view: 'lobby' }, { pathname: '/', search: '?view=game&gameId=g1&theme=dark' }),
    ).toBe('/?theme=dark&view=lobby');
  });

  it('preserves an unknown future host parameter', () => {
    expect(buildChessRoute({ view: 'local' }, { pathname: '/', search: '?somethingNew=abc' })).toBe(
      '/?somethingNew=abc&view=local',
    );
  });

  it('preserves repeated host parameters and their order', () => {
    expect(
      buildChessRoute({ view: 'developers' }, { pathname: '/', search: '?tag=a&theme=dark&tag=b&tag=c' }),
    ).toBe('/?tag=a&theme=dark&tag=b&tag=c&view=developers');
  });

  it('removes every occurrence of a repeated app-owned key', () => {
    expect(
      buildChessRoute({ view: 'lobby' }, { pathname: '/', search: '?view=game&gameId=a&gameId=b&view=local&theme=dark' }),
    ).toBe('/?theme=dark&view=lobby');
  });

  it('preserves the URL fragment, including an empty search', () => {
    expect(buildChessRoute({ view: 'local' }, { pathname: '/', hash: '#deep/anchor?x=1' })).toBe(
      '/?view=local#deep/anchor?x=1',
    );
  });

  it('encodes game ids that contain URL-significant characters', () => {
    const href = buildChessRoute({ gameId: 'a b/c&d=e', view: 'game' }, { pathname: '/', search: '' });

    expect(href).toBe('/?view=game&gameId=a+b%2Fc%26d%3De');
    expect(parseChessRoute(href)).toEqual({ gameId: 'a b/c&d=e', view: 'game' });
  });

  it('falls back to a root pathname when the location has none', () => {
    expect(buildChessRoute({ view: 'lobby' }, {})).toBe('/?view=lobby');
  });
});

describe('round trip', () => {
  it('parses back every serialized view kind', () => {
    for (const route of ALL_ROUTES) {
      expect(parseChessRoute(buildChessRoute(route, { pathname: '/', search: '' }))).toEqual(route);
    }
  });

  it('round-trips every view kind through a host-decorated location with a fragment', () => {
    const location = { hash: '#anchor', pathname: '/render/APP/Chess/Chess', search: `?${HOME_PARAMS}` };

    for (const route of ALL_ROUTES) {
      expect(parseChessRoute(buildChessRoute(route, location))).toEqual(route);
    }
  });

  it('is idempotent: re-serializing a parsed route reproduces the same URL', () => {
    const location = { hash: '#a', pathname: '/x', search: '?theme=dark&view=reference&gameId=stale' };
    const once = buildChessRoute(parseChessRoute(location.search), location);
    const twice = buildChessRoute(parseChessRoute(once), { ...location, search: once.slice(once.indexOf('?')) });

    expect(once).toBe('/x?theme=dark&view=developers#a');
    expect(twice).toBe(once);
  });
});

describe('shouldReplaceHistory', () => {
  it('pushes a new entry only for standard navigation', () => {
    expect(shouldReplaceHistory('standard')).toBe(false);
    expect(shouldReplaceHistory('canonicalize')).toBe(true);
    expect(shouldReplaceHistory('invalid-target')).toBe(true);
    expect(shouldReplaceHistory('game-ended')).toBe(true);
  });
});

describe('resolveChessRouteViewState', () => {
  it('rehydrates the visible workspace for Back and Forward routes', () => {
    expect(resolveChessRouteViewState({ view: 'lobby' })).toEqual({
      pendingGameId: null,
      selectedGameId: null,
      view: 'lobby',
    });
    expect(resolveChessRouteViewState({ view: 'local' })).toEqual({
      pendingGameId: null,
      selectedGameId: null,
      view: 'local',
    });
    expect(resolveChessRouteViewState({ view: 'developers' })).toEqual({
      pendingGameId: null,
      selectedGameId: null,
      view: 'developers',
    });
  });

  it('holds a game deep link pending until the lobby has loaded that game', () => {
    expect(resolveChessRouteViewState({ gameId: 'g1', view: 'game' }, false)).toEqual({
      pendingGameId: 'g1',
      selectedGameId: null,
      view: 'lobby',
    });
    expect(resolveChessRouteViewState({ gameId: 'g1', view: 'game' }, true)).toEqual({
      pendingGameId: null,
      selectedGameId: 'g1',
      view: 'game',
    });
  });

  it('treats an unloaded game as pending by default', () => {
    expect(resolveChessRouteViewState({ gameId: 'g1', view: 'game' })).toEqual({
      pendingGameId: 'g1',
      selectedGameId: null,
      view: 'lobby',
    });
  });
});

describe('subscribeToChessRoute', () => {
  it('reparses the route on popstate and unsubscribes cleanly', () => {
    const listeners = new Set<() => void>();
    const target = {
      addEventListener: vi.fn((_type: 'popstate', listener: () => void) => {
        listeners.add(listener);
      }),
      location: { search: '?view=game&gameId=g1' },
      removeEventListener: vi.fn((_type: 'popstate', listener: () => void) => {
        listeners.delete(listener);
      }),
    };
    const onRoute = vi.fn();

    const unsubscribe = subscribeToChessRoute(onRoute, target);
    for (const listener of listeners) listener();

    expect(onRoute).toHaveBeenCalledWith({ gameId: 'g1', view: 'game' });

    target.location.search = '?view=reference';
    for (const listener of listeners) listener();

    expect(onRoute).toHaveBeenLastCalledWith({ view: 'developers' });

    unsubscribe();

    expect(listeners.size).toBe(0);
    expect(target.removeEventListener).toHaveBeenCalledTimes(1);
  });
});

describe('shareable qdn:// links', () => {
  it('prefers the identity Core injects as page globals', () => {
    expect(
      getAppBaseAddress(
        { pathname: '/render/APP/Chess/Chess' },
        { _qdnIdentifier: 'chess.mirror.v1', _qdnName: 'Operator', _qdnService: 'APP' },
      ),
    ).toBe('qdn://APP/Operator/chess.mirror.v1');
  });

  it('derives the app address from the path-segment render location', () => {
    expect(getAppBaseAddress({ pathname: '/render/APP/Chess/Chess', search: '?theme=dark' }, {})).toBe(
      'qdn://APP/Chess/Chess',
    );
  });

  it('falls back to the published identity outside the render host', () => {
    expect(getAppBaseAddress({ pathname: '/', search: '' }, {})).toBe('qdn://APP/Chess/Chess');
  });

  it('builds a shareable game link that parses back to the same game route', () => {
    const link = buildGameLink('g-42', { pathname: '/render/APP/Chess/Chess' }, {});

    expect(link).toBe('qdn://APP/Chess/Chess?view=game&gameId=g-42');
    expect(parseChessRoute(link.slice(link.indexOf('?')))).toEqual({ gameId: 'g-42', view: 'game' });
  });
});
