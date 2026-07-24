import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createTranslator } from '../i18n';
import type { TrackedGame } from '../game/service';
import { GameRoom } from './GameRoom';

const CREATOR = 'QCREATORADDRESSXXXXXXXXXXXXXXXXXXX';
const OPPONENT = 'QOPPONENTADDRESSXXXXXXXXXXXXXXXXXX';
const SPECTATOR = 'QSPECTATORADDRESSXXXXXXXXXXXXXXXXX';

const game: TrackedGame = {
  gameId: '047f069c5a4e6ad5f4617ef063374cee',
  creator: CREATOR,
  colorChoice: 'White',
  isPublic: true,
  phase: 'active',
  joiners: [],
  players: { white: CREATOR, black: OPPONENT },
  history: [],
  lastStateHash: '0'.repeat(64),
  terminal: null,
  drawOffer: null,
  lastEventTimestamp: 0,
  events: [
    {
      signer: SPECTATOR,
      signature: 'chat-message',
      timestamp: 1,
      message: { type: 'chat', text: 'Good luck.' },
      verdict: { accepted: true },
    } as TrackedGame['events'][number],
  ],
};

describe('GameRoom account identities', () => {
  it('keeps authoritative full addresses visible in the participant header and game chat', () => {
    const html = renderToStaticMarkup(
      <GameRoom game={game} service={null} me={null} canPlay={false} t={createTranslator('en')} onBack={() => {}} />,
    );

    expect(html).toContain(CREATOR);
    expect(html).toContain(OPPONENT);
    expect(html).toContain(SPECTATOR);
  });

  it('renders text fallbacks rather than image elements before Home advertises the avatar action', () => {
    const html = renderToStaticMarkup(
      <GameRoom game={game} service={null} me={null} canPlay={false} t={createTranslator('en')} onBack={() => {}} />,
    );

    expect(html).toContain('account-avatar-fallback');
    expect(html).not.toContain('<img');
  });
});
