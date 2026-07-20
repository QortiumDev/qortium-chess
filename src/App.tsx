import { useCallback, useEffect, useState } from 'react';
import type { ChessNavigationIntent, ChessRoute } from './deepLink';
import { navigateChessRoute, parseChessRoute, subscribeToChessRoute } from './deepLink';
import { applyDisplaySettings, getDisplaySettingsUpdateFromMessage, getInitialDisplaySettings } from './displaySettings';
import { useChessService } from './game/useChessService';
import { GameRoom } from './ui/GameRoom';
import { LocalBoard } from './ui/LocalBoard';
import { Lobby } from './ui/Lobby';

const APP_TITLE = 'Chess';

type View = { kind: 'lobby' } | { kind: 'game'; gameId: string } | { kind: 'local' };

// The route layer already serializes `?view=developers`, but the Developers
// workspace itself is not built yet. Until it lands, that route degrades to the
// lobby and the address is rewritten in place so the URL never advertises a
// workspace the app cannot render.
function viewFromRoute(route: ChessRoute): View {
  switch (route.view) {
    case 'game':
      return { kind: 'game', gameId: route.gameId };
    case 'local':
      return { kind: 'local' };
    default:
      return { kind: 'lobby' };
  }
}

function routeFromView(view: View): ChessRoute {
  return view.kind === 'game' ? { view: 'game', gameId: view.gameId } : { view: view.kind };
}

export function App() {
  const chess = useChessService();
  const [view, setView] = useState<View>(() => viewFromRoute(parseChessRoute()));
  const [display, setDisplay] = useState(getInitialDisplaySettings);

  // Single seam for view changes: update state and the address together, so
  // Home's visible URL and Back/Forward stay in step with the workspace.
  const goTo = useCallback((next: View, intent: ChessNavigationIntent = 'standard') => {
    setView(next);
    navigateChessRoute(routeFromView(next), intent);
  }, []);

  useEffect(() => subscribeToChessRoute((route) => setView(viewFromRoute(route))), []);

  // Canonicalize the entry URL without adding a history entry: `?view=developers`
  // and malformed targets collapse to the lobby, and a bare load gains `?view=lobby`.
  useEffect(() => {
    const entry = parseChessRoute();

    navigateChessRoute(
      routeFromView(viewFromRoute(entry)),
      entry.view === 'developers' ? 'invalid-target' : 'canonicalize',
    );
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const next = getDisplaySettingsUpdateFromMessage(event.data, display);

      if (next) {
        setDisplay(next);
        applyDisplaySettings(next);
      }
    };

    window.addEventListener('message', onMessage);

    return () => window.removeEventListener('message', onMessage);
  }, [display]);

  const canPlay = chess.status === 'ready';
  const statusLabel =
    chess.status === 'connecting'
      ? 'Connecting…'
      : chess.status === 'ready'
        ? `Playing as ${chess.accountName ?? chess.address}`
        : chess.status === 'spectator'
          ? 'Spectator (no account)'
          : 'Lobby unavailable — local play only';

  const activeGame =
    view.kind === 'game' ? chess.games.find((game) => game.gameId === view.gameId) : undefined;

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Qortium</p>
            <h1>{APP_TITLE}</h1>
          </div>
          <div className="topbar-right">
            <p className="runtime-note">{statusLabel}</p>
            <nav className="view-tabs">
              <button
                type="button"
                className={view.kind !== 'local' ? 'active' : ''}
                onClick={() => goTo({ kind: 'lobby' })}
              >
                Lobby
              </button>
              <button
                type="button"
                className={view.kind === 'local' ? 'active' : ''}
                onClick={() => goTo({ kind: 'local' })}
              >
                Local board
              </button>
            </nav>
          </div>
        </header>

        {view.kind === 'local' ? (
          <LocalBoard />
        ) : view.kind === 'game' && activeGame ? (
          <GameRoom
            game={activeGame}
            service={chess.service}
            me={chess.address}
            canPlay={canPlay}
            onBack={() => goTo({ kind: 'lobby' })}
          />
        ) : chess.status === 'unavailable' ? (
          <div>
            <div className="notice">
              Could not reach the Chess lobby ({chess.error ?? 'no node'}). The local board still works.
            </div>
            <LocalBoard />
          </div>
        ) : (
          <Lobby
            games={chess.games}
            me={chess.address}
            isGroupMember={chess.isGroupMember}
            canPlay={canPlay}
            onOpenGame={(gameId) => goTo({ kind: 'game', gameId })}
            onCreateInvite={async (colorChoice, note) => {
              const { gameId } = await chess.service!.createInvite({
                colorChoice,
                isPublic: true,
                ...(note.trim() ? { note: note.trim() } : {}),
              });
              goTo({ kind: 'game', gameId });
            }}
            onJoin={(gameId) => chess.service!.join(gameId)}
            onCancelInvite={(gameId) => chess.service!.cancelInvite(gameId)}
            onJoinedGroup={() => chess.refreshMembership()}
          />
        )}
      </section>
    </main>
  );
}
