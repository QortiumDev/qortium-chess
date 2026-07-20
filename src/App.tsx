import { useState } from 'react';
import { useChessService } from './game/useChessService';
import { GameRoom } from './ui/GameRoom';
import { LocalBoard } from './ui/LocalBoard';
import { Lobby } from './ui/Lobby';

const APP_TITLE = 'Chess';

type View = { kind: 'lobby' } | { kind: 'game'; gameId: string } | { kind: 'local' };

export function App() {
  const chess = useChessService();
  const [view, setView] = useState<View>({ kind: 'lobby' });

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
                onClick={() => setView({ kind: 'lobby' })}
              >
                Lobby
              </button>
              <button
                type="button"
                className={view.kind === 'local' ? 'active' : ''}
                onClick={() => setView({ kind: 'local' })}
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
            onBack={() => setView({ kind: 'lobby' })}
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
            onOpenGame={(gameId) => setView({ kind: 'game', gameId })}
            onCreateInvite={async (colorChoice, note) => {
              const { gameId } = await chess.service!.createInvite({
                colorChoice,
                isPublic: true,
                ...(note.trim() ? { note: note.trim() } : {}),
              });
              setView({ kind: 'game', gameId });
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
