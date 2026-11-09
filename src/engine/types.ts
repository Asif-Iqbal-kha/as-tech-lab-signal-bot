export interface Candle {
  /** open time (ms) */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
  /** close time (ms, inclusive) */
  T: number;
}

export type Direction = 'BUY' | 'SELL';
export type SignalDir = Direction | 'NONE';
export type Scope = Direction | 'ANY';
export type TradeResult = 'W' | 'L' | 'T';
export type StrategyId = 'trend' | 'reversal' | 'breakout' | 'stoch';

export interface Reason {
  text: string;
  detail: string;
  /** +1 favours BUY, −1 favours SELL, 0 neutral */
  vote: number;
  /** info rows are filters/context and don't count toward the score */
  info?: boolean;
}

export interface Signal {
  i: number;
  dir: SignalDir;
  score: number;
  maxScore: number;
  threshold: number;
  reasons: Reason[];
  notes: string[];
  /** direction the score qualified for but a filter blocked */
  filtered: Direction | null;
  close: number;
}

export interface Strategy<P = any> {
  id: StrategyId;
  name: string;
  short: string;
  description: string;
  /** Compute indicators once for the whole series (causal). */
  prepare(candles: Candle[]): P;
  /** Signal at index i, using only data at indices <= i. explain = false skips the text (fast, for backtests). */
  evaluate(p: P, i: number, explain?: boolean): Signal | null;
}

export interface Trade {
  i: number;
  t: number;
  dir: Direction;
  score: number;
  entry: number;
  exit: number;
  result: TradeResult;
}

export type Verdict = 'Edge found' | 'No proven edge' | 'Losing setup';

export interface Stats {
  wins: number;
  losses: number;
  ties: number;
  /** decisive trades (wins + losses) */
  n: number;
  total: number;
  winRate: number;
  ci: { lo: number; hi: number };
  breakEven: number;
  ev: number;
  longestLosingStreak: number;
  verdict: Verdict;
  payout: number;
  /** decisive trades needed to confirm the observed win rate beats break-even (Infinity if it doesn't) */
  needTrades: number;
}
