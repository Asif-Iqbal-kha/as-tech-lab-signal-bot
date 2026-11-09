import type { Candle, Scope, Signal, SignalDir, Stats, TradeResult, Verdict } from '../engine/engine';
import type { Expiry, Market, Timeframe } from './constants';

export interface Settings {
  symbol: Market;
  tf: Timeframe;
  expiry: Expiry;
  /** payout as a fraction, 0.85 = 85% */
  payout: number;
}

export interface LogEntry {
  id: string;
  createdAt: number;
  symbol: Market;
  tf: Timeframe;
  expiry: Expiry;
  payout: number;
  dir: SignalDir;
  score: number;
  rsi: number;
  filtered: 'BUY' | 'SELL' | null;
  signalCandleOpen: number;
  signalClose: number;
  /** open time of the candle forming at generation; its close is the entry */
  entryOpen: number;
  entryAt: number;
  exitAt: number;
  status: 'pending' | 'done' | 'none';
  entryPrice: number | null;
  exitPrice: number | null;
  result: TradeResult | null;
  bt: { scope: Scope; winRate: number; n: number; lo: number; hi: number; verdict: Verdict };
}

export interface SignalRun {
  entry: LogEntry;
  sig: Signal;
  st: Stats;
  scope: Scope;
  closed: Candle[];
  forming: Candle;
}

export type StepId = 'fetch' | 'ind' | 'bt';
export interface StepState {
  status: 'pending' | 'active' | 'done' | 'fail';
  detail?: string;
  ms?: number;
}
