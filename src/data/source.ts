import type { Candle } from '../engine';
import { INTERVAL_MS, type Timeframe } from '../lib/constants';
import { tdKeyFor, type Asset } from './assets';
import { fetchBinanceHistory, fetchKlines } from './binance';
import { serverNow } from './clock';
import { tdHistory, tdRange } from './twelvedata';

export interface History {
  /** closed candles only, oldest first */
  closed: Candle[];
  /** the in-progress candle if the source provides it (Binance does, Twelve Data doesn't) */
  forming: Candle | null;
  /** open time of the candle forming right now */
  formingOpen: number;
  /** true if the last closed candle is too old: market closed or feed down */
  stale: boolean;
  /** true if the candle that just closed isn't published yet */
  lagging: boolean;
}

export function splitHistory(raw: Candle[], tf: Timeframe, now = serverNow()): History {
  const ms = INTERVAL_MS[tf];
  const closed = raw.filter((c) => c.T < now);
  const forming = raw.find((c) => c.T >= now && c.t <= now) ?? null;
  const formingOpen = Math.floor(now / ms) * ms;
  const last = closed[closed.length - 1];
  const stale = !last || now - last.T > 3 * ms + 5000;
  const lagging = !stale && !!last && last.t + ms < formingOpen;
  return { closed, forming, formingOpen, stale, lagging };
}

export async function fetchHistory(asset: Asset, tf: Timeframe, total: number, tdKey: string, onWait?: (ms: number) => void): Promise<History> {
  const raw =
    asset.source === 'binance'
      ? await fetchBinanceHistory(asset.symbol, tf, total + 1)
      : await tdHistory(asset.symbol, tf, total, tdKeyFor(tdKey), onWait);
  return splitHistory(raw, tf);
}

/** Candles starting exactly at `start` (open time), `count` of them. Used to settle logged trades. */
export async function fetchRange(asset: Asset, tf: Timeframe, start: number, count: number, tdKey: string): Promise<Candle[]> {
  if (asset.source === 'binance') return fetchKlines(asset.symbol, tf, { startTime: start, limit: count });
  return tdRange(asset.symbol, tf, start, count, tdKeyFor(tdKey));
}

/** A few of the latest candles, for live polling. */
export async function fetchRecent(asset: Asset, tf: Timeframe, tdKey: string): Promise<Candle[]> {
  if (asset.source === 'binance') return fetchKlines(asset.symbol, tf, { limit: 3 });
  return tdHistory(asset.symbol, tf, 3, tdKeyFor(tdKey));
}
