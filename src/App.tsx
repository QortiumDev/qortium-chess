import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChessNavigationIntent, ChessRoute } from './deepLink';
import { navigateChessRoute, parseChessRoute, subscribeToChessRoute } from './deepLink';
import { applyDisplaySettings, getDisplaySettingsUpdateFromMessage, getInitialDisplaySettings } from './displaySettings';
import { createTranslator } from './i18n';
import { useChessService } from './game/useChessService';
import { Reference } from './Reference';
import { GameRoom } from './ui/GameRoom';
import { LocalBoard } from './ui/LocalBoard';
import { Lobby } from './ui/Lobby';

// The Qortium wordmark is a brand name, not copy — it is intentionally not a
// catalog key and stays identical in every locale.
const BRAND = 'Qortium';

type View =
  | { kind: 'lobby' }
  | { kind: 'game'; gameId: string }
  | { kind: 'local' }
  | { kind: 'developers' };

function viewFromRoute(route: ChessRoute): View {
  switch (route.view) {
    case 'game':
      return { kind: 'game', gameId: route.gameId };
    case 'local':
      return { kind: 'local' };
    case 'developers':
      return { kind: 'developers' };
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

  // Canonicalize the entry URL without adding a history entry: read-time aliases
  // (`developer`, `reference`) re-serialize as `developers`, malformed targets
  // collapse to the lobby, and a bare load gains `?view=lobby`.
  useEffect(() => {
    navigateChessRoute(routeFromView(viewFromRoute(parseChessRoute())), 'canonicalize');
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

  // Derived from the `language` display setting, so the LANGUAGE_CHANGED /
  // DISPLAY_SETTINGS_CHANGED handler above re-renders the whole tree with the
  // new catalog: setDisplay() changes `display.language`, this memo recomputes,
  // and every `t(...)` call site below re-evaluates.
  const t = useMemo(() => createTranslator(display.language), [display.language]);

  const canPlay = chess.status === 'ready';
  const statusLabel =
    chess.status === 'connecting'
      ? t('status.connecting')
      : chess.status === 'ready'
        ? t('status.playingAs', { name: chess.accountName ?? chess.address ?? '' })
        : chess.status === 'spectator'
          ? t('status.spectator')
          : t('status.unavailable');

  const activeGame =
    view.kind === 'game' ? chess.games.find((game) => game.gameId === view.gameId) : undefined;

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{BRAND}</p>
            <h1>{t('app.title')}</h1>
          </div>
          <div className="topbar-right">
            <p className="runtime-note">{statusLabel}</p>
            <nav className="view-tabs">
              <button
                type="button"
                className={view.kind === 'lobby' || view.kind === 'game' ? 'active' : ''}
                onClick={() => goTo({ kind: 'lobby' })}
              >
                {t('nav.lobby')}
              </button>
              <button
                type="button"
                className={view.kind === 'local' ? 'active' : ''}
                onClick={() => goTo({ kind: 'local' })}
              >
                {t('nav.localBoard')}
              </button>
              <button
                type="button"
                className={view.kind === 'developers' ? 'active' : ''}
                onClick={() => goTo({ kind: 'developers' })}
              >
                {t('nav.developers')}
              </button>
            </nav>
          </div>
        </header>

        {view.kind === 'developers' ? (
          <Reference />
        ) : view.kind === 'local' ? (
          <LocalBoard t={t} />
        ) : view.kind === 'game' && activeGame ? (
          <GameRoom
            game={activeGame}
            service={chess.service}
            me={chess.address}
            canPlay={canPlay}
            t={t}
            onBack={() => goTo({ kind: 'lobby' })}
          />
        ) : chess.status === 'unavailable' ? (
          <div>
            <div className="notice">
              {t('notice.lobbyUnreachable', { reason: chess.error ?? t('status.noNode') })}
            </div>
            <LocalBoard t={t} />
          </div>
        ) : (
          <Lobby
            t={t}
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
