import { describe, expect, it } from 'vitest';
import {
  backtest,
  breakEven,
  computeIndicators,
  ema,
  evaluate,
  randomWalkCandles,
  rsi,
  runRandomWalkTest,
  stats,
  wilson
} from './engine';

describe('indicators', () => {
  it('EMA of a constant series is that constant', () => {
    expect(ema([5, 5, 5, 5, 5], 3)[4]).toBe(5);
  });
  it('EMA is NaN before the seed and equals the SMA at the seed', () => {
    const e = ema([1, 2, 3, 4], 3);
    expect(Number.isNaN(e[1])).toBe(true);
    expect(e[2]).toBe(2);
  });
  it('RSI is 100 on a strictly rising series and 0 on a falling one', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(up)[29]).toBe(100);
    expect(rsi([...up].reverse())[29]).toBe(0);
  });
});

describe('statistics', () => {
  it('break-even for 85% payout is 54.05%', () => {
    expect(breakEven(0.85)).toBeCloseTo(0.5405, 4);
  });
  it('Wilson interval matches the reference value', () => {
    const ci = wilson(55, 100);
    expect(ci.lo).toBeCloseTo(0.4524, 3);
    expect(ci.hi).toBeCloseTo(0.6439, 3);
  });
  it('counts streaks, ties and verdicts', () => {
    const st = stats(
      ['W', 'L', 'L', 'T', 'L', 'W'].map((r) => ({ result: r as 'W' | 'L' | 'T' })),
      0.85
    );
    expect(st.wins).toBe(2);
    expect(st.losses).toBe(3);
    expect(st.ties).toBe(1);
    expect(st.longestLosingStreak).toBe(3);
    expect(st.verdict).toBe('No proven edge');
  });
});

describe('no look-ahead', () => {
  it('signal at i is identical with or without future candles', () => {
    const c = randomWalkCandles(1500, 9);
    const full = computeIndicators(c);
    for (let i = 60; i < 1500; i += 37) {
      const a = evaluate(full, i);
      const b = evaluate(computeIndicators(c.slice(0, i + 1)), i);
      expect(b).toEqual(a);
    }
  });

  it('trades never overlap', () => {
    const c = randomWalkCandles(5000, 3);
    const { trades } = backtest(c, { expiry: 3 });
    for (let k = 1; k < trades.length; k++) expect(trades[k].i - trades[k - 1].i).toBeGreaterThanOrEqual(3);
  });

  it('random-walk win rate is ~50% for every expiry', () => {
    const res = runRandomWalkTest({ seeds: [1, 2, 3] });
    for (const e of Object.keys(res)) {
      const r = res[+e].ANY;
      expect(r.n).toBeGreaterThan(1000);
      expect(r.winRate).toBeGreaterThan(0.47);
      expect(r.winRate).toBeLessThan(0.53);
    }
  });
});
