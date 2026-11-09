import { backtest } from './backtest';
import { breakEven, normInv, stats, wilson } from './stats';
import { getStrategy } from './strategies';
import type { Candle, Stats, StrategyId } from './types';

export interface ScanSeries {
  assetId: string;
  tf: string;
  candles: Candle[];
  /** candles between the signal and the realistic entry (0 = enter at the signal candle's close) */
  entryDelay?: number;
}

export type SetupLabel = 'Validated edge' | 'Not confirmed' | 'No edge' | 'Losing' | 'Too few trades';

export interface SetupResult {
  key: string;
  assetId: string;
  tf: string;
  expiry: number;
  strategy: StrategyId;
  payout: number;
  breakEven: number;
  candles: number;
  /** older part of history: used to pick candidates */
  train: Stats;
  /** newer part, never used for picking: used to confirm */
  test: Stats;
  all: Stats;
  candidate: boolean;
  validated: boolean;
  /** lower bound on the test win rate after the multiple-testing correction */
  testLowAdj: number;
  label: SetupLabel;
}

export interface ScanOptions {
  expiries: number[];
  strategies: StrategyId[];
  payoutFor: (assetId: string) => number;
  /** share of history used for picking (default 0.7) */
  trainFrac?: number;
  /** minimum decisive trades in the training part to be a candidate (default 30) */
  minTrain?: number;
}

/** Stage 1 for one price series: train/test backtests for every strategy × expiry (instant entry). */
export function scanSeries(series: ScanSeries, opts: ScanOptions): SetupResult[] {
  const { candles, assetId, tf } = series;
  const n = candles.length;
  const split = Math.floor(n * (opts.trainFrac ?? 0.7));
  const minTrain = opts.minTrain ?? 30;
  const payout = opts.payoutFor(assetId);
  const be = breakEven(payout);
  const out: SetupResult[] = [];
  for (const sid of opts.strategies) {
    const strategy = getStrategy(sid);
    const prepared = strategy.prepare(candles);
    for (const expiry of opts.expiries) {
      const entryDelay = series.entryDelay ?? 0;
      const tr = backtest(candles, strategy, { expiry, prepared, entryDelay, from: 0, to: split }).trades;
      const te = backtest(candles, strategy, { expiry, prepared, entryDelay, from: split, to: n }).trades;
      const train = stats(tr, payout);
      const test = stats(te, payout);
      const all = stats([...tr, ...te], payout);
      out.push({
        key: `${assetId}|${tf}|${expiry}|${sid}`,
        assetId,
        tf,
        expiry,
        strategy: sid,
        payout,
        breakEven: be,
        candles: n,
        train,
        test,
        all,
        candidate: train.n >= minTrain && train.ci.lo > be,
        validated: false,
        testLowAdj: NaN,
        label: 'No edge'
      });
    }
  }
  return out;
}

export interface ScanSummary {
  results: SetupResult[];
  hypotheses: number;
  candidates: number;
  validated: number;
  /** z used on the test data (Bonferroni over the candidates) */
  zAdj: number;
}

/**
 * Stage 2: candidates are confirmed only on the unseen newer data, with a one-sided
 * Bonferroni correction over the number of candidates. Random data should validate nothing.
 */
export function finalizeScan(results: SetupResult[], alpha = 0.05, minTest = 20): ScanSummary {
  const K = results.filter((r) => r.candidate).length;
  const zAdj = K ? normInv(1 - alpha / K) : NaN;
  for (const r of results) {
    if (r.candidate && r.test.n >= minTest) {
      r.testLowAdj = wilson(r.test.wins, r.test.n, zAdj).lo;
      r.validated = r.testLowAdj > r.breakEven;
    }
    r.label = r.validated
      ? 'Validated edge'
      : r.candidate
        ? 'Not confirmed'
        : r.all.n < 30
          ? 'Too few trades'
          : r.all.ci.hi < r.breakEven
            ? 'Losing'
            : 'No edge';
  }
  const rank = (r: SetupResult) => (r.validated ? 2 : r.candidate ? 1 : 0);
  const margin = (r: SetupResult) => (r.all.n ? r.all.ci.lo - r.breakEven : -1);
  results.sort((a, b) => rank(b) - rank(a) || margin(b) - margin(a));
  return { results, hypotheses: results.length, candidates: K, validated: results.filter((r) => r.validated).length, zAdj };
}
