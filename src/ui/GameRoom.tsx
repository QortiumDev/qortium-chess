// One game: board, join-request approvals, move list, actions, chat, event log.

import { useState } from 'react';
import type { GameService, TrackedGame } from '../game/service';
import { Board, formatMovePairs } from './Board';
import { describeGame } from './Lobby';

export type GameRoomProps = {
  game: TrackedGame;
  service: GameService | null;
  me: string | null;
  canPlay: boolean;
  onBack: () => void;
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function GameRoom({ game, service, me, canPlay, onBack }: GameRoomProps) {
  const [chatDraft, setChatDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const myColor = game.players
    ? game.players.white === me
      ? 'white'
      : game.players.black === me
        ? 'black'
        : null
    : null;
  const isPlayer = myColor !== null;
  const plyParity = game.history.length % 2;
  const sideToMove = plyParity === 0 ? 'white' : 'black';
  const myTurn = game.phase === 'active' && isPlayer && myColor === sideToMove;
  const act = canPlay && service !== null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  }

  const chatEvents = game.events.filter(
    (event) => event.message.type === 'chat' && event.verdict.accepted,
  );
  const invalidEvents = game.events.filter((event) => !event.verdict.accepted).slice(-8);
  const liveOffer = game.drawOffer;

  const banner =
    game.phase === 'terminal'
      ? `Game over: ${game.terminal?.result} (${game.terminal?.reason})`
      : game.phase === 'aborted'
        ? 'Game aborted.'
        : game.phase === 'canceled'
          ? 'Invite canceled.'
          : game.phase === 'pending'
            ? 'Waiting for an opponent to join…'
            : game.phase === 'awaitingApproval'
              ? game.creator === me
                ? 'Approve a join request to start the game.'
                : 'Waiting for the creator to approve a joiner…'
              : myTurn
                ? 'Your move.'
                : null;

  return (
    <div className="game-room">
      <div className="game-room-header">
        <button type="button" onClick={onBack}>← Lobby</button>
        <h2>{describeGame(game, me)}</h2>
      </div>

      {banner ? <p className="board-status">{banner}</p> : null}
      {error ? <div className="notice">{error}</div> : null}

      {game.phase === 'awaitingApproval' && game.creator === me && act ? (
        <section className="lobby-section">
          <h3>Join requests</h3>
          <ul className="game-list">
            {game.joiners.map((joiner) => (
              <li key={joiner}>
                {shortAddress(joiner)}{' '}
                <button type="button" disabled={busy} onClick={() => run(() => service!.approve(game.gameId, joiner))}>
                  Approve
                </button>{' '}
                <button type="button" disabled={busy} onClick={() => run(() => service!.reject(game.gameId, joiner))}>
                  Reject
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="board-layout">
        <Board
          history={game.history}
          orientation={myColor === 'black' ? 'black' : 'white'}
          interactive={myTurn && act && !busy}
          onMove={
            act && isPlayer
              ? (move) => run(() => service!.move(game.gameId, move))
              : undefined
          }
        />
        <div className="board-side">
          {act && isPlayer && game.phase === 'active' ? (
            <div className="board-actions game-actions">
              {liveOffer && liveOffer.by !== me ? (
                <>
                  <button type="button" disabled={busy} onClick={() => run(() => service!.acceptDraw(game.gameId))}>
                    Accept draw
                  </button>
                  <button type="button" disabled={busy} onClick={() => run(() => service!.declineDraw(game.gameId))}>
                    Decline draw
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy || liveOffer?.by === me}
                  onClick={() => run(() => service!.offerDraw(game.gameId))}
                >
                  {liveOffer?.by === me ? 'Draw offered…' : 'Offer draw'}
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => run(() => service!.resign(game.gameId))}>
                Resign
              </button>
              {game.history.length < 2 ? (
                <button type="button" disabled={busy} onClick={() => run(() => service!.abort(game.gameId))}>
                  Abort
                </button>
              ) : null}
            </div>
          ) : null}

          <ol className="board-moves">
            {formatMovePairs(game.history).map((pair) => (
              <li key={pair}>{pair}</li>
            ))}
          </ol>

          <section className="game-chat">
            <h3>Chat</h3>
            <ul className="chat-list">
              {chatEvents.map((event) => (
                <li key={event.signature}>
                  <strong>{event.signer === me ? 'You' : shortAddress(event.signer)}:</strong>{' '}
                  {(event.message as { text: string }).text}
                </li>
              ))}
            </ul>
            {act ? (
              <form
                className="chat-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = chatDraft.trim();
                  if (!text) return;
                  setChatDraft('');
                  run(() => service!.sendChat(game.gameId, text));
                }}
              >
                <input
                  value={chatDraft}
                  maxLength={2000}
                  placeholder="Say something…"
                  onChange={(e) => setChatDraft(e.target.value)}
                />
                <button type="submit" disabled={busy}>Send</button>
              </form>
            ) : null}
          </section>

          {invalidEvents.length > 0 ? (
            <section className="game-chat">
              <h3>Rejected messages</h3>
              <ul className="chat-list muted">
                {invalidEvents.map((event) => (
                  <li key={event.signature}>
                    {shortAddress(event.signer)} · {event.message.type} ·{' '}
                    {!event.verdict.accepted ? event.verdict.badge : ''}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
