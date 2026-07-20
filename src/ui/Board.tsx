// Presentational chess board driven by the classic rules adapter.
// Controlled: the owner supplies the history and receives chosen moves.
//
// ---------------------------------------------------------------------------
// Accessibility contract
// ---------------------------------------------------------------------------
// a11y-1  The board is a single tab stop. It follows the ARIA grid pattern
//         (role=grid > role=row > role=gridcell) with a roving tabindex: the
//         cursor square carries tabIndex=0, the other 63 carry -1. Arrow keys
//         move the cursor VISUALLY — the `board` array is already flipped for
//         `orientation`, so ArrowUp is always "up the screen" for both sides.
//         Edges clamp; the cursor never wraps around to the far file/rank.
// a11y-2  Activation is left to the native <button>: Enter and Space fire
//         onClick for free, so there is no keydown handler racing the click.
//         Escape clears a selection.
// a11y-3  Every square's accessible name carries coordinate + occupant +
//         state ("g8, black knight, capturable"). It is composed by WRAPPING
//         translator templates, never by concatenating words, so each locale
//         controls its own word order and punctuation.
// a11y-4  Selected / legal-target / last-move / check are all in the
//         accessible name; selection is additionally exposed as aria-selected
//         and the last move as aria-current="location". The CSS cues in
//         styles.css (§board-6) are the sighted equivalent of the same facts.
// a11y-5  Piece glyphs are Unicode characters rendered by a system font
//         fallback and are announced inconsistently (or silently) by screen
//         readers. They are aria-hidden; the real identity lives in the name.
// a11y-6  One polite live region carries move / check / mate / game-end text.
//         Polite, not assertive: none of this is an emergency, and assertive
//         would cut off the square name the user is currently reading while
//         arrowing around. Spam is prevented by content — the region's text is
//         derived from the position, so a re-render that does not change the
//         position produces no DOM mutation and therefore no announcement.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { MessageKey, TranslateFunction } from '../i18n';
import type { Uci } from '../protocol/types';
import { classicRules } from '../rules/classic';
import { describeTerminalReason } from './Lobby';

const PIECE_GLYPHS: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

/** FEN letter → translator key. Twelve explicit keys rather than a
    "{color} {piece}" template: adjective order and gender agreement differ
    (fr "cavalier blanc", de "weißer Springer", ru "белый конь"). */
const PIECE_NAME_KEYS: Record<string, MessageKey> = {
  K: 'piece.whiteKing',
  Q: 'piece.whiteQueen',
  R: 'piece.whiteRook',
  B: 'piece.whiteBishop',
  N: 'piece.whiteKnight',
  P: 'piece.whitePawn',
  k: 'piece.blackKing',
  q: 'piece.blackQueen',
  r: 'piece.blackRook',
  b: 'piece.blackBishop',
  n: 'piece.blackKnight',
  p: 'piece.blackPawn',
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
    // a1 is a dark square, h1 light ("white on the right"). fileIndex is
    // 0-based and rank is 1-based, so a1 sums to 1 — dark squares are the odd
    // sums, not the even ones.
    isDark: (fileIndex + rank) % 2 === 1,
  };
}

/** Square name → FEN letter, for reading the position *before* the last move. */
function occupancyFromFen(fen: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of boardFromFen(fen)) {
    for (const info of row) {
      if (info.piece) {
        map[info.square] = info.piece;
      }
    }
  }
  return map;
}

function isOwnPiece(piece: string | null, whiteToMove: boolean): boolean {
  if (!piece) return false;
  return whiteToMove ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
}

function clamp(value: number, max: number) {
  return value < 0 ? 0 : value > max ? max : value;
}

/**
 * One sentence describing the move that produced `history`, including capture,
 * castling, promotion, check and mate. Built by replaying the position one ply
 * back so the moving piece and the captured piece can be read off the board —
 * UCI alone does not say what moved.
 */
export function describeLastMove(history: readonly Uci[], t: TranslateFunction): string {
  if (history.length === 0) {
    return '';
  }

  const move = history[history.length - 1];
  const from = move.slice(0, 2);
  const to = move.slice(2, 4);
  const promotion = move.slice(4);

  const before = occupancyFromFen(classicRules.snapshot(classicRules.replay(history.slice(0, -1))));
  const mover = before[from];
  if (!mover) {
    return '';
  }

  const isWhite = mover === mover.toUpperCase();
  const pieceName = t(PIECE_NAME_KEYS[mover]);
  const captured = before[to];
  const isPawn = mover.toLowerCase() === 'p';
  // A pawn changing file onto an empty square is an en-passant capture.
  const enPassant = isPawn && from[0] !== to[0] && !captured;
  const fileDelta = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));

  let text: string;
  if (mover.toLowerCase() === 'k' && fileDelta === 2) {
    const color = t(isWhite ? 'color.white' : 'color.black');
    text = t(to[0] === 'g' ? 'announce.castleKingside' : 'announce.castleQueenside', { color });
  } else if (captured || enPassant) {
    text = t('announce.capture', { piece: pieceName, from, to });
  } else {
    text = t('announce.move', { piece: pieceName, from, to });
  }

  if (promotion) {
    const promoted = isWhite ? promotion.toUpperCase() : promotion.toLowerCase();
    text = t('announce.promotion', { move: text, piece: t(PIECE_NAME_KEYS[promoted]) });
  }

  const status = classicRules.status(classicRules.replay([...history]));
  if (status.over) {
    if (status.terminal.reason === 'checkmate') {
      text = t('announce.checkmate', { move: text });
    }
  } else if (status.inCheck) {
    text = t('announce.check', { move: text });
  }

  return text;
}

export type BoardProps = {
  history: readonly Uci[];
  t: TranslateFunction;
  /** Called with a legal move in UCI form. Absent/undefined = view-only board. */
  onMove?: (move: Uci) => void;
  orientation?: 'white' | 'black';
  /** Extra gate on top of onMove (e.g. "it is my turn"). Default true. */
  interactive?: boolean;
};

export function Board({ history, t, onMove, orientation = 'white', interactive = true }: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  // Roving-tabindex cursor. Starts on the player's own king so the first Tab
  // lands somewhere meaningful rather than on a corner rook.
  const [cursor, setCursor] = useState<string>(orientation === 'white' ? 'e1' : 'e8');
  const [feedback, setFeedback] = useState('');
  const squareRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const helpId = useId();

  const historyKey = history.join(' ');
  const state = useMemo(() => classicRules.replay([...history]), [historyKey]);
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

  const lastMove = history.length > 0 ? history[history.length - 1] : null;
  const lastFrom = lastMove ? lastMove.slice(0, 2) : null;
  const lastTo = lastMove ? lastMove.slice(2, 4) : null;

  // Checkmate is still "in check" for display purposes: the mated king should
  // keep its cue rather than losing it the instant the game ends.
  const inCheck = status.over ? status.terminal.reason === 'checkmate' : status.inCheck;
  const checkSquare = useMemo(() => {
    if (!inCheck) return null;
    const king = whiteToMove ? 'K' : 'k';
    for (const row of board) {
      for (const info of row) {
        if (info.piece === king) return info.square;
      }
    }
    return null;
  }, [board, inCheck, whiteToMove]);

  const announcement = useMemo(() => describeLastMove(history, t), [historyKey, t]);

  // A stale "not a legal destination" must not outlive the position it was
  // about, and a position change must not leave a selection from the old one.
  useEffect(() => {
    setFeedback('');
    setSelected(null);
  }, [historyKey]);

  function focusSquare(square: string) {
    setCursor(square);
    squareRefs.current[square]?.focus();
  }

  function stepCursor(rowDelta: number, colDelta: number) {
    let row = 0;
    let col = 0;
    board.forEach((squares, rowIndex) => {
      squares.forEach((info, colIndex) => {
        if (info.square === cursor) {
          row = rowIndex;
          col = colIndex;
        }
      });
    });
    focusSquare(board[clamp(row + rowDelta, 7)][clamp(col + colDelta, 7)].square);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    // Enter/Space are deliberately NOT handled here — the squares are real
    // <button>s, so the browser turns them into a click for us.
    switch (event.key) {
      case 'ArrowUp':
        stepCursor(-1, 0);
        break;
      case 'ArrowDown':
        stepCursor(1, 0);
        break;
      case 'ArrowLeft':
        stepCursor(0, -1);
        break;
      case 'ArrowRight':
        stepCursor(0, 1);
        break;
      case 'Home':
        stepCursor(event.ctrlKey ? -8 : 0, -8);
        break;
      case 'End':
        stepCursor(event.ctrlKey ? 8 : 0, 8);
        break;
      case 'Escape':
        setSelected(null);
        setFeedback('');
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function activate(info: SquareInfo) {
    // The cursor follows the pointer too, so Tab always returns to the last
    // square the user touched by either input method.
    setCursor(info.square);
    if (!canPlay) return;

    if (selected && targets.has(info.square)) {
      const plain = selected + info.square;
      // MVP promotion policy: auto-queen (the underpromotion picker comes later).
      const move = legal.includes(plain) ? plain : `${plain}q`;
      setSelected(null);
      setFeedback('');
      onMove?.(move);
      return;
    }

    if (isOwnPiece(info.piece, whiteToMove)) {
      setSelected(info.square);
      setFeedback('');
      return;
    }

    if (selected) {
      // A mis-keyed destination must not silently throw the selection away —
      // that is punishing when the board is being driven blind.
      setFeedback(t('announce.illegalTarget', { square: info.square }));
      return;
    }

    setSelected(null);
  }

  function squareName(info: SquareInfo): string {
    let name = info.piece
      ? t('square.occupied', { square: info.square, piece: t(PIECE_NAME_KEYS[info.piece]) })
      : t('square.empty', { square: info.square });

    if (selected === info.square) {
      name = t('square.selected', { name });
    } else if (targets.has(info.square)) {
      name = t(info.piece ? 'square.capture' : 'square.legalMove', { name });
    }
    if (info.square === lastFrom || info.square === lastTo) {
      name = t('square.lastMove', { name });
    }
    if (info.square === checkSquare) {
      name = t('square.inCheck', { name });
    }

    return name;
  }

  const turnLine = t(whiteToMove ? 'board.turnWhite' : 'board.turnBlack');
  const statusLine = status.over
    ? t('game.over', {
        // PGN score token — a protocol value, not copy.
        result: status.terminal.result,
        reason: describeTerminalReason(status.terminal.reason, t),
      })
    : status.inCheck
      ? t('board.checkSuffix', { status: turnLine })
      : turnLine;

  return (
    <div>
      <p id={helpId} className="sr-only">
        {t('board.keyboardHelp')}
      </p>
      <div
        className="board-grid"
        role="grid"
        aria-label={t('board.label')}
        aria-describedby={helpId}
        onKeyDown={handleKeyDown}
      >
        {board.map((row) => (
          <div className="board-row" role="row" key={row[0].square}>
            {row.map((info) => {
              const isLastMoveSquare = info.square === lastFrom || info.square === lastTo;
              return (
                <button
                  key={info.square}
                  type="button"
                  ref={(node) => {
                    squareRefs.current[info.square] = node;
                  }}
                  role="gridcell"
                  tabIndex={info.square === cursor ? 0 : -1}
                  aria-selected={selected === info.square}
                  aria-current={isLastMoveSquare ? 'location' : undefined}
                  aria-label={squareName(info)}
                  className={[
                    'board-square',
                    info.isDark ? 'dark' : 'light',
                    selected === info.square ? 'selected' : '',
                    targets.has(info.square) ? 'target' : '',
                    isLastMoveSquare ? 'last-move' : '',
                    info.square === checkSquare ? 'check' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => activate(info)}
                >
                  {/* a11y-5: decorative. The identity is in aria-label. */}
                  <span aria-hidden="true">{info.piece ? PIECE_GLYPHS[info.piece] : ''}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="board-status">{statusLine}</p>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={t('board.announcements')}
      >
        {announcement ? <span>{announcement}</span> : null}
        {status.over ? <span>{statusLine}</span> : null}
        {feedback ? <span>{feedback}</span> : null}
      </div>
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
