// Rendered-contract tests (SPEC-spec-first-qortium-apps.md §6.1).
//
// These are drift detectors, not markup snapshots: every assertion is tied to a
// constant imported from the implementation, so changing the protocol without
// changing the reference fails here.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { REFERENCE_SNIPPETS, REFERENCE_SNIPPET_NAMES, Reference } from './Reference';
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
  ARCHIVE_IDENTIFIER_PREFIX,
  ARCHIVE_SERVICE,
  ARCHIVE_SERVICE_ID,
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

function render() {
  return renderToStaticMarkup(<Reference />);
}

// renderToStaticMarkup escapes quotes and angle brackets in text nodes.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

describe('Reference — protocol marker and data model', () => {
  it('renders the live protocol marker, version, and envelope shape', () => {
    const html = render();

    expect(html).toContain(PROTO_TAG);
    expect(html).toContain(PROTO_VERSION);
    expect(html).toContain(escapeHtml(`{"app":"${APP_MARKER}","qch1":{ ...message... }}`));
    expect(html).toContain(RULESET_IDS[0]);
  });

  it('documents every message type', () => {
    const html = render();

    for (const type of QCH1_MESSAGE_TYPES) {
      expect(html).toContain(`<code>${type}</code>`);
    }
    expect(html).toContain(String(QCH1_MESSAGE_TYPES.length));
  });

  it('renders the live identifier grammars and hash lengths', () => {
    const html = render();

    expect(html).toContain(escapeHtml(GAME_ID_HEX_PATTERN));
    expect(html).toContain(escapeHtml(HASH_HEX_PATTERN));
    expect(html).toContain(escapeHtml(NONCE_HEX_PATTERN));
    expect(html).toContain(escapeHtml(UCI_PATTERN));
    expect(html).toContain(String(GAME_ID_HEX_LENGTH));
    expect(html).toContain(String(STATE_HASH_HEX_LENGTH));
  });

  it('explains UCI over SAN and that fen is untrusted', () => {
    const html = render();

    expect(html).toContain('UCI, not SAN');
    expect(html).toContain('disambiguation');
    expect(html).toContain('never hashed');
    expect(html).toContain('blake2b-256');
    expect(html).toContain('minified UTF-8 JSON');
  });

  it('lists every validation badge and the compatibility rules', () => {
    const html = render();

    for (const badge of VALIDATION_BADGES) {
      expect(html).toContain(`<code>${badge}</code>`);
    }
    expect(html).toContain('emitted by a real code path');
    expect(html).toContain('Unknown versions');
    expect(html).toContain('Malformed records');
    expect(html).toContain('never mutates game state');
  });

  it('renders the live version-gate grammar and semantics', () => {
    const html = render();

    expect(html).toContain(escapeHtml(PROTO_VERSION_PATTERN));
    expect(html).toContain('major.minor');
    expect(html).toContain('forward-compatibly');
    expect(html).toContain('<code>invalid.versionUnsupported</code>');
    expect(html).toContain(String(SUPPORTED_PROTO_VERSION.major));
  });

  it('pins the version and size gates inside the validation snippet', () => {
    const snippet = REFERENCE_SNIPPETS.validateEnvelope;

    expect(snippet).toContain('invalid.versionUnsupported');
    expect(snippet).toContain('invalid.oversized');
    expect(snippet).toContain(PROTO_VERSION_PATTERN);
    expect(snippet).toContain(`!== ${SUPPORTED_PROTO_VERSION.major}`);
    expect(snippet).toContain(String(MAX_ENVELOPE_BYTES));
  });
});

describe('Reference — resource identity and discovery', () => {
  it('renders the chat group transport and its read paths', () => {
    const html = render();

    expect(html).toContain(String(CHESS_GROUP_ID));
    expect(html).toContain(CHAT_SEARCH_ACTION);
    expect(html).toContain(NODE_API_ACTION);
    expect(html).toContain(CHAT_MESSAGES_NODE_PATH);
    expect(html).toContain(CHAT_WEBSOCKET_PATH);
    expect(html).toContain(CHAT_MESSAGE_ENCODING);
    expect(html).toContain(String(DEFAULT_CHAT_FETCH_LIMIT));
    expect(html).toContain(String(DEFAULT_CHAT_POLL_INTERVAL_MS));
  });

  it('renders the QDN archive tuple and identifier family', () => {
    const html = render();

    expect(html).toContain(ARCHIVE_SERVICE);
    expect(html).toContain(String(ARCHIVE_SERVICE_ID));
    expect(html).toContain(escapeHtml(`${ARCHIVE_IDENTIFIER_PREFIX}<gameId>`));
    expect(html).toContain('Search results are discovery metadata');
    expect(html).toContain('Not yet implemented');
  });
});

describe('Reference — authority, lifecycle, and state', () => {
  it('renders every phase, result, and terminal reason', () => {
    const html = render();

    for (const phase of GAME_PHASES) {
      expect(html).toContain(`<code>${phase}</code>`);
    }
    for (const phase of TERMINAL_GAME_PHASES) {
      expect(html).toContain(`<code>${phase}</code>`);
    }
    for (const result of GAME_RESULTS) {
      expect(html).toContain(result);
    }
    for (const reason of TERMINAL_REASONS) {
      expect(html).toContain(reason);
    }
    for (const reason of AUTO_DRAW_REASONS) {
      expect(html).toContain(reason);
    }
  });

  it('documents the abort window and deterministic color resolution', () => {
    const html = render();

    expect(html).toContain(`Abort before ply ${ABORT_MAX_HISTORY_LENGTH}`);
    expect(html).toContain(`fewer than ${ABORT_MAX_HISTORY_LENGTH} plies`);
    expect(html).toContain(escapeHtml('blake2b-256(gameId + approveSignature)'));
    expect(html).toContain(COLOR_CHOICES[2]);
    expect(html).toContain('confirmed chat transaction signer');
  });

  it('warns that game history is public and durable', () => {
    const html = render();

    expect(html).toContain('Game history is public and durable');
    expect(html).toContain('readable by anyone');
    expect(html).toContain('nothing here can be edited or erased after the fact');
    expect(html).toContain('Chat retention is finite');
  });
});

describe('Reference — Home bridge and runtime modes', () => {
  it('renders the exact bridge actions the app issues', () => {
    const html = render();

    for (const action of [
      'SHOW_ACTIONS',
      'WHICH_UI',
      SELECTED_ACCOUNT_ACTION,
      CHAT_SEARCH_ACTION,
      CHAT_SEND_ACTION,
      NODE_API_ACTION,
      JOIN_GROUP_ACTION,
    ]) {
      expect(html).toContain(`<code>${action}</code>`);
    }
  });

  it('describes SHOW_ACTIONS capability detection and the local read-only action set', () => {
    const html = render();

    expect(html).toContain('never by inferring it');
    expect(html).toContain('Capability detection');
    for (const action of LOCAL_READ_ACTIONS) {
      expect(html).toContain(action);
    }
  });

  it('documents spectator mode, confirmation semantics, and QAVS', () => {
    const html = render();

    expect(html).toContain('With no account it stays a spectator');
    expect(html).toContain('verification needs no key');
    expect(html).toContain('pending, not played');
    expect(html).toContain('QAVS');
    expect(html).toContain('GET_HOST_INFO');
    expect(html).toContain('qortium-app.json');
  });
});

describe('Reference — limits and security', () => {
  it('renders every limit with its unit', () => {
    const html = render();

    expect(html).toContain(`${MAX_CHAT_TX_BYTES.toLocaleString('en-US')} bytes`);
    expect(html).toContain(`${MAX_ENVELOPE_BYTES.toLocaleString('en-US')} bytes`);
    expect(html).toContain(`${MAX_INVITE_NOTE_LENGTH} characters`);
    expect(html).toContain(`${MAX_CHAT_TEXT_LENGTH.toLocaleString('en-US')} characters`);
    expect(html).toContain(`${MIN_ADDRESS_LENGTH} to ${MAX_ADDRESS_LENGTH} characters`);
    expect(html).toContain(`${DEFAULT_CHAT_FETCH_LIMIT} messages`);
  });

  it('carries the secret-handling warning and no credentials anywhere', () => {
    const html = render();

    expect(html).toContain('Never put secrets in a message');
    expect(html).toContain('an app never sees key material');

    const everything = [html, ...Object.values(REFERENCE_SNIPPETS)].join('\n');
    for (const forbidden of ['privateKey', 'private key:', 'apiKey', 'x-api-key', 'seedPhrase', 'BEGIN PRIVATE']) {
      expect(everything).not.toContain(forbidden);
    }
  });
});

describe('Reference — accessibility and structure', () => {
  it('exposes a labelled section navigation whose links match real anchors', () => {
    const html = render();

    expect(html).toContain('<nav aria-label="Developer reference sections"');

    const anchors = [...html.matchAll(/href="#([a-z-]+)"/g)].map((match) => match[1]);

    expect(anchors.length).toBeGreaterThan(5);
    for (const anchor of anchors) {
      expect(html).toContain(`id="${anchor}"`);
    }
  });

  it('labels every section heading and every table', () => {
    const html = render();

    const labelledBy = [...html.matchAll(/aria-labelledby="([a-z-]+)"/g)].map((match) => match[1]);

    expect(labelledBy.length).toBe(anchorSectionCount(html));
    for (const heading of labelledBy) {
      expect(html).toContain(`id="${heading}"`);
    }

    const tables = html.match(/<table>/g)?.length ?? 0;
    const captions = html.match(/<caption>/g)?.length ?? 0;

    expect(tables).toBeGreaterThan(0);
    expect(captions).toBe(tables);
  });

  it('gives every copy control an aria-live result region and a keyboard-reachable pre', () => {
    const html = render();

    const copyButtons = html.match(/class="reference-copy"/g)?.length ?? 0;

    expect(copyButtons).toBe(REFERENCE_SNIPPET_NAMES.length);
    expect(html.match(/aria-live="polite"/g)?.length).toBe(REFERENCE_SNIPPET_NAMES.length);
    expect(html).toContain('<pre tabindex="0">');
  });

  it('wraps every table and code block in its own scroll container', () => {
    const html = render();

    const tables = html.match(/<table>/g)?.length ?? 0;
    const scrollers = html.match(/class="reference-scroll"/g)?.length ?? 0;

    expect(scrollers).toBeGreaterThanOrEqual(tables);
  });
});

function anchorSectionCount(html: string) {
  return html.match(/class="reference-section"/g)?.length ?? 0;
}

describe('Reference — exported snippet inventory', () => {
  it('exports exactly the operations an independent client needs', () => {
    expect(REFERENCE_SNIPPET_NAMES).toEqual([
      'capabilityDetection',
      'inviteEnvelope',
      'moveEnvelope',
      'discovery',
      'validateEnvelope',
      'submitMove',
      'verifyStateHash',
      'archiveLookup',
      'deepLink',
    ]);
  });

  it('renders every exported snippet on the page', () => {
    const html = render();

    for (const name of REFERENCE_SNIPPET_NAMES) {
      expect(html).toContain(`id="reference-example-${name}"`);
    }
  });

  it('pins the contract-critical fields inside the capability-detection example', () => {
    const snippet = REFERENCE_SNIPPETS.capabilityDetection;

    expect(snippet).toContain("action: 'SHOW_ACTIONS'");
    expect(snippet).toContain(CHAT_SEND_ACTION);
    expect(snippet).toContain(CHAT_SEARCH_ACTION);
    expect(snippet).toContain(NODE_API_ACTION);
  });

  it('pins every base and invite field inside the invite example', () => {
    const snippet = REFERENCE_SNIPPETS.inviteEnvelope;

    expect(snippet).toContain(`"app": "${APP_MARKER}"`);
    expect(snippet).toContain(`"protoTag": "${PROTO_TAG}"`);
    expect(snippet).toContain(`"protoVersion": "${PROTO_VERSION}"`);
    expect(snippet).toContain(`"ruleset": "${RULESET_IDS[0]}"`);
    expect(snippet).toContain(`"colorChoice": "${COLOR_CHOICES[0]}"`);
    for (const field of ['"type": "invite"', '"gameId"', '"from"', '"nonce"', '"isPublic"', '"note"']) {
      expect(snippet).toContain(field);
    }
  });

  it('pins every hash-chain field inside the move example', () => {
    const snippet = REFERENCE_SNIPPETS.moveEnvelope;

    for (const field of ['"type": "move"', '"ply"', '"move"', '"history"', '"prevHash"', '"stateHash"', '"fen"']) {
      expect(snippet).toContain(field);
    }
    expect(snippet).toContain('never hashed and never trusted');
  });

  it('pins the discovery, validation, and submit contracts', () => {
    expect(REFERENCE_SNIPPETS.discovery).toContain(`groupId: ${CHESS_GROUP_ID}`);
    expect(REFERENCE_SNIPPETS.discovery).toContain(`limit: ${DEFAULT_CHAT_FETCH_LIMIT}`);
    expect(REFERENCE_SNIPPETS.discovery).toContain(CHAT_WEBSOCKET_PATH);

    expect(REFERENCE_SNIPPETS.validateEnvelope).toContain(`envelope?.app !== '${APP_MARKER}'`);
    expect(REFERENCE_SNIPPETS.validateEnvelope).toContain('invalid.signerMismatch');
    expect(REFERENCE_SNIPPETS.validateEnvelope).toContain('message.from !== raw.sender');

    expect(REFERENCE_SNIPPETS.submitMove).toContain(`action: '${CHAT_SEND_ACTION}'`);
    expect(REFERENCE_SNIPPETS.submitMove).toContain(String(MAX_ENVELOPE_BYTES));
    expect(REFERENCE_SNIPPETS.submitMove).toContain(`action: '${JOIN_GROUP_ACTION}'`);
  });

  it('pins the canonical hash payload key order', () => {
    const snippet = REFERENCE_SNIPPETS.verifyStateHash;
    const order = ['protoTag:', 'ruleset:', 'gameId:', 'players:', 'history:', 'terminal:'];
    const positions = order.map((key) => snippet.indexOf(key));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(snippet).toContain('dkLen: 32');
    expect(snippet).toContain('white:');
  });

  it('pins the archive tuple and the canonical developers route', () => {
    expect(REFERENCE_SNIPPETS.archiveLookup).toContain(`service: '${ARCHIVE_SERVICE}'`);
    expect(REFERENCE_SNIPPETS.archiveLookup).toContain(ARCHIVE_IDENTIFIER_PREFIX);
    expect(REFERENCE_SNIPPETS.archiveLookup).toContain('SEARCH_QDN_RESOURCES');
    expect(REFERENCE_SNIPPETS.archiveLookup).toContain('FETCH_QDN_RESOURCE');

    expect(REFERENCE_SNIPPETS.deepLink).toContain('?view=developers');
    expect(REFERENCE_SNIPPETS.deepLink).toContain('?view=game&gameId=');
  });
});
