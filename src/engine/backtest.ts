import type { Candle, Scope, Strategy, Trade, TradeResult } from './types';

export interface BacktestOptions {
  expiry?: number;
  direction?: Scope;
  /** prepared indicators from strategy.prepare(candles), to reuse across runs */
  prepared?: unknown;
  /**
   * 0 = enter at the signal candle's close (Watch mode: alert fires at the close).
   * 1 = enter at the NEXT candle's close (Generate mode: you wait for the countdown).
   */
  entryDelay?: number;
  /** only signals at indices in [from, to) whose exit is also < to (for train/test splits) */
  from?: number;
  to?: number;
}

export interface BacktestResult {
  trades: Trade[];
  candles: number;
  expiry: number;
  direction: Scope;
  entryDelay: number;
}

/** One trade at a time: the next entry can only happen at or after the previous exit. */
export function backtest(candles: Candle[], strategy: Strategy, opts: BacktestOptions = {}): BacktestResult {
  const expiry = opts.expiry ?? 1;
  const direction = opts.direction ?? 'ANY';
  const delay = opts.entryDelay ?? 0;
  const p = opts.prepared ?? strategy.prepare(candles);
  const to = Math.min(opts.to ?? candles.length, candles.length);
  const trades: Trade[] = [];
  let i = Math.max(opts.from ?? 0, 1);
  while (i + delay + expiry < to) {
    const s = strategy.evaluate(p, i, false);
    if (s && s.dir !== 'NONE' && (direction === 'ANY' || s.dir === direction)) {
      const entryIdx = i + delay;
      const exitIdx = entryIdx + expiry;
      const entry = candles[entryIdx].c;
      const exit = candles[exitIdx].c;
      const d = exit - entry;
      const result: TradeResult = d === 0 ? 'T' : (s.dir === 'BUY') === d > 0 ? 'W' : 'L';
      trades.push({ i, t: candles[i].t, dir: s.dir, score: s.score, entry, exit, result });
      i = exitIdx - delay;
    } else i++;
  }
  return { trades, candles: candles.length, expiry, direction, entryDelay: delay };
}

/** Merge lower-timeframe candles into `ms`-long candles; drops the final group if its window isn't over. */
export function resample(candles: Candle[], ms: number): Candle[] {
  if (!candles.length) return [];
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const c of candles) {
    const g = Math.floor(c.t / ms) * ms;
    if (!cur || cur.t !== g) {
      if (cur) out.push(cur);
      cur = { t: g, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v, T: g + ms - 1 };
    } else {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
      if (c.v != null) cur.v = (cur.v ?? 0) + c.v;
    }
  }
  const last = candles[candles.length - 1];
  if (cur && cur.T <= last.T) out.push(cur);
  return out;
}
