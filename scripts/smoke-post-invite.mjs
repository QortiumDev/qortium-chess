// Previewnet smoke helper: post a QCH1 invite (or other envelope) to the Chess
// lobby group as the local preview account, via the node API's public chat
// flow (build → mempow compute → sign → process). Dev/test use only.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { blake2b } from '@noble/hashes/blake2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

const NODE = process.env.QORTIUM_CHESS_NODE_API_URL ?? 'http://127.0.0.1:24891';
const GROUP_ID = 14;
const API_KEY = readFileSync(path.join(homedir(), '.config/qortium-core/runtime/apikey.txt'), 'utf8').trim();
const accounts = JSON.parse(
  readFileSync(path.join(homedir(), 'qortium/git/qortium-core/preview/secrets/initial-minting-accounts.json'), 'utf8'),
);
const account = accounts.accounts?.find((item) => item.role === 'local');
if (!account) throw new Error('Local preview account not found.');

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(bytes) {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = '';
  while (value > 0n) {
    out = BASE58_ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = '1' + out;
  }
  return out;
}

async function api(pathname, options = {}) {
  const response = await fetch(NODE + pathname, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} -> HTTP ${response.status}: ${text}`);
  return text;
}

const nonce = randomBytes(16).toString('hex');
const gameId = bytesToHex(blake2b(utf8ToBytes(account.accountAddress + nonce), { dkLen: 32 })).slice(0, 32);
const envelope = {
  app: 'chess',
  qch1: {
    protoTag: 'QCH1',
    protoVersion: '1.0',
    type: 'invite',
    gameId,
    from: account.accountAddress,
    nonce,
    ruleset: 'classic',
    colorChoice: 'Random',
    isPublic: true,
    note: 'Previewnet smoke invite',
  },
};
const message = JSON.stringify(envelope);

const unsigned = await api('/chat/public/build', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    timestamp: Date.now(),
    txGroupId: GROUP_ID,
    fee: 0,
    senderPublicKey: account.accountPublicKey,
    data: base58Encode(new TextEncoder().encode(message)),
    isText: true,
    isEncrypted: false,
  }),
});
const withNonce = await api('/chat/compute', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain', 'X-API-KEY': API_KEY },
  body: unsigned,
});
const signed = await api('/transactions/sign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-KEY': API_KEY },
  body: JSON.stringify({ privateKey: account.accountPrivateKey, transactionBytes: withNonce }),
});
const result = await api('/transactions/process', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain', 'X-API-KEY': API_KEY },
  body: signed,
});
console.log('process:', result.trim().slice(0, 120));
console.log('invite gameId:', gameId);

// Verify it is searchable.
await new Promise((resolve) => setTimeout(resolve, 2_000));
const messages = JSON.parse(
  await api(`/chat/messages?txGroupId=${GROUP_ID}&encoding=BASE64&limit=10&reverse=true`),
);
const found = messages.find((m) => {
  try {
    return JSON.parse(Buffer.from(m.data, 'base64').toString('utf8')).qch1?.gameId === gameId;
  } catch {
    return false;
  }
});
console.log(found ? `VISIBLE in chat search (signature ${found.signature.slice(0, 12)}…)` : 'NOT visible yet');
