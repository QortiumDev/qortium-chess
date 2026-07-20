// Public lobby: open invites, my games, invite creation, group membership.

import { useState } from 'react';
import type { TrackedGame } from '../game/service';
import { joinChessGroup } from '../game/useChessService';
import type { ColorChoice } from '../protocol/types';

function shortId(gameId: string) {
  return gameId.slice(0, 8);
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function describeGame(game: TrackedGame, me: string | null): string {
  if (game.players) {
    const white = game.players.white === me ? 'You' : shortAddress(game.players.white);
    const black = game.players.black === me ? 'You' : shortAddress(game.players.black);
    return `${white} vs ${black} — ${shortId(game.gameId)}`;
  }
  const creator = game.creator === me ? 'You' : shortAddress(game.creator);
  return `${creator}'s invite (${game.colorChoice}) — ${shortId(game.gameId)}`;
}

export type LobbyProps = {
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
  const { games, me } = props;
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
        <div className="notice">
          Spectator mode — open this app inside Qortium Home with an account to play.
        </div>
      ) : !props.isGroupMember ? (
        <div className="notice">
          Join the Chess lobby group to create invites and play.{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => run(async () => { await joinChessGroup(); props.onJoinedGroup(); })}
          >
            Join lobby group
          </button>
          <span className="muted"> (takes a block to confirm)</span>
        </div>
      ) : null}

      {error ? <div className="notice">{error}</div> : null}

      {props.canPlay && props.isGroupMember ? (
        <section className="lobby-section">
          <h2>Create invite</h2>
          {myOpenInvite ? (
            <p>
              You already have an open invite ({shortId(myOpenInvite.gameId)}).{' '}
              <button type="button" disabled={busy} onClick={() => run(() => props.onCancelInvite(myOpenInvite.gameId))}>
                Cancel it
              </button>
            </p>
          ) : (
            <div className="invite-form">
              <label>
                Your color{' '}
                <select value={colorChoice} onChange={(e) => setColorChoice(e.target.value as ColorChoice)}>
                  <option>Random</option>
                  <option>White</option>
                  <option>Black</option>
                </select>
              </label>
              <input
                value={note}
                maxLength={160}
                placeholder="Note (optional)"
                onChange={(e) => setNote(e.target.value)}
              />
              <button type="button" disabled={busy} onClick={() => run(() => props.onCreateInvite(colorChoice, note))}>
                Post invite
              </button>
            </div>
          )}
        </section>
      ) : null}

      <section className="lobby-section">
        <h2>Open invites</h2>
        {openInvites.length === 0 ? <p className="muted">No open invites. Post one!</p> : null}
        <ul className="game-list">
          {openInvites.map((game) => (
            <li key={game.gameId}>
              <button type="button" className="game-link" onClick={() => props.onOpenGame(game.gameId)}>
                {describeGame(game, me)}
              </button>
              {props.canPlay && props.isGroupMember && game.creator !== me ? (
                <button type="button" disabled={busy} onClick={() => run(() => props.onJoin(game.gameId))}>
                  Join
                </button>
              ) : null}
              {game.phase === 'awaitingApproval' && game.creator === me ? (
                <span className="muted">join requests waiting — open the game</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {myGames.length > 0 ? (
        <section className="lobby-section">
          <h2>Your games</h2>
          <ul className="game-list">
            {myGames.map((game) => (
              <li key={game.gameId}>
                <button type="button" className="game-link" onClick={() => props.onOpenGame(game.gameId)}>
                  {describeGame(game, me)} — ply {game.history.length}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="lobby-section">
        <h2>Watch</h2>
        {watchable.length === 0 ? <p className="muted">No games in progress.</p> : null}
        <ul className="game-list">
          {watchable.map((game) => (
            <li key={game.gameId}>
              <button type="button" className="game-link" onClick={() => props.onOpenGame(game.gameId)}>
                {describeGame(game, me)} — ply {game.history.length}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {finished.length > 0 ? (
        <section className="lobby-section">
          <h2>Recently finished</h2>
          <ul className="game-list">
            {finished.map((game) => (
              <li key={game.gameId}>
                <button type="button" className="game-link" onClick={() => props.onOpenGame(game.gameId)}>
                  {describeGame(game, me)} — {game.terminal?.result} ({game.terminal?.reason})
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
