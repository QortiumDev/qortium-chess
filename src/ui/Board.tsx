// Presentational chess board driven by the classic rules adapter.
// Controlled: the owner supplies the history and receives chosen moves.

import { useMemo, useState } from 'react';
import type { Uci } from '../protocol/types';
import { classicRules } from '../rules/classic';

const PIECE_GLYPHS: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

type SquareInfo = { square: string; piece: string | null; isDark: boolean };

function boardFromFen(fen: string): SquareInfo[][] {
  const rows = fen.split(' ')[0].split('/');
  return rows.map((row, rankIndex) => {
    const rank = 8 - rankIndex;
    const squares: SquareInfo[] = [];
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) {
          squares.push(makeSquare(file++, rank, null));
        }
      } else {
        squares.push(makeSquare(file++, rank, ch));
      }
    }
    return squares;
  });
}

function makeSquare(fileIndex: number, rank: number, piece: string | null): SquareInfo {
  return {
    square: FILES[fileIndex] + rank,
    piece,
    isDark: (fileIndex + rank) % 2 === 0,
  };
}

function isOwnPiece(piece: string | null, whiteToMove: boolean): boolean {
  if (!piece) return false;
  return whiteToMove ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
}

export type BoardProps = {
  history: readonly Uci[];
  /** Called with a legal move in UCI form. Absent/undefined = view-only board. */
  onMove?: (move: Uci) => void;
  orientation?: 'white' | 'black';
  /** Extra gate on top of onMove (e.g. "it is my turn"). Default true. */
  interactive?: boolean;
};

export function Board({ history, onMove, orientation = 'white', interactive = true }: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const state = useMemo(() => classicRules.replay([...history]), [history]);
  const status = classicRules.status(state);
  const legal = useMemo(() => classicRules.legalMoves(state), [state]);
  const fen = classicRules.snapshot(state);
  const board = useMemo(() => {
    const rows = boardFromFen(fen);
    return orientation === 'white' ? rows : rows.map((row) => [...row].reverse()).reverse();
  }, [fen, orientation]);
  const whiteToMove = fen.split(' ')[1] === 'w';
  const canPlay = Boolean(onMove) && interactive && !status.over;

  const targets = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(legal.filter((m) => m.startsWith(selected)).map((m) => m.slice(2, 4)));
  }, [legal, selected]);

  function clickSquare(info: SquareInfo) {
    if (!canPlay) return;
    if (selected && targets.has(info.square)) {
      const plain = selected + info.square;
      // MVP promotion policy: auto-queen (the underpromotion picker comes later).
      const move = legal.includes(plain) ? plain : `${plain}q`;
      setSelected(null);
      onMove?.(move);
      return;
    }
    setSelected(isOwnPiece(info.piece, whiteToMove) ? info.square : null);
  }

  const statusLine = status.over
    ? `Game over — ${status.terminal.result} (${status.terminal.reason})`
    : `${whiteToMove ? 'White' : 'Black'} to move${status.inCheck ? ' — check!' : ''}`;

  return (
    <div>
      <div className="board-grid" role="grid" aria-label="Chess board">
        {board.flat().map((info) => (
          <button
            key={info.square}
            type="button"
            className={[
              'board-square',
              info.isDark ? 'dark' : 'light',
              selected === info.square ? 'selected' : '',
              targets.has(info.square) ? 'target' : '',
            ].join(' ')}
            onClick={() => clickSquare(info)}
            aria-label={info.square + (info.piece ? ` ${info.piece}` : ' empty')}
          >
            {info.piece ? PIECE_GLYPHS[info.piece] : ''}
          </button>
        ))}
      </div>
      <p className="board-status">{statusLine}</p>
    </div>
  );
}

export function formatMovePairs(history: readonly Uci[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push(`${i / 2 + 1}. ${history[i]}${history[i + 1] ? ' ' + history[i + 1] : ''}`);
  }
  return pairs;
}
