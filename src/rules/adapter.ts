// Ruleset-agnostic rules adapter — QCH1 spec §3.
// Interface intentionally mirrors J-Chess's JCH_Autoplay surface
// (listLegalActions/applyAction/getGameStatus) so that engine can become
// the "jchess" ruleset later without protocol changes.

import type { GameResult, RulesetId, Terminal, Uci } from '../protocol/types';

export type Color = 'white' | 'black';

export type RulesStatus =
  | { over: false; sideToMove: Color; inCheck: boolean }
  | { over: true; terminal: Terminal };

export interface RulesAdapter<State> {
  rulesetId: RulesetId;
  initialState(): State;
  /** Fully legal moves (check/pin aware) in canonical wire encoding. */
  legalMoves(state: State): Uci[];
  /** Returns the successor state; throws on an illegal or unparsable move. */
  apply(state: State, move: Uci): State;
  status(state: State): RulesStatus;
  /** Replay a full history from the initial position; throws on first illegal move. */
  replay(history: Uci[]): State;
  /** Display/preview serialization (FEN for classic). Never hashed, never trusted. */
  snapshot(state: State): string;
  toPGN(history: Uci[], meta: { white: string; black: string; result?: GameResult }): string;
}
