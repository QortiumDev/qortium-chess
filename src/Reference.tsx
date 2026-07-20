// Developers workspace — the in-app QCH1 protocol reference.
//
// SPEC-spec-first-qortium-apps.md §2: this body stays permanently English so
// schema names, field names, action names, limits, and examples are identical
// for every developer. It is deliberately not routed through i18n.
//
// §5: every schema marker, service name, identifier form, enum, and limit on
// this page is imported from the implementation rather than restated in prose,
// so a contract change breaks the rendered-contract tests instead of quietly
// leaving the documentation behind.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { copyTextToClipboard } from './clipboard';
import {
  GAME_ID_HEX_PATTERN,
  HASH_HEX_PATTERN,
  NONCE_HEX_PATTERN,
  PROTO_VERSION_PATTERN,
  SUPPORTED_PROTO_VERSION,
  UCI_PATTERN,
} from './protocol/envelope';
import {
  ABORT_MAX_HISTORY_LENGTH,
  APP_MARKER,
  AUTO_DRAW_REASONS,
  CHESS_GROUP_ID,
  COLOR_CHOICES,
  GAME_ID_HEX_LENGTH,
  GAME_RESULTS,
  MAX_ADDRESS_LENGTH,
  MAX_CHAT_TEXT_LENGTH,
  MAX_CHAT_TX_BYTES,
  MAX_ENVELOPE_BYTES,
  MAX_INVITE_NOTE_LENGTH,
  MIN_ADDRESS_LENGTH,
  NONCE_HEX_LENGTH,
  PROTO_TAG,
  PROTO_VERSION,
  QCH1_MESSAGE_TYPES,
  RULESET_IDS,
  STATE_HASH_HEX_LENGTH,
  TERMINAL_REASONS,
  VALIDATION_BADGES,
} from './protocol/types';
import {
  CHAT_MESSAGES_NODE_PATH,
  CHAT_MESSAGE_ENCODING,
  CHAT_SEARCH_ACTION,
  CHAT_SEND_ACTION,
  CHAT_WEBSOCKET_PATH,
  DEFAULT_CHAT_FETCH_LIMIT,
  DEFAULT_CHAT_POLL_INTERVAL_MS,
  NODE_API_ACTION,
} from './transport/qortiumChat';
import { GAME_PHASES, TERMINAL_GAME_PHASES } from './game/service';
import { JOIN_GROUP_ACTION, SELECTED_ACCOUNT_ACTION } from './game/useChessService';
import { LOCAL_READ_ACTIONS } from './qdnRequest';
import { VIEW_QUERY_PARAM } from './deepLink';

// Example addresses and hashes below are illustrative public values. Nothing on
// this page may ever contain a private key, seed phrase, API key, or wallet
// file — a protocol reference needs none of them (§4.5).
const EXAMPLE_WHITE = 'QaLdnApWW3hps1qXM8cpsL1pVgw7RtyJmN';
const EXAMPLE_BLACK = 'QbXyZ7Tn4mKq2rVdGh8sJpLw3cFy6NmRtu';
const EXAMPLE_GAME_ID = '047f069c5a4e6ad5f4617ef063374cee';
const EXAMPLE_NONCE = 'b1c2d3e4f5061728394a5b6c7d8e9f00';
const EXAMPLE_PREV_HASH = '3f1a9d0c1e2b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80918a2b3c4d';
const EXAMPLE_STATE_HASH = '9c8b7a695847362514f3e2d1c0b9a8978685746352413f2e1d0c9b8a79685746';

/**
 * Copyable examples for the operations an independent client needs (§5).
 * Exported so tests can assert the exact contract inside each one.
 */
export const REFERENCE_SNIPPETS = {
  capabilityDetection: `// Never infer bridge support from a version, a node URL, or a selected
// account. Ask the host what it can actually do.
const actions = await qdnRequest({ action: 'SHOW_ACTIONS' });
const canPlay = Array.isArray(actions) && actions.includes('${CHAT_SEND_ACTION}');
const canRead = Array.isArray(actions)
  && (actions.includes('${CHAT_SEARCH_ACTION}') || actions.includes('${NODE_API_ACTION}'));

// canPlay === false is a normal runtime mode, not an error: the app runs
// read-only and every game in the group is still fully verifiable.`,

  inviteEnvelope: `// Complete ${PROTO_TAG} invite, exactly as it is sent.
{
  "app": "${APP_MARKER}",
  "qch1": {
    "protoTag": "${PROTO_TAG}",
    "protoVersion": "${PROTO_VERSION}",
    "type": "invite",
    "gameId": "${EXAMPLE_GAME_ID}",
    "from": "${EXAMPLE_WHITE}",
    "nonce": "${EXAMPLE_NONCE}",
    "ruleset": "${RULESET_IDS[0]}",
    "colorChoice": "${COLOR_CHOICES[0]}",
    "isPublic": true,
    "note": "friendly game"
  }
}`,

  moveEnvelope: `// Complete ${PROTO_TAG} move. Every move is self-contained: the full
// canonical history plus both hash-chain links travel with it, so a client
// that has seen nothing else can reconstruct and verify the game.
{
  "app": "${APP_MARKER}",
  "qch1": {
    "protoTag": "${PROTO_TAG}",
    "protoVersion": "${PROTO_VERSION}",
    "type": "move",
    "gameId": "${EXAMPLE_GAME_ID}",
    "from": "${EXAMPLE_WHITE}",
    "ply": 1,
    "move": "e2e4",
    "history": ["e2e4"],
    "prevHash": "${EXAMPLE_PREV_HASH}",
    "stateHash": "${EXAMPLE_STATE_HASH}",
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
  }
}

// "fen" is an optional display preview. It is never hashed and never trusted:
// recompute the position by replaying "history" through the ruleset.`,

  discovery: `// Discover live games: read the public Chess group backlog. The bridge
// action is preferred; the node API is the fallback the read-only mode uses.
const messages = await qdnRequest({
  action: '${CHAT_SEARCH_ACTION}',
  encoding: '${CHAT_MESSAGE_ENCODING}',
  groupId: ${CHESS_GROUP_ID},
  limit: ${DEFAULT_CHAT_FETCH_LIMIT},
  reverse: true,
});

// Fallback, and the only read path in a plain browser:
//   ${NODE_API_ACTION} GET ${CHAT_MESSAGES_NODE_PATH}?txGroupId=${CHESS_GROUP_ID}&encoding=${CHAT_MESSAGE_ENCODING}&limit=${DEFAULT_CHAT_FETCH_LIMIT}&reverse=true
//
// Live updates: ${CHAT_WEBSOCKET_PATH}?txGroupId=${CHESS_GROUP_ID}
// with a ${DEFAULT_CHAT_POLL_INTERVAL_MS} ms polling safety net. Deduplicate by chat transaction
// signature: the socket and the poller legitimately deliver the same message.`,

  validateEnvelope: `// Fetch, decode, validate. A chat message that is not ${PROTO_TAG} is not an
// error — the group carries ordinary human chat too.
const payload = new TextDecoder().decode(
  Uint8Array.from(atob(raw.data), (c) => c.charCodeAt(0)),
);

let envelope;
try {
  envelope = JSON.parse(payload);
} catch {
  return; // not ${PROTO_TAG}
}
if (envelope?.app !== '${APP_MARKER}' || typeof envelope.qch1 !== 'object') {
  return; // not ${PROTO_TAG}
}

// Size is gated only once the payload is known to be ours: a long human chat
// line is ordinary content, not an oversized envelope.
if (new TextEncoder().encode(payload).length > ${MAX_ENVELOPE_BYTES}) {
  return { accepted: false, badge: 'invalid.oversized' };
}

const message = envelope.qch1;

// Authority gate that no schema check can replace: the claimed author must be
// the account that signed the chat transaction.
if (message.from !== raw.sender) {
  return { accepted: false, badge: 'invalid.signerMismatch' };
}

// Reject a malformed record; never mutate game state from one.
if (message.protoTag !== '${PROTO_TAG}') {
  return { accepted: false, badge: 'invalid.schema' };
}

// Version gate: parse major.minor, never compare the string. A foreign major is
// a different protocol; a newer minor of the same major is forward-compatible —
// validate the fields you know and ignore the ones you do not.
const version = /${PROTO_VERSION_PATTERN}/.exec(message.protoVersion ?? '');
if (!version) {
  return { accepted: false, badge: 'invalid.schema' };
}
if (Number(version[1]) !== ${SUPPORTED_PROTO_VERSION.major}) {
  return { accepted: false, badge: 'invalid.versionUnsupported' };
}`,

  submitMove: `// Publish a move. Build it locally, apply it locally first (an illegal move
// must never reach the wire), then send the encoded envelope.
const wire = JSON.stringify({ app: '${APP_MARKER}', qch1: message });
if (new TextEncoder().encode(wire).length > ${MAX_ENVELOPE_BYTES}) {
  throw new Error('Envelope exceeds the ${MAX_ENVELOPE_BYTES}-byte budget');
}

await qdnRequest({
  action: '${CHAT_SEND_ACTION}',
  groupId: ${CHESS_GROUP_ID},
  message: wire,
});

// Posting requires group membership; Core enforces it. Spectating does not.
await qdnRequest({ action: '${JOIN_GROUP_ACTION}', groupId: ${CHESS_GROUP_ID} });`,

  verifyStateHash: `// Confirmation / state verification: recompute the chain rather than
// believing the sender. The canonical payload is minified JSON in exactly
// this key order, UTF-8, with players ordered white then black.
import { blake2b } from '@noble/hashes/blake2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

const canonical = JSON.stringify({
  protoTag: '${PROTO_TAG}',
  ruleset: '${RULESET_IDS[0]}',
  gameId: '${EXAMPLE_GAME_ID}',
  players: { white: '${EXAMPLE_WHITE}', black: '${EXAMPLE_BLACK}' },
  history: ['e2e4'],
  terminal: null,
});

const stateHash = bytesToHex(blake2b(utf8ToBytes(canonical), { dkLen: 32 }));
const accepted = stateHash === message.stateHash
  && message.prevHash === lastAcceptedStateHash;

// gameId is the same primitive, truncated:
//   blake2b-256(creatorAddress + nonce) sliced to ${GAME_ID_HEX_LENGTH} hex characters.`,

  deepLink: `// Canonical route for this workspace. 'developer' and 'reference' are
// accepted on read and re-serialized as 'developers'.
qdn://APP/Chess/Chess?${VIEW_QUERY_PARAM}=developers

// One game, shareable and clickable from any Qortium app:
qdn://APP/Chess/Chess?${VIEW_QUERY_PARAM}=game&gameId=${EXAMPLE_GAME_ID}`,
} as const;

export type ReferenceSnippetName = keyof typeof REFERENCE_SNIPPETS;

export const REFERENCE_SNIPPET_NAMES = Object.keys(
  REFERENCE_SNIPPETS,
) as ReferenceSnippetName[];

/**
 * Three-state copy control. A boolean would silently no-op in exactly the
 * case that matters — a sandboxed QDN iframe where the clipboard is blocked —
 * so unavailability is a first-class outcome announced through aria-live.
 */
export function CopyableCode({ id, label }: { id: ReferenceSnippetName; label: string }) {
  const [state, setState] = useState<'copied' | 'idle' | 'unavailable'>('idle');
  const code = REFERENCE_SNIPPETS[id];

  async function copy() {
    setState((await copyTextToClipboard(code)) ? 'copied' : 'unavailable');
  }

  return (
    <figure className="reference-code" id={`reference-example-${id}`}>
      <figcaption>
        <strong>{label}</strong>
        <button
          aria-label={`${state === 'copied' ? 'Copied' : 'Copy'} ${label}`}
          className="reference-copy"
          onClick={() => void copy()}
          type="button"
        >
          {state === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </figcaption>
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
      <span aria-live="polite" className="sr-only">
        {state === 'copied'
          ? `${label} copied.`
          : state === 'unavailable'
            ? 'Clipboard access is unavailable. Select the code manually.'
            : ''}
      </span>
    </figure>
  );
}

type MessageRow = {
  type: (typeof QCH1_MESSAGE_TYPES)[number];
  fields: string;
  rules: string;
};

const MESSAGE_ROWS: MessageRow[] = [
  {
    type: 'invite',
    fields: `nonce (${NONCE_HEX_LENGTH}-char hex), ruleset, colorChoice, isPublic (boolean), note? (string, ≤ ${MAX_INVITE_NOTE_LENGTH} characters)`,
    rules: 'Creates the game. gameId must derive from from + nonce or the message is rejected. One open invite per creator is client-enforced.',
  },
  { type: 'cancelInvite', fields: '—', rules: 'Creator only, before approval. Moves the game to canceled.' },
  { type: 'join', fields: '—', rules: 'Anyone except the creator, while the game is pending or awaitingApproval.' },
  { type: 'approve', fields: 'opponent (address)', rules: 'Creator only, and only for an address that already joined. Binds both players, resolves colors, rebases the hash chain, and activates the game.' },
  { type: 'reject', fields: 'opponent (address)', rules: 'Creator only. Removes that joiner; the game falls back to pending when none remain.' },
  {
    type: 'move',
    fields: `ply (integer ≥ 1), move (UCI), history (UCI array, length === ply, last element === move), prevHash (${STATE_HASH_HEX_LENGTH}-char hex), stateHash (${STATE_HASH_HEX_LENGTH}-char hex), fen? (string)`,
    rules: 'Bound players only, game active, correct side to move, legal under the ruleset, and both hashes must match the recomputed chain.',
  },
  { type: 'drawOffer', fields: 'atPly (integer ≥ 0)', rules: 'Players only, game active. atPly must equal the current history length; a stale offer is rejected. Any move supersedes a live offer.' },
  { type: 'drawAccept', fields: 'atPly (integer ≥ 0)', rules: 'Players only. Requires a live offer from the other player. Terminal: 1/2-1/2, draw-agreed.' },
  { type: 'drawDecline', fields: 'atPly (integer ≥ 0)', rules: 'Players only. Requires a live offer from the other player. Clears it without ending the game.' },
  { type: 'resign', fields: `prevHash (${STATE_HASH_HEX_LENGTH}-char hex)`, rules: 'Players only, game active, prevHash must match the last accepted state. The other player wins.' },
  {
    type: 'abort',
    fields: `prevHash (${STATE_HASH_HEX_LENGTH}-char hex)`,
    rules: `Players only, and only while fewer than ${ABORT_MAX_HISTORY_LENGTH} plies have been played. After both sides have moved the window is closed and the game can only end by resign, draw, or the board itself.`,
  },
  { type: 'chat', fields: `text (string, 1 to ${MAX_CHAT_TEXT_LENGTH} characters)`, rules: 'Recorded as an event; never touches game state. Spectators may chat in public games.' },
];

/** Renders an enum as a comma-separated run of inline code, wrappable. */
function CodeList({ values }: { values: readonly string[] }) {
  return (
    <>
      {values.map((value, index) => (
        <span key={value}>
          {index > 0 ? ', ' : ''}
          <code>{value}</code>
        </span>
      ))}
    </>
  );
}

function Section({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="reference-section" id={id}>
      <h2 id={`${id}-heading`}>{title}</h2>
      {children}
    </section>
  );
}

const TOC = [
  { id: 'reference-contract', label: 'Contract and envelope' },
  { id: 'reference-messages', label: 'Message types' },
  { id: 'reference-hash', label: 'Hash chain and move encoding' },
  { id: 'reference-validation', label: 'Validation and compatibility' },
  { id: 'reference-transport', label: 'Transport and discovery' },
  { id: 'reference-lifecycle', label: 'Authority, lifecycle, and state' },
  { id: 'reference-bridge', label: 'Home bridge and runtime modes' },
  { id: 'reference-limits', label: 'Limits and security' },
];

export function Reference() {
  return (
    <article className="developer-reference">
      <header className="reference-hero">
        <p className="eyebrow">Always-English public contract</p>
        <h1>
          {PROTO_TAG} developer reference
        </h1>
        <p>
          {PROTO_TAG} protocol version {PROTO_VERSION}. Confirmed CHAT transactions carry the
          authoritative record: a message is only as trustworthy as its transaction signer and
          its recomputed hash chain. Everything a client renders — search metadata, the optional{' '}
          <code>fen</code> preview, event badges — is a convenience over that.
        </p>
      </header>

      <nav aria-label="Developer reference sections" className="reference-toc">
        {TOC.map((entry) => (
          <a href={`#${entry.id}`} key={entry.id}>
            {entry.label}
          </a>
        ))}
      </nav>

      <Section id="reference-contract" title="Contract and envelope">
        <p>
          Every message travels as the <code>message</code> string of a Qortium CHAT transaction.
          The wire form is one compact JSON object with no dependency on any chat client&apos;s
          internal format:
        </p>
        <div className="reference-scroll">
          <pre tabIndex={0}>
            <code>{`{"app":"${APP_MARKER}","qch1":{ ...message... }}`}</code>
          </pre>
        </div>
        <p>
          A decoder must treat a non-matching payload as ordinary content rather than as an error:
          the group carries human chat as well. Reject only when <code>app</code> is{' '}
          <code>{APP_MARKER}</code> and the inner message then fails validation.
        </p>
        <p>
          Every message carries the same base fields: <code>protoTag</code> (always{' '}
          <code>{PROTO_TAG}</code>), <code>protoVersion</code> (a <code>major.minor</code> string,
          currently <code>{PROTO_VERSION}</code>), <code>type</code>, <code>gameId</code>, and{' '}
          <code>from</code>.
        </p>
        <div className="reference-scroll">
          <table>
            <caption>Base field grammar</caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Type</th>
                <th scope="col">Constraint</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>protoTag</code></td>
                <td>string</td>
                <td>Exactly <code>{PROTO_TAG}</code>. Any other value is rejected.</td>
              </tr>
              <tr>
                <td><code>protoVersion</code></td>
                <td>version string</td>
                <td>
                  <code>{PROTO_VERSION_PATTERN}</code> — <code>major.minor</code>, no leading
                  zeros. Major {SUPPORTED_PROTO_VERSION.major} is required; see compatibility
                  below.
                </td>
              </tr>
              <tr>
                <td><code>type</code></td>
                <td>enum</td>
                <td>One of the {QCH1_MESSAGE_TYPES.length} message types listed below.</td>
              </tr>
              <tr>
                <td><code>gameId</code></td>
                <td>hex string</td>
                <td>
                  <code>{GAME_ID_HEX_PATTERN}</code> — {GAME_ID_HEX_LENGTH} lowercase hex
                  characters (16 bytes).
                </td>
              </tr>
              <tr>
                <td><code>from</code></td>
                <td>address</td>
                <td>
                  {MIN_ADDRESS_LENGTH} to {MAX_ADDRESS_LENGTH} characters, and must equal the
                  chat transaction signer.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <CopyableCode id="inviteEnvelope" label="Complete invite envelope" />
      </Section>

      <Section id="reference-messages" title="Message types">
        <p>
          {QCH1_MESSAGE_TYPES.length} message types. Fields marked <code>?</code> are optional;
          an unrecognized extra field is ignored rather than rejected, so a future optional field
          does not break an older client.
        </p>
        <div className="reference-scroll">
          <table>
            <caption>{PROTO_TAG} message types, required and optional fields, and rules</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Fields beyond the base</th>
                <th scope="col">Rules</th>
              </tr>
            </thead>
            <tbody>
              {MESSAGE_ROWS.map((row) => (
                <tr key={row.type}>
                  <th scope="row"><code>{row.type}</code></th>
                  <td>{row.fields}</td>
                  <td>{row.rules}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CopyableCode id="moveEnvelope" label="Complete move envelope" />
      </Section>

      <Section id="reference-hash" title="Hash chain and move encoding">
        <p>
          Moves are lowercase UCI coordinate strings matching <code>{UCI_PATTERN}</code>:{' '}
          <code>e2e4</code>, promotion as <code>e7e8q</code>, castling as the king move{' '}
          <code>e1g1</code> or <code>e1c1</code>. UCI, not SAN: SAN carries check, mate, and
          disambiguation decoration, so it needs a page of normalization rules before it can be
          hashed, and it is chess-specific. UCI is already canonical — one string per move — and
          opaque enough that a future ruleset can define its own encoding under the same contract.
          SAN is derived for display only and is never part of the wire format or the hash.
        </p>
        <p>
          The state hash is <code>blake2b-256</code> over the canonical payload, rendered as{' '}
          {STATE_HASH_HEX_LENGTH} lowercase hex characters matching{' '}
          <code>{HASH_HEX_PATTERN}</code>. Canonical serialization is minified UTF-8 JSON with the
          keys in exactly this order: <code>protoTag</code>, <code>ruleset</code>,{' '}
          <code>gameId</code>, <code>players</code> (white then black), <code>history</code>,{' '}
          <code>terminal</code>.
        </p>
        <p>
          <code>gameId</code> is <code>blake2b-256(creatorAddress + nonce)</code> truncated to the
          first {GAME_ID_HEX_LENGTH} hex characters, where <code>nonce</code> is 16 random bytes as
          hex matching <code>{NONCE_HEX_PATTERN}</code>. Because the invite carries the nonce, every
          observer derives and checks the same identifier.
        </p>
        <p>
          The <code>prevHash</code> of ply 1 is the hash of the empty-history, non-terminal payload.
          Note that <code>approve</code> rebases the chain: the initial hash is recomputed once the
          two player addresses are bound, so a client must not cache the pre-approval value.
        </p>
        <CopyableCode id="verifyStateHash" label="Recompute and verify the state hash" />
      </Section>

      <Section id="reference-validation" title="Validation and compatibility">
        <p>
          A failed message never mutates game state. It is recorded in the game&apos;s event stream
          with a badge, so an invalid message is visible rather than silently dropped:
        </p>
        <ul className="reference-badges">
          {VALIDATION_BADGES.map((badge) => (
            <li key={badge}><code>{badge}</code></li>
          ))}
        </ul>
        <p>
          Every badge above is emitted by a real code path. Two of them are decided on the envelope
          before the record is inspected: <code>invalid.oversized</code> when the received wire
          string exceeds the {MAX_ENVELOPE_BYTES.toLocaleString('en-US')}-byte budget (the
          sender-side encoder also throws, so a conforming client never transmits one), and{' '}
          <code>invalid.versionUnsupported</code> from the version gate below.
        </p>
        <p>
          <strong>Unknown versions.</strong> <code>protoVersion</code> is parsed as{' '}
          <code>major.minor</code>, not treated as an opaque string. A message whose{' '}
          <strong>major differs</strong> from {SUPPORTED_PROTO_VERSION.major} is refused with{' '}
          <code>invalid.versionUnsupported</code> and never mutates state — it is a different
          protocol, whatever its fields look like. Within major{' '}
          {SUPPORTED_PROTO_VERSION.major}, any minor is compatible in both directions: a minor at or
          below {PROTO_VERSION} is fully understood, and a <strong>greater</strong> minor is
          processed forward-compatibly — the fields this build knows are validated normally and
          unknown fields are ignored, so a {PROTO_VERSION} client keeps playing a newer one. A
          version that does not parse as <code>major.minor</code> is a malformed record and fails
          as <code>invalid.schema</code>.
        </p>
        <p>
          The consequence for protocol evolution: an additive change — a new optional field, or a
          new message <code>type</code> older clients may ignore — is a <em>minor</em> bump. A
          change that would make an older client misread a record it still accepts must be a{' '}
          <em>major</em> bump, because only the major is a hard gate. Note that a newer minor
          carrying a <code>type</code> this build does not know is still recorded as{' '}
          <code>invalid.schema</code>; it is surfaced rather than silently dropped, and it never
          mutates game state.
        </p>
        <p>
          <strong>Malformed records.</strong> Structural failures return{' '}
          <code>invalid.schema</code> with a field-path detail such as <code>move.history.length</code>{' '}
          or <code>invite.nonce</code>. Duplicate delivery of the same chat transaction signature
          returns <code>invalid.duplicatedMessage</code>; deduplication by signature is required
          because the websocket and the polling fallback overlap by design.
        </p>
        <CopyableCode id="validateEnvelope" label="Decode and validate an incoming message" />
      </Section>

      <Section id="reference-transport" title="Transport and discovery">
        <p>
          Live play runs over fee-less CHAT messages in the public Chess group,{' '}
          <strong>groupId {CHESS_GROUP_ID}</strong> on Previewnet (open membership). Posting
          requires group membership, which Core enforces. Reading and spectating require no
          membership and no account at all.
        </p>
        <p>
          Reads prefer the <code>{CHAT_SEARCH_ACTION}</code> bridge action with{' '}
          <code>encoding: {CHAT_MESSAGE_ENCODING}</code>, default page size{' '}
          {DEFAULT_CHAT_FETCH_LIMIT}, newest first. When that action is unavailable the same data
          is read through <code>{NODE_API_ACTION}</code> at{' '}
          <code>{CHAT_MESSAGES_NODE_PATH}</code>. Live updates arrive on{' '}
          <code>{CHAT_WEBSOCKET_PATH}</code>, with polling every{' '}
          {DEFAULT_CHAT_POLL_INTERVAL_MS} ms as a safety net.
        </p>
        <p>
          Message payloads are base64 and decoded as UTF-8. Encrypted messages, non-text messages,
          and messages without a signature are skipped. Chat timestamps drive display ordering and
          the expiry countdown only — they never decide validity, which comes entirely from the
          hash chain and the ply sequence.
        </p>
        <p className="reference-warning">
          <strong>Chat retention is finite.</strong> Chat retention is user-configurable; 24 hours
          is only the default, so treat the horizon as unknown-but-finite rather than as a fixed
          24-hour clock. Once a game&apos;s messages age out of the group it disappears from live
          view, and this build offers no durability layer that outlives them: there is no publish
          path, no fetch path, and no persistence contract for a finished game. Treat every game as
          readable only for as long as its chat messages survive.
        </p>
        <CopyableCode id="discovery" label="Discover games in the group" />
      </Section>

      <Section id="reference-lifecycle" title="Authority, lifecycle, and state">
        <p>
          Authority follows the confirmed chat transaction signer. There is no server and no
          moderator: a client accepts a message because <code>from</code> equals the signer and
          because the recomputed hash chain agrees, not because any party asserted it.
        </p>
        <div className="reference-scroll">
          <table>
            <caption>Who may do what</caption>
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Permitted party</th>
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">Create a game</th><td>Any account that can post to the group.</td></tr>
              <tr><th scope="row">Cancel, approve, reject</th><td>The creator only.</td></tr>
              <tr><th scope="row">Move, resign, abort, draw messages</th><td>The two bound players only.</td></tr>
              <tr><th scope="row">Chat</th><td>Anyone, including spectators, on a public game.</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          Phases: <CodeList values={GAME_PHASES} />. The terminal set is{' '}
          <CodeList values={TERMINAL_GAME_PHASES} /> — no further protocol message is accepted
          once a game reaches one of them.
        </p>
        <p>
          A result is one of {GAME_RESULTS.join(', ')} together with a reason drawn from{' '}
          {TERMINAL_REASONS.join(', ')}.
        </p>
        <p>
          <strong>Abort before ply {ABORT_MAX_HISTORY_LENGTH}.</strong> A player may abort only
          while the history holds fewer than {ABORT_MAX_HISTORY_LENGTH} plies. Once both sides have
          moved, a losing player cannot kill the game: it ends only by resign, agreed draw, or the
          board itself.
        </p>
        <p>
          <strong>Auto-draw.</strong> {AUTO_DRAW_REASONS.join(', ')} are terminal the moment the
          ruleset reports them — there are no claim messages, so both clients agree
          deterministically. This deviates from FIDE claim-based fifty-move and threefold, where a
          player may choose to play on.
        </p>
        <p>
          Colors are resolved at <code>approve</code>: the creator&apos;s explicit choice, or for{' '}
          <code>{COLOR_CHOICES[2]}</code> the low bit of{' '}
          <code>blake2b-256(gameId + approveSignature)</code>, so every spectator derives the same
          assignment rather than trusting the creator&apos;s local randomness.
        </p>
        <p className="reference-warning">
          <strong>Game history is public and durable.</strong> Every move, chat line, address, and
          result in the public group is written to the chain in plain text and is readable by
          anyone. Nothing here is private, and nothing here can be edited or erased after the fact
          — deleting a local copy removes nothing from the network, and finite chat retention is a
          storage horizon rather than a privacy control. Do not put anything in a <code>note</code>{' '}
          or a <code>chat</code> message that you would not publish permanently under your own
          name.
        </p>
      </Section>

      <Section id="reference-bridge" title="Home bridge and runtime modes">
        <p>
          All host access goes through a single <code>qdnRequest</code> seam. The exact actions
          this app issues:
        </p>
        <div className="reference-scroll">
          <table>
            <caption>Bridge actions</caption>
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Direction</th>
                <th scope="col">Used for</th>
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row"><code>SHOW_ACTIONS</code></th><td>read</td><td>Capability detection.</td></tr>
              <tr><th scope="row"><code>WHICH_UI</code></th><td>read</td><td>Identifying the host surface.</td></tr>
              <tr><th scope="row"><code>{SELECTED_ACCOUNT_ACTION}</code></th><td>read</td><td>The playing address; absent means spectator mode.</td></tr>
              <tr><th scope="row"><code>{CHAT_SEARCH_ACTION}</code></th><td>read</td><td>Group backlog.</td></tr>
              <tr><th scope="row"><code>{NODE_API_ACTION}</code></th><td>read</td><td>Backlog fallback and group membership lookup.</td></tr>
              <tr><th scope="row"><code>{CHAT_SEND_ACTION}</code></th><td>write</td><td>Publishing every protocol message.</td></tr>
              <tr><th scope="row"><code>{JOIN_GROUP_ACTION}</code></th><td>write</td><td>Joining the Chess group so posting is permitted.</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>Capability detection.</strong> Support is decided by asking{' '}
          <code>SHOW_ACTIONS</code> and checking for the specific action, never by inferring it
          from a Home version, a platform, a node URL, or the presence of a selected account. A
          host that omits an action is a supported runtime mode, not a failure.
        </p>
        <p>
          Outside Home there is no bridge at all, and a local fallback serves the read-only action
          set — {LOCAL_READ_ACTIONS.join(', ')} — directly against a local node API. In that mode
          write actions throw, so the app runs as a verifier and spectator.
        </p>
        <p>
          <strong>Runtime modes.</strong> With a selected account and group membership, a client
          can create, join, and play. With an account but no membership, it can read everything and
          is offered <code>{JOIN_GROUP_ACTION}</code>. With no account it stays a spectator: the
          lobby, every game, and full hash-chain verification still work, because verification
          needs no key. A public node serves the same reads.
        </p>
        <p>
          <strong>Confirmation.</strong> A send resolves when the host accepts the chat
          transaction, which is not the same as the move being part of the game. The authoritative
          confirmation is seeing your own message arrive back through the group and pass the same
          validation gates every other client applies. Until then a move is pending, not played.
        </p>
        <p>
          <strong>QAVS.</strong> The published bundle carries <code>qortium-app.json</code>. The
          app&apos;s major.minor is the minimum platform level it requires and the patch position
          is the app counter; a host advertising a lower level via <code>GET_HOST_INFO</code> must
          not be sent capabilities above its level. This app requires only chat and node-read
          capabilities that predate its first release.
        </p>
        <CopyableCode id="capabilityDetection" label="Detect host capabilities" />
        <CopyableCode id="submitMove" label="Submit a move and join the group" />
        <CopyableCode id="deepLink" label="Canonical routes" />
      </Section>

      <Section id="reference-limits" title="Limits and security">
        <div className="reference-scroll">
          <table>
            <caption>Byte and count limits</caption>
            <thead>
              <tr>
                <th scope="col">Limit</th>
                <th scope="col">Value</th>
                <th scope="col">Enforced by</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">CHAT transaction data</th>
                <td>{MAX_CHAT_TX_BYTES.toLocaleString('en-US')} bytes</td>
                <td>Core.</td>
              </tr>
              <tr>
                <th scope="row">Encoded envelope</th>
                <td>{MAX_ENVELOPE_BYTES.toLocaleString('en-US')} bytes (UTF-8)</td>
                <td>
                  The sender, which throws before transmitting, and the receiver, which badges an
                  over-budget envelope <code>invalid.oversized</code>.
                </td>
              </tr>
              <tr>
                <th scope="row">Invite note</th>
                <td>{MAX_INVITE_NOTE_LENGTH} characters</td>
                <td>Schema validation on both sides.</td>
              </tr>
              <tr>
                <th scope="row">Chat text</th>
                <td>1 to {MAX_CHAT_TEXT_LENGTH.toLocaleString('en-US')} characters</td>
                <td>Schema validation on both sides.</td>
              </tr>
              <tr>
                <th scope="row">Address</th>
                <td>{MIN_ADDRESS_LENGTH} to {MAX_ADDRESS_LENGTH} characters</td>
                <td>Schema validation.</td>
              </tr>
              <tr>
                <th scope="row">Backlog page</th>
                <td>{DEFAULT_CHAT_FETCH_LIMIT} messages, newest first</td>
                <td>The app&apos;s default; the host may page further.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          A move costs roughly 5 bytes of history per ply, so even a 300-ply game stays far inside
          the envelope budget. A client that somehow exceeds it must not truncate{' '}
          <code>history</code> — the history is what makes the message self-contained and the hash
          verifiable.
        </p>
        <p className="reference-warning">
          <strong>Never put secrets in a message.</strong> {PROTO_TAG} needs no private key, seed
          phrase, API key, or wallet file, and none of the examples on this page contains one.
          Signing happens in the host; an app never sees key material. Any credential placed in a
          protocol field would be published permanently and irrevocably to a public group.
        </p>
      </Section>
    </article>
  );
}
