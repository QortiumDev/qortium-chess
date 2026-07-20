// Public lobby: open invites, my games, invite creation, group membership.

import { useState } from 'react';
import type { TrackedGame } from '../game/service';
import { joinChessGroup } from '../game/useChessService';
import type { MessageKey, TranslateFunction } from '../i18n';
import type { ColorChoice, TerminalReason } from '../protocol/types';

function shortId(gameId: string) {
  return gameId.slice(0, 8);
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const COLOR_KEYS: Record<ColorChoice, MessageKey> = {
  White: 'color.white',
  Black: 'color.black',
  Random: 'color.random',
};

const TERMINAL_REASON_KEYS: Record<TerminalReason, MessageKey> = {
  checkmate: 'terminal.checkmate',
  stalemate: 'terminal.stalemate',
  'insufficient-material': 'terminal.insufficientMaterial',
  'fifty-move': 'terminal.fiftyMove',
  'threefold-repetition': 'terminal.threefoldRepetition',
  'draw-agreed': 'terminal.drawAgreed',
  resign: 'terminal.resign',
  abort: 'terminal.abort',
};

/** Localized end-of-game reason. Unknown wire values fall through verbatim so a
 *  newer peer's reason code is still visible rather than being swallowed. */
export function describeTerminalReason(reason: TerminalReason | undefined, t: TranslateFunction): string {
  if (!reason) {
    return '';
  }

  const key = TERMINAL_REASON_KEYS[reason];

  return key ? t(key) : reason;
}

export function describeGame(game: TrackedGame, me: string | null, t: TranslateFunction): string {
  if (game.players) {
    const white = game.players.white === me ? t('label.you') : shortAddress(game.players.white);
    const black = game.players.black === me ? t('label.you') : shortAddress(game.players.black);
    return t('game.matchup', { white, black, id: shortId(game.gameId) });
  }
  const creator = game.creator === me ? t('label.you') : shortAddress(game.creator);
  return t('game.inviteBy', {
    creator,
    color: t(COLOR_KEYS[game.colorChoice] ?? 'color.random'),
    id: shortId(game.gameId),
  });
}

export type LobbyProps = {
  t: TranslateFunction;
  games: TrackedGame[];
  me: string | null;
  isGroupMember: boolean;
  canPlay: boolean;
  onOpenGame: (gameId: string) => void;
  onCreateInvite: (colorChoice: ColorChoice, note: string) => Promise<void>;
  onJoin: (gameId: string) => Promise<void>;
  onCancelInvite: (gameId: string) => Promise<void>;
  onJoinedGroup: () => void;
};

export function Lobby(props: LobbyProps) {
  const { games, me, t } = props;
  const [colorChoice, setColorChoice] = useState<ColorChoice>('Random');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openInvites = games.filter((g) => g.phase === 'pending' || g.phase === 'awaitingApproval');
  const myGames = games.filter(
    (g) => g.phase === 'active' && me && g.players && (g.players.white === me || g.players.black === me),
  );
  const watchable = games.filter(
    (g) => g.phase === 'active' && !myGames.includes(g),
  );
  const finished = games.filter((g) => g.phase === 'terminal').slice(-10).reverse();
  const myOpenInvite = openInvites.find((g) => g.creator === me);

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

  return (
    <div className="lobby">
      {!props.canPlay ? (
        <div className="notice">{t('lobby.spectatorNotice')}</div>
      ) : !props.isGroupMember ? (
        <div className="notice">
          {t('lobby.joinGroupNotice')}{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => run(async () => { await joinChessGroup(); props.onJoinedGroup(); })}
          >
            {t('lobby.joinGroupAction')}
          </button>
          <span className="muted"> {t('lobby.joinGroupHint')}</span>
        </div>
      ) : null}

      {error ? <div className="notice">{error}</div> : null}

      {props.canPlay && props.isGroupMember ? (
        <section className="lobby-section">
          <h2>{t('lobby.createInvite')}</h2>
          {myOpenInvite ? (
            <p>
              {t('lobby.openInviteExists', { id: shortId(myOpenInvite.gameId) })}{' '}
              <button type="button" disabled={busy} onClick={() => run(() => props.onCancelInvite(myOpenInvite.gameId))}>
                {t('lobby.cancelInvite')}
              </button>
            </p>
          ) : (
            <div className="invite-form">
              <label>
                {t('lobby.yourColor')}{' '}
                {/* The option VALUES stay the protocol's `ColorChoice` tokens —
                    only the visible labels are localized. */}
                <select value={colorChoice} onChange={(e) => setColorChoice(e.target.value as ColorChoice)}>
                  <option value="Random">{t('color.random')}</option>
                  <option value="White">{t('color.white')}</option>
                  <option value="Black">{t('color.black')}</option>
                </select>
              </label>
              <input
                value={note}
                maxLength={160}
                placeholder={t('lobby.notePlaceholder')}
                onChange={(e) => setNote(e.target.value)}
              />
              <button type="button" disabled={busy} onClick={() => run(() => props.onCreateInvite(colorChoice, note))}>
                {t('lobby.postInvite')}
              </button>
            </div>
          )}
        </section>
      ) : null}

      <section className="lobby-section">
        <h2>{t('lobby.openInvites')}</h2>
        {openInvites.length === 0 ? <p className="muted">{t('lobby.noOpenInvites')}</p> : null}
        <ul className="game-list">
          {openInvites.map((game) => (
            <li key={game.gameId}>
              <button type="button" className="game-link" onClick={() => props.onOpenGame(game.gameId)}>
                {describeGame(game, me, t)}
              </button>
              {props.canPlay && props.isGroupMember && game.creator !== me ? (
                <button type="button" disabled={busy} onClick={() => run(() => props.onJoin(game.gameId))}>
                  {t('lobby.join')}
                </button>
              ) : null}
              {game.phase === 'awaitingApproval' && game.creator === me ? (
                <span className="muted">{t('lobby.joinRequestsWaiting')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {myGames.length > 0 ? (
        <section className="lobby-section">
          <h2>{t('lobby.yourGames')}</h2>
          <ul className="game-list">
            {myGames.map((game) => (
              <li key={game.gameId}>
                <button type="button" className="game-link" onClick={() => props.onOpenGame(game.gameId)}>
                  {t('game.withPly', { summary: describeGame(game, me, t), count: game.history.length })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="lobby-section">
        <h2>{t('lobby.watch')}</h2>
        {watchable.length === 0 ? <p className="muted">{t('lobby.noGamesInProgress')}</p> : null}
        <ul className="game-list">
          {watchable.map((game) => (
            <li key={game.gameId}>
              <button type="button" className="game-link" onClick={() => props.onOpenGame(game.gameId)}>
                {t('game.withPly', { summary: describeGame(game, me, t), count: game.history.length })}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {finished.length > 0 ? (
        <section className="lobby-section">
          <h2>{t('lobby.recentlyFinished')}</h2>
          <ul className="game-list">
            {finished.map((game) => (
              <li key={game.gameId}>
                <button type="button" className="game-link" onClick={() => props.onOpenGame(game.gameId)}>
                  {/* `result` is a PGN score token (1-0, 1/2-1/2) — a protocol
                      value, shown verbatim in every locale. */}
                  {t('game.withResult', {
                    summary: describeGame(game, me, t),
                    result: game.terminal?.result ?? '',
                    reason: describeTerminalReason(game.terminal?.reason, t),
                  })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
