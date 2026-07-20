// Local hot-seat play: both sides on one screen. Works fully offline.

import { useState } from 'react';
import type { TranslateFunction } from '../i18n';
import type { Uci } from '../protocol/types';
import { Board, formatMovePairs } from './Board';

export type LocalBoardProps = { t: TranslateFunction };

export function LocalBoard({ t }: LocalBoardProps) {
  const [history, setHistory] = useState<Uci[]>([]);

  return (
    <div className="board-layout">
      <Board history={history} t={t} onMove={(move) => setHistory([...history, move])} />
      <div className="board-side">
        <div className="board-actions">
          <button type="button" onClick={() => setHistory([])}>
            {t('local.newGame')}
          </button>
          <button
            type="button"
            disabled={history.length === 0}
            onClick={() => setHistory(history.slice(0, -1))}
          >
            {t('local.undo')}
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
