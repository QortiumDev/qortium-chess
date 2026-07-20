// One game: board, join-request approvals, move list, actions, chat, event log.

import { useState } from 'react';
import type { GameService, TrackedGame } from '../game/service';
import type { TranslateFunction } from '../i18n';
import { Board, formatMovePairs } from './Board';
import { describeGame, describeTerminalReason } from './Lobby';

export type GameRoomProps = {
  game: TrackedGame;
  service: GameService | null;
  me: string | null;
  canPlay: boolean;
  t: TranslateFunction;
  onBack: () => void;
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function GameRoom({ game, service, me, canPlay, t, onBack }: GameRoomProps) {
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
      ? t('game.over', {
          // PGN score token — a protocol value, not copy.
          result: game.terminal?.result ?? '',
          reason: describeTerminalReason(game.terminal?.reason, t),
        })
      : game.phase === 'aborted'
        ? t('game.aborted')
        : game.phase === 'canceled'
          ? t('game.inviteCanceled')
          : game.phase === 'pending'
            ? t('game.waitingOpponent')
            : game.phase === 'awaitingApproval'
              ? game.creator === me
                ? t('game.approvePrompt')
                : t('game.waitingApproval')
              : myTurn
                ? t('game.yourMove')
                : null;

  return (
    <div className="game-room">
      <div className="game-room-header">
        <button type="button" onClick={onBack}>{t('game.backToLobby')}</button>
        <h2>{describeGame(game, me, t)}</h2>
      </div>

      {banner ? <p className="board-status">{banner}</p> : null}
      {error ? <div className="notice">{error}</div> : null}

      {game.phase === 'awaitingApproval' && game.creator === me && act ? (
        <section className="lobby-section">
          <h3>{t('game.joinRequests')}</h3>
          <ul className="game-list">
            {game.joiners.map((joiner) => (
              <li key={joiner}>
                {shortAddress(joiner)}{' '}
                <button type="button" disabled={busy} onClick={() => run(() => service!.approve(game.gameId, joiner))}>
                  {t('game.approve')}
                </button>{' '}
                <button type="button" disabled={busy} onClick={() => run(() => service!.reject(game.gameId, joiner))}>
                  {t('game.reject')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="board-layout">
        <Board
          history={game.history}
          t={t}
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
                    {t('game.acceptDraw')}
                  </button>
                  <button type="button" disabled={busy} onClick={() => run(() => service!.declineDraw(game.gameId))}>
                    {t('game.declineDraw')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy || liveOffer?.by === me}
                  onClick={() => run(() => service!.offerDraw(game.gameId))}
                >
                  {liveOffer?.by === me ? t('game.drawOffered') : t('game.offerDraw')}
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => run(() => service!.resign(game.gameId))}>
                {t('game.resign')}
              </button>
              {game.history.length < 2 ? (
                <button type="button" disabled={busy} onClick={() => run(() => service!.abort(game.gameId))}>
                  {t('game.abort')}
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
            <h3>{t('game.chat')}</h3>
            <ul className="chat-list">
              {chatEvents.map((event) => (
                <li key={event.signature}>
                  <strong>{event.signer === me ? t('label.you') : shortAddress(event.signer)}:</strong>{' '}
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
                  placeholder={t('game.chatPlaceholder')}
                  onChange={(e) => setChatDraft(e.target.value)}
                />
                <button type="submit" disabled={busy}>{t('game.send')}</button>
              </form>
            ) : null}
          </section>

          {invalidEvents.length > 0 ? (
            <section className="game-chat">
              <h3>{t('game.rejectedMessages')}</h3>
              {/* The row body is deliberately untranslated: `message.type` and
                  `verdict.badge` are QCH1 wire identifiers, quoted verbatim in
                  the spec, and are what a user pastes into a bug report. */}
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
