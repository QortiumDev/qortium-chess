// Local hot-seat play: both sides on one screen. Works fully offline.

import { useState } from 'react';
import type { Uci } from '../protocol/types';
import { Board, formatMovePairs } from './Board';

export function LocalBoard() {
  const [history, setHistory] = useState<Uci[]>([]);

  return (
    <div className="board-layout">
      <Board history={history} onMove={(move) => setHistory([...history, move])} />
      <div className="board-side">
        <div className="board-actions">
          <button type="button" onClick={() => setHistory([])}>
            New game
          </button>
          <button
            type="button"
            disabled={history.length === 0}
            onClick={() => setHistory(history.slice(0, -1))}
          >
            Undo
          </button>
        </div>
        <ol className="board-moves">
          {formatMovePairs(history).map((pair) => (
            <li key={pair}>{pair}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
