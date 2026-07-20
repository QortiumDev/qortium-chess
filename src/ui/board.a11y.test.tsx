// @vitest-environment jsdom
//
// Interaction tests for the board's accessibility contract (Board.tsx,
// a11y-1..a11y-6). These need a real DOM: focus management, roving tabindex
// and live-region text cannot be observed through renderToStaticMarkup.
//
// The jsdom environment is scoped to THIS FILE by the docblock above — the
// other suites stay on the default node environment and keep their speed.

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from '../i18n';
import type { Uci } from '../protocol/types';
import { Board } from './Board';

afterEach(cleanup);

const t = createTranslator('en');

/** A gridcell looked up by its coordinate — every name starts "<square>,". */
function square(id: string) {
  return screen.getByRole('gridcell', { name: new RegExp(`^${id},`) });
}

function liveRegion() {
  return screen.getByRole('status');
}

function renderBoard(props: Partial<Parameters<typeof Board>[0]> = {}) {
  const onMove = vi.fn();
  const view = render(
    <>
      <button type="button">before</button>
      <Board history={[]} t={t} onMove={onMove} {...props} />
      <button type="button">after</button>
    </>,
  );
  return { onMove, ...view };
}

/** Stateful host, so a full game can actually be played through the board. */
function PlayableBoard({ orientation }: { orientation?: 'white' | 'black' }) {
  const [history, setHistory] = useState<Uci[]>([]);
  return (
    <Board
      history={history}
      t={t}
      orientation={orientation}
      onMove={(move) => setHistory((current) => [...current, move])}
    />
  );
}

describe('board colouring', () => {
  // a1 rendered light and h1 dark for the whole of this app's life — invisible
  // to every test, obvious to any player. fileIndex is 0-based and rank is
  // 1-based, so the parity that reads as "even" in code is the odd square.
  it.each([
    ['a1', 'dark'],
    ['h1', 'light'],
    ['a8', 'light'],
    ['h8', 'dark'],
    ['e4', 'light'],
    ['d4', 'dark'],
  ])('renders %s as a %s square', (square, shade) => {
    renderBoard();

    const cell = screen.getByRole('gridcell', { name: new RegExp(`^${square},`) });

    expect(cell.className).toContain(shade);
    expect(cell.className).not.toContain(shade === 'dark' ? 'light' : 'dark');
  });

  it('keeps the colouring when the board is flipped', () => {
    renderBoard({ orientation: 'black' });

    // Orientation changes where a square sits on screen, never its colour.
    expect(screen.getByRole('gridcell', { name: /^a1,/ }).className).toContain('dark');
    expect(screen.getByRole('gridcell', { name: /^h1,/ }).className).toContain('light');
  });
});

describe('board structure', () => {
  it('is a single tab stop, not sixty-four', async () => {
    const user = userEvent.setup();
    renderBoard();

    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(64);
    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);

    await user.tab();
    expect(screen.getByRole('button', { name: 'before' })).toHaveFocus();

    await user.tab();
    expect(square('e1')).toHaveFocus();

    // One more Tab must leave the board entirely.
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('exposes eight rows inside a labelled grid', () => {
    renderBoard();

    const grid = screen.getByRole('grid', { name: 'Chess board' });
    expect(within(grid).getAllByRole('row')).toHaveLength(8);
  });

  it('hides the Unicode piece glyphs from assistive technology', () => {
    renderBoard();

    const cell = square('e1');
    expect(cell).toHaveAccessibleName('e1, white king');
    // The glyph is present for sighted users but carries no accessible text.
    expect(cell.textContent).toBe('♔');
    expect(cell.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('accessible names', () => {
  it('names occupied and empty squares', () => {
    renderBoard();

    expect(square('e2')).toHaveAccessibleName('e2, white pawn');
    expect(square('e4')).toHaveAccessibleName('e4, empty');
    expect(square('g8')).toHaveAccessibleName('g8, black knight');
  });

  it('names a capturable target and a legal empty target once a piece is selected', async () => {
    const user = userEvent.setup();
    renderBoard({ history: ['e2e4', 'd7d5'] });

    await user.click(square('e4'));

    expect(square('e4')).toHaveAccessibleName('e4, white pawn, selected');
    expect(square('d5')).toHaveAccessibleName('d5, black pawn, capturable, last move');
    expect(square('e5')).toHaveAccessibleName('e5, empty, legal move');
  });

  it('names the last move and the king in check', () => {
    renderBoard({ history: ['d2d4', 'e7e6', 'e2e4', 'f8b4'] });

    expect(square('f8')).toHaveAccessibleName('f8, empty, last move');
    expect(square('b4')).toHaveAccessibleName('b4, black bishop, last move');
    expect(square('e1')).toHaveAccessibleName('e1, white king, in check');
  });

  it('marks selection with aria-selected and the last move with aria-current', async () => {
    const user = userEvent.setup();
    renderBoard({ history: ['e2e4'] });

    expect(square('e4')).toHaveAttribute('aria-current', 'location');
    expect(square('e2')).toHaveAttribute('aria-current', 'location');
    expect(square('d2')).not.toHaveAttribute('aria-current');

    expect(square('e7')).toHaveAttribute('aria-selected', 'false');
    await user.click(square('e7'));
    expect(square('e7')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('arrow-key navigation', () => {
  it('moves the cursor visually and carries the roving tabindex with it', async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.tab();
    await user.tab();
    expect(square('e1')).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(square('e2')).toHaveFocus();
    expect(square('e2').tabIndex).toBe(0);
    expect(square('e1').tabIndex).toBe(-1);

    await user.keyboard('{ArrowRight}');
    expect(square('f2')).toHaveFocus();

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(square('d2')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(square('d1')).toHaveFocus();
  });

  it('respects board orientation so arrows move by screen direction, not by rank', async () => {
    const user = userEvent.setup();
    renderBoard({ orientation: 'black' });

    await user.tab();
    await user.tab();
    // Black sees its own back rank at the bottom of the screen.
    expect(square('e8')).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(square('e7')).toHaveFocus();

    // Files are mirrored too: screen-left of e is f, not d.
    await user.keyboard('{ArrowLeft}');
    expect(square('f7')).toHaveFocus();
  });

  it('clamps at the board edges instead of wrapping around', async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.tab();
    await user.tab();
    expect(square('e1')).toHaveFocus();

    // e1 is already on the bottom visual row for White.
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(square('e1')).toHaveFocus();

    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(square('a1')).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(square('a1')).toHaveFocus();
  });
});

describe('select, move and cancel', () => {
  it('plays a move entirely from the keyboard', async () => {
    const user = userEvent.setup();
    render(<PlayableBoard />);

    await user.tab();
    expect(square('e1')).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    await user.keyboard('{Enter}');
    expect(square('e2')).toHaveAttribute('aria-selected', 'true');
    expect(square('e4')).toHaveAccessibleName('e4, empty, legal move');

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(square('e4')).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(square('e4')).toHaveAccessibleName('e4, white pawn, last move');
    expect(screen.getByText('Black to move')).toBeInTheDocument();
  });

  it('cancels a selection with Escape without touching the position', async () => {
    const user = userEvent.setup();
    const { onMove } = renderBoard();

    await user.click(square('e2'));
    expect(square('e2')).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Escape}');
    expect(square('e2')).toHaveAttribute('aria-selected', 'false');
    expect(square('e4')).toHaveAccessibleName('e4, empty');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('keeps the selection and the focus put when an illegal destination is chosen', async () => {
    const user = userEvent.setup();
    const { onMove } = renderBoard();

    await user.tab();
    await user.tab();
    await user.keyboard('{ArrowUp}{Enter}');
    expect(square('e2')).toHaveAttribute('aria-selected', 'true');

    // e5 is two ranks beyond a pawn's opening reach.
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(square('e5')).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(onMove).not.toHaveBeenCalled();
    expect(square('e5')).toHaveFocus();
    expect(square('e2')).toHaveAttribute('aria-selected', 'true');
    expect(liveRegion()).toHaveTextContent('e5 is not a legal destination.');
  });
});

describe('live region', () => {
  it('is polite, not assertive', () => {
    renderBoard();

    expect(liveRegion()).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion()).toHaveAttribute('aria-atomic', 'true');
  });

  it('says nothing before the first move', () => {
    renderBoard();

    expect(liveRegion()).toHaveTextContent('');
  });

  it('announces the moving piece, its squares and check', () => {
    renderBoard({ history: ['d2d4', 'e7e6', 'e2e4', 'f8b4'] });

    expect(liveRegion()).toHaveTextContent('black bishop f8 to b4, check');
  });

  it('announces a capture rather than a quiet move', () => {
    renderBoard({ history: ['e2e4', 'd7d5', 'e4d5'] });

    expect(liveRegion()).toHaveTextContent('white pawn e4 takes d5');
  });

  it('announces checkmate and the game result together', () => {
    renderBoard({ history: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] });

    expect(liveRegion()).toHaveTextContent('black queen d8 to h4, checkmate');
    expect(liveRegion()).toHaveTextContent('Game over: 0-1 (checkmate)');
  });

  it('announces a stalemate draw at game end', () => {
    // Classic minimal stalemate: after Qc7 Black has no legal move.
    const history = [
      'e2e3', 'a7a5', 'd1h5', 'a8a6', 'h5a5', 'h7h5', 'a5c7', 'a6h6',
      'h2h4', 'f7f6', 'c7d7', 'e8f7', 'd7b7', 'd8d3', 'b7b8', 'd3h7',
      'b8c8', 'f7g6', 'c8e6',
    ];
    renderBoard({ history });

    expect(liveRegion()).toHaveTextContent('Game over: 1/2-1/2 (stalemate)');
  });

  it('re-renders without changing the announcement when the position has not changed', () => {
    const { rerender, onMove } = renderBoard({ history: ['e2e4'] });
    const before = liveRegion().textContent;

    rerender(
      <>
        <button type="button">before</button>
        <Board history={['e2e4']} t={t} onMove={onMove} interactive={false} />
        <button type="button">after</button>
      </>,
    );

    expect(liveRegion().textContent).toBe(before);
  });
});

describe('translation', () => {
  it('builds every AT-facing string through the translator', () => {
    const de = createTranslator('de');
    render(<Board history={['d2d4', 'e7e6', 'e2e4', 'f8b4']} t={de} />);

    expect(screen.getByRole('grid', { name: 'Schachbrett' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: /^e1,/ })).toHaveAccessibleName(
      'e1, weißer König, im Schach',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'schwarzer Läufer von f8 nach b4, Schach',
    );
  });
});
