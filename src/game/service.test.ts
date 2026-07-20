import { beforeEach, describe, expect, it } from 'vitest';
import { buildEnvelope, encodeEnvelope } from '../protocol/envelope';
import { classicRules } from '../rules/classic';
import { MemoryHub } from '../transport/memory';
import type { Route } from '../transport/types';
import { GameService } from './service';

const ALICE = 'QALICEADDRESSXXXXXXXXXXXXXXXXXXXXX';
const BOB = 'QBOBADDRESSXXXXXXXXXXXXXXXXXXXXXXX';
const CAROL = 'QCAROLADDRESSXXXXXXXXXXXXXXXXXXXXX';
const ROUTE: Route = { mode: 'group', groupId: 1 };

const SCHOLARS_MATE = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];

function makeService(hub: MemoryHub, me: string) {
  return new GameService({ me, transport: hub.client(me), route: ROUTE, rules: classicRules });
}

async function setupActiveGame(hub: MemoryHub, colorChoice: 'White' | 'Black' | 'Random' = 'White') {
  const alice = makeService(hub, ALICE);
  const bob = makeService(hub, BOB);
  const spectator = makeService(hub, CAROL);
  await alice.start();
  await bob.start();
  await spectator.start();
  const { gameId } = await alice.createInvite({ colorChoice, isPublic: true });
  await bob.join(gameId);
  await alice.approve(gameId, BOB);
  return { alice, bob, spectator, gameId };
}

describe('GameService lifecycle', () => {
  let hub: MemoryHub;

  beforeEach(() => {
    hub = new MemoryHub();
  });

  it('runs invite → join → approve into an active game with chosen colors', async () => {
    const { alice, bob, spectator, gameId } = await setupActiveGame(hub, 'White');
    for (const svc of [alice, bob, spectator]) {
      const game = svc.game(gameId)!;
      expect(game.phase).toBe('active');
      expect(game.players).toEqual({ white: ALICE, black: BOB });
    }
  });

  it('resolves Random colors identically on every client', async () => {
    const { alice, bob, spectator, gameId } = await setupActiveGame(hub, 'Random');
    const players = alice.game(gameId)!.players!;
    expect([players.white, players.black].sort()).toEqual([ALICE, BOB].sort());
    expect(bob.game(gameId)!.players).toEqual(players);
    expect(spectator.game(gameId)!.players).toEqual(players);
  });

  it('plays a full game to checkmate with all clients agreeing', async () => {
    const { alice, bob, spectator, gameId } = await setupActiveGame(hub);
    const byColor = { white: alice, black: bob };
    for (let i = 0; i < SCHOLARS_MATE.length; i++) {
      const mover = i % 2 === 0 ? byColor.white : byColor.black;
      await mover.move(gameId, SCHOLARS_MATE[i]);
    }
    for (const svc of [alice, bob, spectator]) {
      const game = svc.game(gameId)!;
      expect(game.phase).toBe('terminal');
      expect(game.terminal).toEqual({ result: '1-0', reason: 'checkmate' });
      expect(game.history).toEqual(SCHOLARS_MATE);
    }
  });

  it('blocks out-of-turn and illegal moves at the send side', async () => {
    const { bob, alice, gameId } = await setupActiveGame(hub);
    await expect(bob.move(gameId, 'e7e5')).rejects.toThrow(/Not your turn/);
    await expect(alice.move(gameId, 'e2e5')).rejects.toThrow(/Illegal/);
  });

  it('rejects a tampered move from the network with a badge', async () => {
    const { alice, gameId } = await setupActiveGame(hub);
    await alice.move(gameId, 'e2e4');
    const game = alice.game(gameId)!;
    // Bob replays white's accepted move as his own with a bogus hash.
    hub.deliver(
      encodeEnvelope(
        buildEnvelope({
          protoTag: 'QCH1',
          protoVersion: '1.0',
          type: 'move',
          gameId,
          from: BOB,
          ply: 2,
          move: 'e7e5',
          history: [...game.history, 'e7e5'],
          prevHash: game.lastStateHash,
          stateHash: 'ab'.repeat(32),
        }),
      ),
      BOB,
      ROUTE,
    );
    const events = alice.game(gameId)!.events;
    const last = events[events.length - 1];
    expect(last.verdict).toMatchObject({ accepted: false, badge: 'invalid.stateHashMismatch' });
    expect(alice.game(gameId)!.history).toEqual(['e2e4']);
  });

  it('rejects messages whose signer does not match `from`', async () => {
    const { alice, gameId } = await setupActiveGame(hub);
    hub.deliver(
      encodeEnvelope(
        buildEnvelope({
          protoTag: 'QCH1',
          protoVersion: '1.0',
          type: 'resign',
          gameId,
          from: ALICE, // claims to be Alice…
          prevHash: alice.game(gameId)!.lastStateHash,
        }),
      ),
      CAROL, // …but signed by Carol
      ROUTE,
    );
    const events = alice.game(gameId)!.events;
    expect(events[events.length - 1].verdict).toMatchObject({
      accepted: false,
      badge: 'invalid.signerMismatch',
    });
    expect(alice.game(gameId)!.phase).toBe('active');
  });

  it('enforces the abort window: allowed before ply 2, refused after', async () => {
    const early = await setupActiveGame(hub);
    await early.alice.move(early.gameId, 'e2e4');
    await early.bob.abort(early.gameId);
    expect(early.alice.game(early.gameId)!.phase).toBe('aborted');

    const hub2 = new MemoryHub();
    const late = await setupActiveGame(hub2);
    await late.alice.move(late.gameId, 'e2e4');
    await late.bob.move(late.gameId, 'e7e5');
    await late.bob.abort(late.gameId);
    const game = late.alice.game(late.gameId)!;
    expect(game.phase).toBe('active');
    const last = game.events[game.events.length - 1];
    expect(last.verdict).toMatchObject({ accepted: false, badge: 'invalid.abortWindowClosed' });
  });

  it('handles draw offer / accept, and a move supersedes a live offer', async () => {
    const { alice, bob, gameId } = await setupActiveGame(hub);
    await alice.move(gameId, 'e2e4');
    await bob.offerDraw(gameId);
    await bob.move(gameId, 'e7e5'); // moving clears bob's own offer
    await alice.acceptDraw(gameId);
    const afterStale = alice.game(gameId)!;
    expect(afterStale.phase).toBe('active');
    expect(
      afterStale.events[afterStale.events.length - 1].verdict,
    ).toMatchObject({ accepted: false, badge: 'invalid.noLiveDrawOffer' });

    await alice.offerDraw(gameId);
    await bob.acceptDraw(gameId);
    const done = bob.game(gameId)!;
    expect(done.phase).toBe('terminal');
    expect(done.terminal).toEqual({ result: '1/2-1/2', reason: 'draw-agreed' });
  });

  it('resign awards the win to the opponent', async () => {
    const { alice, bob, gameId } = await setupActiveGame(hub);
    await alice.move(gameId, 'e2e4');
    await bob.resign(gameId);
    expect(alice.game(gameId)!.terminal).toEqual({ result: '1-0', reason: 'resign' });
  });

  it('suppresses duplicate deliveries by signature', async () => {
    const { alice, gameId } = await setupActiveGame(hub);
    const verdict = alice.ingest({
      data: 'irrelevant',
      signer: BOB,
      signature: 'sig-1', // sig-1 was already consumed by the invite
      timestamp: 999999,
      route: ROUTE,
    });
    expect(verdict).toMatchObject({ accepted: false, badge: 'invalid.duplicatedMessage' });
    expect(alice.game(gameId)!.phase).toBe('active');
  });

  it('rejects an invite whose gameId does not derive from creator+nonce', async () => {
    const alice = makeService(hub, ALICE);
    await alice.start();
    hub.deliver(
      encodeEnvelope(
        buildEnvelope({
          protoTag: 'QCH1',
          protoVersion: '1.0',
          type: 'invite',
          gameId: 'ff'.repeat(16),
          from: BOB,
          nonce: '00'.repeat(16),
          ruleset: 'classic',
          colorChoice: 'White',
          isPublic: true,
        }),
      ),
      BOB,
      ROUTE,
    );
    expect(alice.games()).toHaveLength(0);
  });

  it('ends by auto-draw (stalemate) without any draw message', async () => {
    const { alice, bob, gameId } = await setupActiveGame(hub);
    const loyd = [
      'e2e3', 'a7a5', 'd1h5', 'a8a6', 'h5a5', 'h7h5', 'a5c7', 'a6h6', 'h2h4', 'f7f6',
      'c7d7', 'e8f7', 'd7b7', 'd8d3', 'b7b8', 'd3h7', 'b8c8', 'f7g6', 'c8e6',
    ];
    for (let i = 0; i < loyd.length; i++) {
      await (i % 2 === 0 ? alice : bob).move(gameId, loyd[i]);
    }
    expect(bob.game(gameId)!.terminal).toEqual({ result: '1/2-1/2', reason: 'stalemate' });
  });

  it('a late-started client catches up from the backlog to identical state', async () => {
    const { alice, gameId } = await setupActiveGame(hub);
    await alice.move(gameId, 'e2e4');
    const late = makeService(hub, 'QLATECOMERXXXXXXXXXXXXXXXXXXXXXXXX');
    await late.start();
    const game = late.game(gameId)!;
    expect(game.phase).toBe('active');
    expect(game.history).toEqual(['e2e4']);
    expect(game.lastStateHash).toBe(alice.game(gameId)!.lastStateHash);
  });
});
