import { describe, expect, it } from 'vitest';
import {
  STRATEGIES,
  backtest,
  bollinger,
  breakEven,
  ema,
  finalizeScan,
  kelly,
  martingale,
  normInv,
  planStake,
  randomWalkCandles,
  requiredTrades,
  resample,
  rsi,
  runRandomWalkTest,
  scanSeries,
  simulateBankroll,
  stats,
  stochastic,
  wilson
} from './index';

describe('indicators', () => {
  it('EMA of a constant series is that constant; seeded with the SMA', () => {
    expect(ema([5, 5, 5, 5, 5], 3)[4]).toBe(5);
    expect(ema([1, 2, 3, 4], 3)[2]).toBe(2);
  });
  it('RSI is 100 rising and 0 falling', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(up)[29]).toBe(100);
    expect(rsi([...up].reverse())[29]).toBe(0);
  });
  it('Bollinger bands match a hand calculation', () => {
    const bb = bollinger([1, 2, 3, 4, 5], 5, 2);
    // mean 3, population sd sqrt(2)
    expect(bb.mid[4]).toBe(3);
    expect(bb.upper[4]).toBeCloseTo(3 + 2 * Math.SQRT2, 10);
  });
  it('stochastic stays within 0..100', () => {
    const c = randomWalkCandles(500, 4);
    const { k, d } = stochastic(c);
    for (let i = 20; i < c.length; i++) {
      expect(k[i]).toBeGreaterThanOrEqual(0);
      expect(k[i]).toBeLessThanOrEqual(100);
      expect(d[i]).toBeGreaterThanOrEqual(0);
    }
  });
  it('resample builds 3m candles from 1m and drops the unfinished one', () => {
    const one = randomWalkCandles(10, 2); // t = 0..9 minutes
    const three = resample(one, 180000);
    expect(three.length).toBe(3); // minutes 0-2, 3-5, 6-8; minute 9 is incomplete
    expect(three[1].o).toBe(one[3].o);
    expect(three[1].c).toBe(one[5].c);
    expect(three[1].h).toBe(Math.max(one[3].h, one[4].h, one[5].h));
  });
});

describe('statistics', () => {
  it('break-even for 85% payout is 54.05%', () => expect(breakEven(0.85)).toBeCloseTo(0.5405, 4));
  it('Wilson interval matches the reference value', () => {
    const ci = wilson(55, 100);
    expect(ci.lo).toBeCloseTo(0.4524, 3);
    expect(ci.hi).toBeCloseTo(0.6439, 3);
  });
  it('normInv matches known quantiles', () => {
    expect(normInv(0.975)).toBeCloseTo(1.959964, 5);
    expect(normInv(0.5)).toBeCloseTo(0, 8);
    expect(normInv(0.001)).toBeCloseTo(-3.090232, 5);
  });
  it('required trades grows as the edge shrinks', () => {
    expect(requiredTrades(0.6, 0.54)).toBeLessThan(requiredTrades(0.56, 0.54));
    expect(requiredTrades(0.5, 0.54)).toBe(Infinity);
  });
  it('counts streaks, ties and verdicts', () => {
    const st = stats(['W', 'L', 'L', 'T', 'L', 'W'].map((r) => ({ result: r as 'W' | 'L' | 'T' })), 0.85);
    expect([st.wins, st.losses, st.ties, st.longestLosingStreak]).toEqual([2, 3, 1, 3]);
    expect(st.verdict).toBe('No proven edge');
  });
});

describe('money', () => {
  it('kelly fraction', () => {
    expect(kelly(0.6, 0.85)).toBeCloseTo((0.6 * 0.85 - 0.4) / 0.85, 10);
    expect(kelly(0.5, 0.85)).toBeLessThan(0);
  });
  it('stakes nothing in Kelly mode without an edge', () => {
    const plan = planStake({ bankroll: 100, mode: 'kelly', fixedPct: 0.01, maxPct: 0.02, payout: 0.85, n: 200, winRate: 0.52, lo: 0.45, hasEdge: false });
    expect(plan.stake).toBe(0);
  });
  it('caps the Kelly stake', () => {
    const plan = planStake({ bankroll: 100, mode: 'kelly', fixedPct: 0.01, maxPct: 0.02, payout: 0.85, n: 2000, winRate: 0.7, lo: 0.68, hasEdge: true });
    expect(plan.stake).toBe(2);
  });
  it('martingale needs exponentially more money', () => {
    const m = martingale(1, 0.85, 6);
    expect(m.multiplier).toBeCloseTo(1.85 / 0.85, 10);
    expect(m.nextStake).toBeCloseTo((1.85 / 0.85) ** 6, 8);
    expect(m.needed).toBeGreaterThan(100);
  });
  it('a coin-flip setup loses money in simulation', () => {
    const sim = simulateBankroll({ wins: 500, losses: 500, payout: 0.85, bankroll: 100, stake: 2, trades: 200, paths: 1000 });
    expect(sim.median).toBeLessThan(100);
    expect(sim.probDown).toBeGreaterThan(0.6);
  });
});

describe('no look-ahead (every strategy)', () => {
  const c = randomWalkCandles(1500, 9);
  for (const s of STRATEGIES) {
    it(`${s.name}: signal at i is identical with or without future candles`, () => {
      const full = s.prepare(c);
      let fired = 0;
      for (let i = 60; i < 1500; i += 13) {
        const a = s.evaluate(full, i);
        const b = s.evaluate(s.prepare(c.slice(0, i + 1)), i);
        expect(b).toEqual(a);
        if (a && a.dir !== 'NONE') fired++;
      }
      expect(fired).toBeGreaterThan(0);
    });
  }

  it('trades never overlap, with and without entry delay', () => {
    const s = STRATEGIES[0];
    for (const entryDelay of [0, 1]) {
      const { trades } = backtest(randomWalkCandles(5000, 3), s, { expiry: 3, entryDelay });
      for (let k = 1; k < trades.length; k++) expect(trades[k].i - trades[k - 1].i).toBeGreaterThanOrEqual(3);
    }
  });

  it('a train/test split keeps every exit inside its range', () => {
    const candles = randomWalkCandles(3000, 5);
    const { trades } = backtest(candles, STRATEGIES[1], { expiry: 5, from: 0, to: 2000 });
    for (const t of trades) expect(t.i + 5).toBeLessThan(2000);
  });

  it('random-walk win rate is ~50% for every strategy and expiry', () => {
    for (const r of runRandomWalkTest({ seeds: [1, 2, 3] })) {
      expect(r.n).toBeGreaterThan(300);
      expect(r.winRate).toBeGreaterThan(0.46);
      expect(r.winRate).toBeLessThan(0.54);
    }
  });
});

describe('scanner', () => {
  const opts = { expiries: [1, 2, 3, 5], strategies: STRATEGIES.map((s) => s.id), payoutFor: () => 0.85 };

  it('validates nothing on random-walk data (no false edges)', () => {
    const results = [1, 2, 3, 4, 5, 6].flatMap((seed) =>
      scanSeries({ assetId: `RW${seed}`, tf: '1m', candles: randomWalkCandles(5000, seed * 11) }, opts)
    );
    const summary = finalizeScan(results);
    expect(summary.hypotheses).toBe(96);
    expect(summary.validated).toBe(0);
  });

  it('finds a planted momentum edge', () => {
    const results = scanSeries({ assetId: 'MOM', tf: '1m', candles: randomWalkCandles(5000, 77, 100, 0.002, 0.35) }, opts);
    const summary = finalizeScan(results);
    expect(summary.validated).toBeGreaterThan(0);
    expect(summary.results[0].label).toBe('Validated edge');
  });
});
