// QCH1 protocol types — see docs/QCH1-SPEC-DRAFT.md §4.

export type Address = string;
export type HashHex = string; // 64-char lowercase hex (blake2b-256)
export type Uci = string; // e.g. "e2e4", "e7e8q"
export type GameId = string; // 32-char lowercase hex (blake2b-256 truncated to 16 bytes)

export const PROTO_TAG = 'QCH1';
export const PROTO_VERSION = '1.0';
export const APP_MARKER = 'chess';

/** Core's hard CHAT transaction data limit; the envelope budget sits under it. */
export const MAX_CHAT_TX_BYTES = 4000;
export const MAX_ENVELOPE_BYTES = 3800; // headroom under the 4000-byte CHAT limit

/** The public Chess lobby group on Previewnet (created 2026-07-20, open membership). */
export const CHESS_GROUP_ID = 14;

// The QDN archive contract lives in docs/QCH1-SPEC-DRAFT.md §6.2 and is marked
// DESIGNED, NOT IMPLEMENTED. Deliberately no constants for it here: this module
// is the live contract the Developers reference renders from, so a name that no
// code path uses would document a guarantee nothing can drift against.

/** Hex lengths, in characters, of the protocol's identifier forms. */
export const GAME_ID_HEX_LENGTH = 32;
export const NONCE_HEX_LENGTH = 32;
export const STATE_HASH_HEX_LENGTH = 64;

/** Field limits enforced by `validateMessage`. */
export const MAX_INVITE_NOTE_LENGTH = 160;
export const MAX_CHAT_TEXT_LENGTH = 2000;
export const MIN_ADDRESS_LENGTH = 20;
export const MAX_ADDRESS_LENGTH = 64;

/** The abort window closes once both sides have moved (spec §4.4). */
export const ABORT_MAX_HISTORY_LENGTH = 2;

export const RULESET_IDS = ['classic'] as const;
export type RulesetId = (typeof RULESET_IDS)[number];

export const GAME_RESULTS = ['1-0', '0-1', '1/2-1/2'] as const;
export type GameResult = (typeof GAME_RESULTS)[number];

export const TERMINAL_REASONS = [
  'checkmate',
  'stalemate',
  'insufficient-material',
  'fifty-move',
  'threefold-repetition',
  'draw-agreed',
  'resign',
  'abort',
] as const;
export type TerminalReason = (typeof TERMINAL_REASONS)[number];

/** Terminal reasons the adapter declares on its own, with no claim message. */
export const AUTO_DRAW_REASONS = [
  'stalemate',
  'insufficient-material',
  'fifty-move',
  'threefold-repetition',
] as const;

export type Terminal = { result: GameResult; reason: TerminalReason };

export const COLOR_CHOICES = ['White', 'Black', 'Random'] as const;
export type ColorChoice = (typeof COLOR_CHOICES)[number];

export type Qch1MessageBase = {
  protoTag: typeof PROTO_TAG;
  protoVersion: string;
  type: Qch1MessageType;
  gameId: GameId;
  from: Address;
};

export const QCH1_MESSAGE_TYPES = [
  'invite',
  'cancelInvite',
  'join',
  'approve',
  'reject',
  'move',
  'drawOffer',
  'drawAccept',
  'drawDecline',
  'resign',
  'abort',
  'chat',
] as const;
export type Qch1MessageType = (typeof QCH1_MESSAGE_TYPES)[number];

export type Qch1Invite = Qch1MessageBase & {
  type: 'invite';
  nonce: string; // 32-char hex
  ruleset: RulesetId;
  colorChoice: ColorChoice;
  isPublic: boolean;
  note?: string;
};

export type Qch1CancelInvite = Qch1MessageBase & { type: 'cancelInvite' };
export type Qch1Join = Qch1MessageBase & { type: 'join' };
export type Qch1Approve = Qch1MessageBase & { type: 'approve'; opponent: Address };
export type Qch1Reject = Qch1MessageBase & { type: 'reject'; opponent: Address };

export type Qch1Move = Qch1MessageBase & {
  type: 'move';
  ply: number; // 1-based
  move: Uci;
  history: Uci[]; // full canonical history through this move
  prevHash: HashHex;
  stateHash: HashHex;
  fen?: string; // optional preview; never hashed, never trusted
};

export type Qch1DrawOffer = Qch1MessageBase & { type: 'drawOffer'; atPly: number };
export type Qch1DrawAccept = Qch1MessageBase & { type: 'drawAccept'; atPly: number };
export type Qch1DrawDecline = Qch1MessageBase & { type: 'drawDecline'; atPly: number };
export type Qch1Resign = Qch1MessageBase & { type: 'resign'; prevHash: HashHex };
export type Qch1Abort = Qch1MessageBase & { type: 'abort'; prevHash: HashHex };
export type Qch1Chat = Qch1MessageBase & { type: 'chat'; text: string };

export type Qch1Message =
  | Qch1Invite
  | Qch1CancelInvite
  | Qch1Join
  | Qch1Approve
  | Qch1Reject
  | Qch1Move
  | Qch1DrawOffer
  | Qch1DrawAccept
  | Qch1DrawDecline
  | Qch1Resign
  | Qch1Abort
  | Qch1Chat;

/** Wire envelope: the CHAT message data is exactly this JSON. */
export type Qch1Envelope = {
  app: typeof APP_MARKER;
  qch1: Qch1Message;
};

export const VALIDATION_BADGES = [
  'invalid.schema',
  'invalid.signerMismatch',
  'invalid.notParticipant',
  'invalid.stateNotActive',
  'invalid.plyOutOfOrder',
  'invalid.historyMismatch',
  'invalid.notYourTurn',
  'invalid.illegalMove',
  'invalid.stateHashMismatch',
  'invalid.duplicatedMessage',
  'invalid.badLifecycle',
  'invalid.abortWindowClosed',
  'invalid.noLiveDrawOffer',
  'invalid.oversized',
  'invalid.versionUnsupported',
] as const;
export type ValidationBadge = (typeof VALIDATION_BADGES)[number];

export type Verdict =
  | { accepted: true }
  | { accepted: false; badge: ValidationBadge; detail?: string };
