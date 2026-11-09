import { backtest, resample } from './backtest';
import { bollinger, ema, macd, rollingMax, rollingMin, rsi, sign, sma, stochastic } from './indicators';
import { kelly, martingale, planStake, sampleBeta, simulateBankroll } from './money';
import { mulberry32, randomWalkCandles } from './randomWalk';
import { finalizeScan, scanSeries } from './scanner';
import { breakEven, normInv, requiredTrades, stats, verdictFor, wilson } from './stats';
import { STRATEGIES, getStrategy } from './strategies';
import type { StrategyId } from './types';

export * from './types';
export * from './indicators';
export * from './stats';
export * from './strategies';
export * from './backtest';
export * from './money';
export * from './randomWalk';
export * from './scanner';

export interface RandomWalkRow {
  strategy: StrategyId;
  expiry: number;
  winRate: number;
  n: number;
  ciLo: number;
  ciHi: number;
}

/** Every strategy on pure random-walk prices. Without look-ahead bugs, all land near 50%. */
export function runRandomWalkTest(
  opts: { n?: number; seeds?: number[]; expiries?: number[]; strategies?: StrategyId[] } = {}
): RandomWalkRow[] {
  const n = opts.n ?? 20000;
  const seeds = opts.seeds ?? [1, 2, 3];
  const expiries = opts.expiries ?? [1, 2, 3, 5];
  const ids = opts.strategies ?? STRATEGIES.map((s) => s.id);
  const series = seeds.map((s) => randomWalkCandles(n, s));
  const rows: RandomWalkRow[] = [];
  for (const id of ids) {
    const strategy = getStrategy(id);
    const prepared = series.map((c) => strategy.prepare(c));
    for (const expiry of expiries) {
      const trades = series.flatMap((c, k) => backtest(c, strategy, { expiry, prepared: prepared[k] }).trades);
      const st = stats(trades);
      rows.push({ strategy: id, expiry, winRate: st.winRate, n: st.n, ciLo: st.ci.lo, ciHi: st.ci.hi });
    }
  }
  return rows;
}

export const ASEngine = {
  sign,
  ema,
  sma,
  rsi,
  macd,
  bollinger,
  stochastic,
  rollingMax,
  rollingMin,
  strategies: STRATEGIES,
  getStrategy,
  backtest,
  resample,
  wilson,
  normInv,
  breakEven,
  requiredTrades,
  verdictFor,
  stats,
  kelly,
  planStake,
  martingale,
  simulateBankroll,
  sampleBeta,
  scanSeries,
  finalizeScan,
  mulberry32,
  randomWalkCandles,
  runRandomWalkTest
};
