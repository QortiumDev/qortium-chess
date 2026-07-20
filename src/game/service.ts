// GameService — QCH1 lifecycle, validation gates (spec §5, §7) and send-side
// actions. Rules come from a RulesAdapter, wire I/O from a ChatTransport;
// this module contains no chess logic and no Qortium API calls.

import {
  baseMessage,
  buildEnvelope,
  decodeEnvelope,
  encodeEnvelope,
} from '../protocol/envelope';
import { blake2b256Hex, deriveGameId, initialStateHash, stateHash } from '../protocol/hash';
import { ABORT_MAX_HISTORY_LENGTH } from '../protocol/types';
import type {
  Address,
  ColorChoice,
  GameId,
  HashHex,
  Qch1Message,
  Qch1Move,
  Terminal,
  Uci,
  ValidationBadge,
  Verdict,
} from '../protocol/types';
import type { ClassicState } from '../rules/classic';
import type { RulesAdapter } from '../rules/adapter';
import type { ChatTransport, IncomingChat, Route } from '../transport/types';

export const GAME_PHASES = [
  'pending',
  'awaitingApproval',
  'active',
  'terminal',
  'canceled',
  'aborted',
] as const;

export type GamePhase = (typeof GAME_PHASES)[number];

/** Phases from which no further protocol message is accepted. */
export const TERMINAL_GAME_PHASES = ['terminal', 'canceled', 'aborted'] as const;

export type GameEvent = {
  message: Qch1Message;
  signer: Address;
  signature: string;
  timestamp: number;
  verdict: Verdict;
};

export type TrackedGame = {
  gameId: GameId;
  creator: Address;
  colorChoice: ColorChoice;
  isPublic: boolean;
  note?: string;
  phase: GamePhase;
  joiners: Address[];
  players: { white: Address; black: Address } | null;
  history: Uci[];
  lastStateHash: HashHex;
  terminal: Terminal | null;
  drawOffer: { by: Address; atPly: number } | null;
  lastEventTimestamp: number;
  events: GameEvent[];
};

type Meta = { signer: Address; signature: string; timestamp: number };

const ok: Verdict = { accepted: true };
const bad = (badge: ValidationBadge, detail?: string): Verdict => ({ accepted: false, badge, detail });

export class GameService {
  readonly me: Address;
  private readonly transport: ChatTransport;
  private readonly route: Route;
  private readonly rules: RulesAdapter<ClassicState>;
  private readonly gamesById = new Map<GameId, TrackedGame>();
  private readonly seenSignatures = new Set<string>();
  private readonly updateListeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private lastFetched = 0;

  constructor(opts: {
    me: Address;
    transport: ChatTransport;
    route: Route;
    rules: RulesAdapter<ClassicState>;
  }) {
    this.me = opts.me;
    this.transport = opts.transport;
    this.route = opts.route;
    this.rules = opts.rules;
  }

  async start(): Promise<void> {
    this.unsubscribe = this.transport.subscribe(this.route, (msg) => this.ingest(msg));
    const backlog = await this.transport.fetch(this.route, { after: this.lastFetched });
    for (const msg of backlog) {
      this.ingest(msg);
    }
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  onUpdate(listener: () => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  games(): TrackedGame[] {
    return [...this.gamesById.values()];
  }

  game(gameId: GameId): TrackedGame | undefined {
    return this.gamesById.get(gameId);
  }

  // ---- receive path ----

  ingest(incoming: IncomingChat): Verdict | null {
    if (this.seenSignatures.has(incoming.signature)) {
      return bad('invalid.duplicatedMessage');
    }
    this.seenSignatures.add(incoming.signature);
    this.lastFetched = Math.max(this.lastFetched, incoming.timestamp);

    // Gates 0 and 1 run inside the decoder: the size budget
    // (`invalid.oversized`) and the version gate (`invalid.versionUnsupported`
    // for a foreign major; a newer same-major minor is accepted and its
    // unknown fields ignored). Their verdicts surface here like any other.
    const decoded = decodeEnvelope(incoming.data);
    if (!decoded.ok) {
      return decoded.reason === 'not-qch1' ? null : (decoded.verdict ?? bad('invalid.schema'));
    }
    const message = decoded.message;
    const meta: Meta = {
      signer: incoming.signer,
      signature: incoming.signature,
      timestamp: incoming.timestamp,
    };

    const verdict = this.applyMessage(message, meta);
    const game = this.gamesById.get(message.gameId);
    if (game) {
      game.events.push({ message, ...meta, verdict });
      if (verdict.accepted) {
        game.lastEventTimestamp = meta.timestamp;
      }
    }
    for (const listener of this.updateListeners) {
      listener();
    }
    return verdict;
  }

  private applyMessage(message: Qch1Message, meta: Meta): Verdict {
    if (message.from !== meta.signer) {
      return bad('invalid.signerMismatch');
    }

    if (message.type === 'invite') {
      if (message.gameId !== deriveGameId(message.from, message.nonce)) {
        return bad('invalid.schema', 'gameId does not derive from creator+nonce');
      }
      if (this.gamesById.has(message.gameId)) {
        return bad('invalid.duplicatedMessage', 'game already exists');
      }
      this.gamesById.set(message.gameId, {
        gameId: message.gameId,
        creator: message.from,
        colorChoice: message.colorChoice,
        isPublic: message.isPublic,
        note: message.note,
        phase: 'pending',
        joiners: [],
        players: null,
        history: [],
        lastStateHash: initialStateHash({
          ruleset: this.rules.rulesetId,
          gameId: message.gameId,
          players: { white: '', black: '' },
        }),
        terminal: null,
        drawOffer: null,
        lastEventTimestamp: meta.timestamp,
        events: [],
      });
      return ok;
    }

    const game = this.gamesById.get(message.gameId);
    if (!game) {
      return bad('invalid.badLifecycle', 'unknown game');
    }

    switch (message.type) {
      case 'cancelInvite': {
        if (message.from !== game.creator) return bad('invalid.notParticipant');
        if (game.phase !== 'pending' && game.phase !== 'awaitingApproval') {
          return bad('invalid.badLifecycle');
        }
        game.phase = 'canceled';
        return ok;
      }
      case 'join': {
        if (game.phase !== 'pending' && game.phase !== 'awaitingApproval') {
          return bad('invalid.badLifecycle');
        }
        if (message.from === game.creator) return bad('invalid.badLifecycle', 'creator cannot join');
        if (!game.joiners.includes(message.from)) {
          game.joiners.push(message.from);
        }
        game.phase = 'awaitingApproval';
        return ok;
      }
      case 'reject': {
        if (message.from !== game.creator) return bad('invalid.notParticipant');
        if (game.phase !== 'awaitingApproval') return bad('invalid.badLifecycle');
        game.joiners = game.joiners.filter((j) => j !== message.opponent);
        if (game.joiners.length === 0) {
          game.phase = 'pending';
        }
        return ok;
      }
      case 'approve': {
        if (message.from !== game.creator) return bad('invalid.notParticipant');
        if (game.phase !== 'awaitingApproval') return bad('invalid.badLifecycle');
        if (!game.joiners.includes(message.opponent)) {
          return bad('invalid.badLifecycle', 'opponent never joined');
        }
        game.players = resolveColors(game, message.opponent, meta.signature);
        // Rebase the hash chain now that players are bound (spec §4.3).
        game.lastStateHash = initialStateHash({
          ruleset: this.rules.rulesetId,
          gameId: game.gameId,
          players: game.players,
        });
        game.phase = 'active';
        return ok;
      }
      case 'move':
        return this.applyMove(game, message);
      case 'drawOffer': {
        const gate = this.requireActivePlayer(game, message.from);
        if (gate) return gate;
        if (message.atPly !== game.history.length) return bad('invalid.badLifecycle', 'stale offer');
        game.drawOffer = { by: message.from, atPly: message.atPly };
        return ok;
      }
      case 'drawAccept': {
        const gate = this.requireActivePlayer(game, message.from);
        if (gate) return gate;
        if (!game.drawOffer || game.drawOffer.by === message.from) {
          return bad('invalid.noLiveDrawOffer');
        }
        game.terminal = { result: '1/2-1/2', reason: 'draw-agreed' };
        game.phase = 'terminal';
        game.drawOffer = null;
        return ok;
      }
      case 'drawDecline': {
        const gate = this.requireActivePlayer(game, message.from);
        if (gate) return gate;
        if (!game.drawOffer || game.drawOffer.by === message.from) {
          return bad('invalid.noLiveDrawOffer');
        }
        game.drawOffer = null;
        return ok;
      }
      case 'resign': {
        const gate = this.requireActivePlayer(game, message.from);
        if (gate) return gate;
        if (message.prevHash !== game.lastStateHash) return bad('invalid.historyMismatch');
        const winner = message.from === game.players!.white ? '0-1' : '1-0';
        game.terminal = { result: winner, reason: 'resign' };
        game.phase = 'terminal';
        game.drawOffer = null;
        return ok;
      }
      case 'abort': {
        const gate = this.requireActivePlayer(game, message.from);
        if (gate) return gate;
        if (game.history.length >= ABORT_MAX_HISTORY_LENGTH) return bad('invalid.abortWindowClosed');
        if (message.prevHash !== game.lastStateHash) return bad('invalid.historyMismatch');
        game.phase = 'aborted';
        game.drawOffer = null;
        return ok;
      }
      case 'chat':
        return ok; // recorded as an event; never touches game state
      default:
        return bad('invalid.schema');
    }
  }

  private requireActivePlayer(game: TrackedGame, from: Address): Verdict | null {
    if (game.phase !== 'active') return bad('invalid.stateNotActive');
    if (from !== game.players!.white && from !== game.players!.black) {
      return bad('invalid.notParticipant');
    }
    return null;
  }

  private applyMove(game: TrackedGame, message: Qch1Move): Verdict {
    const gate = this.requireActivePlayer(game, message.from);
    if (gate) return gate;
    if (message.ply !== game.history.length + 1) return bad('invalid.plyOutOfOrder');
    for (let i = 0; i < game.history.length; i++) {
      if (message.history[i] !== game.history[i]) return bad('invalid.historyMismatch');
    }
    if (message.prevHash !== game.lastStateHash) return bad('invalid.historyMismatch');

    const state = this.rules.replay(game.history);
    const status = this.rules.status(state);
    if (status.over) return bad('invalid.stateNotActive', 'game already decided on board');
    const toMove = status.sideToMove === 'white' ? game.players!.white : game.players!.black;
    if (message.from !== toMove) return bad('invalid.notYourTurn');

    let nextState: ClassicState;
    try {
      nextState = this.rules.apply(state, message.move);
    } catch {
      return bad('invalid.illegalMove');
    }

    const expectedHash = stateHash({
      ruleset: this.rules.rulesetId,
      gameId: game.gameId,
      players: game.players!,
      history: nextState.history,
      terminal: null,
    });
    if (message.stateHash !== expectedHash) return bad('invalid.stateHashMismatch');

    game.history = [...nextState.history];
    game.lastStateHash = expectedHash;
    game.drawOffer = null; // a move supersedes any live draw offer

    const after = this.rules.status(nextState);
    if (after.over) {
      game.terminal = after.terminal;
      game.phase = 'terminal';
    }
    return ok;
  }

  // ---- send path ----

  private async send(message: Qch1Message): Promise<void> {
    await this.transport.send(encodeEnvelope(buildEnvelope(message)), this.route);
  }

  async createInvite(opts: {
    colorChoice: ColorChoice;
    isPublic: boolean;
    note?: string;
  }): Promise<{ gameId: GameId }> {
    const existing = this.games().find(
      (g) => g.creator === this.me && (g.phase === 'pending' || g.phase === 'awaitingApproval'),
    );
    if (existing) {
      throw new Error('You already have an open invite; cancel it first.');
    }
    const nonce = randomHex32();
    const gameId = deriveGameId(this.me, nonce);
    await this.send({
      ...baseMessage('invite', gameId, this.me),
      type: 'invite',
      nonce,
      ruleset: this.rules.rulesetId,
      colorChoice: opts.colorChoice,
      isPublic: opts.isPublic,
      ...(opts.note !== undefined ? { note: opts.note } : {}),
    });
    return { gameId };
  }

  async cancelInvite(gameId: GameId): Promise<void> {
    await this.send({ ...baseMessage('cancelInvite', gameId, this.me), type: 'cancelInvite' });
  }

  async join(gameId: GameId): Promise<void> {
    await this.send({ ...baseMessage('join', gameId, this.me), type: 'join' });
  }

  async approve(gameId: GameId, opponent: Address): Promise<void> {
    await this.send({ ...baseMessage('approve', gameId, this.me), type: 'approve', opponent });
  }

  async reject(gameId: GameId, opponent: Address): Promise<void> {
    await this.send({ ...baseMessage('reject', gameId, this.me), type: 'reject', opponent });
  }

  async move(gameId: GameId, uci: Uci): Promise<void> {
    const game = this.requireGame(gameId);
    const state = this.rules.replay(game.history);
    const status = this.rules.status(state);
    if (status.over || game.phase !== 'active') {
      throw new Error('Game is not active');
    }
    const toMove = status.sideToMove === 'white' ? game.players!.white : game.players!.black;
    if (toMove !== this.me) {
      throw new Error('Not your turn');
    }
    const nextState = this.rules.apply(state, uci); // throws on illegal — never broadcast garbage
    const message: Qch1Move = {
      ...baseMessage('move', gameId, this.me),
      type: 'move',
      ply: game.history.length + 1,
      move: uci,
      history: [...nextState.history],
      prevHash: game.lastStateHash,
      stateHash: stateHash({
        ruleset: this.rules.rulesetId,
        gameId,
        players: game.players!,
        history: nextState.history,
        terminal: null,
      }),
      fen: this.rules.snapshot(nextState),
    };
    await this.send(message);
  }

  async offerDraw(gameId: GameId): Promise<void> {
    const game = this.requireGame(gameId);
    await this.send({
      ...baseMessage('drawOffer', gameId, this.me),
      type: 'drawOffer',
      atPly: game.history.length,
    });
  }

  async acceptDraw(gameId: GameId): Promise<void> {
    const game = this.requireGame(gameId);
    await this.send({
      ...baseMessage('drawAccept', gameId, this.me),
      type: 'drawAccept',
      atPly: game.history.length,
    });
  }

  async declineDraw(gameId: GameId): Promise<void> {
    const game = this.requireGame(gameId);
    await this.send({
      ...baseMessage('drawDecline', gameId, this.me),
      type: 'drawDecline',
      atPly: game.history.length,
    });
  }

  async resign(gameId: GameId): Promise<void> {
    const game = this.requireGame(gameId);
    await this.send({
      ...baseMessage('resign', gameId, this.me),
      type: 'resign',
      prevHash: game.lastStateHash,
    });
  }

  async abort(gameId: GameId): Promise<void> {
    const game = this.requireGame(gameId);
    await this.send({
      ...baseMessage('abort', gameId, this.me),
      type: 'abort',
      prevHash: game.lastStateHash,
    });
  }

  async sendChat(gameId: GameId, text: string): Promise<void> {
    await this.send({ ...baseMessage('chat', gameId, this.me), type: 'chat', text });
  }

  private requireGame(gameId: GameId): TrackedGame {
    const game = this.gamesById.get(gameId);
    if (!game) {
      throw new Error(`Unknown game ${gameId}`);
    }
    return game;
  }
}

/**
 * Deterministic color resolution (spec §7): explicit creator choice, or for
 * Random the low bit of blake2b(gameId || approve-signature) — observable and
 * verifiable by every client that sees the approve message.
 */
function resolveColors(
  game: TrackedGame,
  opponent: Address,
  approveSignature: string,
): { white: Address; black: Address } {
  let creatorIsWhite: boolean;
  if (game.colorChoice === 'White') {
    creatorIsWhite = true;
  } else if (game.colorChoice === 'Black') {
    creatorIsWhite = false;
  } else {
    const hash = blake2b256Hex(game.gameId + approveSignature);
    creatorIsWhite = (parseInt(hash.slice(-1), 16) & 1) === 0;
  }
  return creatorIsWhite
    ? { white: game.creator, black: opponent }
    : { white: opponent, black: game.creator };
}

function randomHex32(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
