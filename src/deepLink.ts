// Deep links let a chess game be shared and opened directly, and let the browser
// History API drive the active workspace so Qortium Home's visible address and
// Back/Forward controls track it without reloading the app.
//
// Qortium Home renders the app at `/render/<service>/<name>/<identifier>/<path>`
// and preserves any extra query params from the opened qdn:// address into that
// render URL, so `?view=game&gameId=<id>` round-trips into the app's own
// `window.location.search`.
//
// A shared link looks like `qdn://APP/Chess/Chess?view=game&gameId=<id>`. Because
// it is a qdn:// address it is also clickable from other Qortium apps, opening a
// Home tab focused on that game.
//
// Canonical route (SPEC-spec-first-qortium-apps.md §3):
//   qdn://APP/Chess/Chess?view=lobby|local|game|developers[&gameId=<id>]
//
// `developer` and `reference` are accepted as read-time aliases of `developers`
// but are always re-serialized as `developers`.

const DEFAULT_SERVICE = 'APP';
const DEFAULT_NAME = 'Chess';
const DEFAULT_IDENTIFIER = 'Chess';

export const VIEW_QUERY_PARAM = 'view';
export const GAME_ID_QUERY_PARAM = 'gameId';

// The only query keys this app owns. Serializers delete exactly these and leave
// everything else untouched: Home's display/bridge parameters (qdnHomeBridge,
// theme, lang, textSize, accent, uiStyle), unknown future host parameters,
// repeated parameters, and the URL fragment. Preservation is by default, not by
// allowlist, so a host parameter added after this app ships still survives.
export const APP_ROUTE_QUERY_PARAMS = [VIEW_QUERY_PARAM, GAME_ID_QUERY_PARAM] as const;

// `developers` is canonical; the other two are read-time aliases only.
const DEVELOPER_ALIASES = new Set(['developer', 'developers', 'reference']);

export type ChessRouteView = 'developers' | 'game' | 'local' | 'lobby';

export type ChessRoute =
  | { view: 'developers' | 'local' | 'lobby' }
  | { view: 'game'; gameId: string };

// `standard` is a real user navigation and gets its own history entry. Every
// other intent rewrites an entry that should not be reachable via Back: a route
// the app canonicalized on load, a target that turned out not to exist, and a
// game that ended or was cancelled underneath the player.
export type ChessNavigationIntent = 'canonicalize' | 'game-ended' | 'invalid-target' | 'standard';

export type ChessRouteViewState = {
  // Set while a `?view=game` deep link is still waiting for the lobby to load
  // that game; the lobby stays visible until it resolves.
  pendingGameId: string | null;
  selectedGameId: string | null;
  view: ChessRouteView;
};

export type LocationLike = {
  hash?: string;
  pathname?: string;
  search?: string;
};

// Core injects these globals into every rendered QDN page (see Core's HTMLParser),
// so they are the authoritative identity of the resource we are running inside.
export type QdnHostGlobals = {
  _qdnService?: unknown;
  _qdnName?: unknown;
  _qdnIdentifier?: unknown;
};

export type ChessRouteTarget = {
  location: { search: string };
  addEventListener: (type: 'popstate', listener: () => void) => void;
  removeEventListener: (type: 'popstate', listener: () => void) => void;
};

function resolveLocation(location?: LocationLike): LocationLike {
  if (location) {
    return location;
  }

  return typeof window === 'undefined' ? {} : window.location;
}

function resolveHost(host?: QdnHostGlobals): QdnHostGlobals {
  if (host) {
    return host;
  }

  return typeof window === 'undefined' ? {} : (window as Window & QdnHostGlobals);
}

function cleanGlobal(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function decodeSegment(value: string | undefined): string {
  if (!value) {
    return '';
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Accepts either a bare search string (`?view=game&gameId=x`) or a full href, so
// callers can hand over `window.location.search` or `window.location.href`.
function toSearchParams(search: string): URLSearchParams {
  const routeSearch =
    search.startsWith('?') || !search.includes('?') ? search : new URL(search, 'http://localhost').search;

  return new URLSearchParams(routeSearch);
}

// Normalize a raw `view` value: trimmed, case-insensitive, aliases folded onto
// the canonical `developers`. Returns null for absent, blank, or unknown values
// so the caller can apply the documented fallback.
function normalizeView(raw: string | null | undefined): ChessRouteView | null {
  const value = raw?.trim().toLowerCase();

  if (!value) {
    return null;
  }

  if (DEVELOPER_ALIASES.has(value)) {
    return 'developers';
  }

  return value === 'lobby' || value === 'local' || value === 'game' ? value : null;
}

// Precedence, for links that arrive with conflicting or partial route keys:
//
//   1. Repeated route keys: the first occurrence wins (URLSearchParams.get).
//   2. A recognized `view` is authoritative. `gameId` is read only when the view
//      resolves to `game`, so `?view=local&gameId=x` opens the local board.
//   3. `view=game` requires a non-empty `gameId`; without one the link is
//      incomplete and degrades to the lobby.
//   4. When `view` is absent, blank, or unrecognized, a non-empty `gameId` still
//      opens that game (hand-written and legacy links), otherwise the lobby.
//
// The lobby is the default for anything that does not resolve above.
export function parseChessRoute(search?: string): ChessRoute {
  const raw = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const params = toSearchParams(raw);
  const view = normalizeView(params.get(VIEW_QUERY_PARAM));
  const gameId = params.get(GAME_ID_QUERY_PARAM)?.trim();

  if (view === 'game') {
    return gameId ? { gameId, view: 'game' } : { view: 'lobby' };
  }

  if (view) {
    return { view };
  }

  return gameId ? { gameId, view: 'game' } : { view: 'lobby' };
}

// Rewrite only Chess-owned route keys. Home's display/bridge parameters, unknown
// future host parameters, repeated parameters, and the fragment stay attached to
// the rendered document.
export function buildChessRoute(route: ChessRoute, location?: LocationLike): string {
  const resolved = resolveLocation(location);
  const query = new URLSearchParams(resolved.search ?? '');

  for (const parameter of APP_ROUTE_QUERY_PARAMS) {
    query.delete(parameter);
  }

  query.set(VIEW_QUERY_PARAM, route.view);

  if (route.view === 'game') {
    query.set(GAME_ID_QUERY_PARAM, route.gameId);
  }

  const queryString = query.toString();

  return `${resolved.pathname || '/'}${queryString ? `?${queryString}` : ''}${resolved.hash ?? ''}`;
}

export function shouldReplaceHistory(intent: ChessNavigationIntent): boolean {
  return intent !== 'standard';
}

// Pure resolver: turns a parsed route into the state the shell renders. Used for
// the first paint and again on every popstate, so Back and Forward rehydrate the
// visible workspace without a reload.
export function resolveChessRouteViewState(route: ChessRoute, isGameLoaded = false): ChessRouteViewState {
  switch (route.view) {
    case 'developers':
      return { pendingGameId: null, selectedGameId: null, view: 'developers' };
    case 'game':
      return {
        pendingGameId: isGameLoaded ? null : route.gameId,
        selectedGameId: isGameLoaded ? route.gameId : null,
        view: isGameLoaded ? 'game' : 'lobby',
      };
    case 'local':
      return { pendingGameId: null, selectedGameId: null, view: 'local' };
    case 'lobby':
      return { pendingGameId: null, selectedGameId: null, view: 'lobby' };
  }
}

// The only functions in this module that touch the DOM. Everything above is pure
// and testable without a window.
export function navigateChessRoute(route: ChessRoute, intent: ChessNavigationIntent = 'standard'): void {
  const href = buildChessRoute(route, window.location);
  // Pass the existing history state through rather than clobbering it, so Home's
  // own entry state survives an in-app navigation.
  window.history[shouldReplaceHistory(intent) ? 'replaceState' : 'pushState'](window.history.state, '', href);
}

export function subscribeToChessRoute(
  onRoute: (route: ChessRoute) => void,
  target: ChessRouteTarget = window,
): () => void {
  const onPopState = () => onRoute(parseChessRoute(target.location.search));

  target.addEventListener('popstate', onPopState);

  return () => target.removeEventListener('popstate', onPopState);
}

// Derive `qdn://<service>/<name>/<identifier>` for the resource hosting this app.
// Prefer Core's injected `_qdnService`/`_qdnName`/`_qdnIdentifier` globals; fall
// back to parsing the path-segment render route, then to the published
// APP/Chess/Chess identity (e.g. in local dev where nothing is injected).
export function getAppBaseAddress(location?: LocationLike, host?: QdnHostGlobals): string {
  const { pathname = '' } = resolveLocation(location);
  const { _qdnService, _qdnName, _qdnIdentifier } = resolveHost(host);
  const renderMatch = pathname.match(/\/render\/([^/]+)\/([^/]+)(?:\/([^/?#]+))?/i);

  const service = cleanGlobal(_qdnService) || decodeSegment(renderMatch?.[1]) || DEFAULT_SERVICE;
  const name = cleanGlobal(_qdnName) || decodeSegment(renderMatch?.[2]) || DEFAULT_NAME;
  const identifier = cleanGlobal(_qdnIdentifier) || decodeSegment(renderMatch?.[3]) || DEFAULT_IDENTIFIER;

  return `qdn://${encodeURIComponent(service)}/${encodeURIComponent(name)}/${encodeURIComponent(identifier)}`;
}

// Shareable `qdn://` address for one game, clickable inside Home and inside
// other Qortium apps' message bodies.
export function buildGameLink(gameId: string, location?: LocationLike, host?: QdnHostGlobals): string {
  const query = new URLSearchParams({ [VIEW_QUERY_PARAM]: 'game', [GAME_ID_QUERY_PARAM]: gameId });

  return `${getAppBaseAddress(location, host)}?${query.toString()}`;
}
