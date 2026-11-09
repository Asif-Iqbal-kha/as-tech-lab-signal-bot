import type { Candle, Scope, Signal, SignalDir, SimResult, StakePlan, Stats, StrategyId, TradeResult, Verdict, MartingaleCheck } from '../engine';
import type { Asset } from '../data/assets';
import type { StakeMode } from '../engine';
import type { Expiry, Timeframe } from './constants';

export interface Settings {
  assetId: string;
  tf: Timeframe;
  expiry: Expiry;
  strategy: StrategyId;
  /** payout per asset as a fraction (0.85 = 85%) */
  payouts: Record<string, number>;
  /** candles of history used for backtests */
  depth: number;
  bankroll: number;
  stakeMode: StakeMode;
  fixedPct: number;
  maxPct: number;
  /** stop after this many losses in a day (0 = off) */
  dailyMaxLosses: number;
  /** Twelve Data API key for forex ('' = public demo key) */
  tdKey: string;
  sound: boolean;
}

export type EntryMode = 'manual' | 'watch';

export interface LogEntry {
  id: string;
  createdAt: number;
  assetId: string;
  quotex: string;
  tf: Timeframe;
  expiry: Expiry;
  payout: number;
  strategy: StrategyId;
  /** manual = entered at the next candle close; watch = entered at the signal candle close */
  mode: EntryMode;
  dir: SignalDir;
  score: number;
  maxScore: number;
  signalCandleOpen: number;
  signalClose: number;
  /** open time of the candle whose close is the entry */
  entryOpen: number;
  entryAt: number;
  exitAt: number;
  status: 'pending' | 'done' | 'none';
  entryPrice: number | null;
  exitPrice: number | null;
  result: TradeResult | null;
  /** suggested stake in $ when the signal was generated (null = unknown) */
  stake: number | null;
  /** signalled while the daily stop was active */
  blocked?: boolean;
  bt: { scope: Scope; winRate: number; n: number; lo: number; hi: number; verdict: Verdict | string };
}

export interface SignalRun {
  /** candles between the signal candle and your entry (1 normally, 2 when forex data lags) */
  entryDelay: number;
  entry: LogEntry;
  asset: Asset;
  sig: Signal;
  st: Stats;
  scope: Scope;
  closed: Candle[];
  plan: StakePlan;
  sim: SimResult;
  simStake: number;
  marti: MartingaleCheck;
}

export type StepId = 'fetch' | 'ind' | 'bt' | 'risk';
export interface StepState {
  status: 'pending' | 'active' | 'done' | 'fail';
  detail?: string;
  ms?: number;
}
