import type { Candle } from '../engine';
import { REST_BASES } from '../lib/constants';
import { setServerOffset } from './clock';

export { serverNow } from './clock';

async function fetchJSON<T>(path: string): Promise<T> {
  let lastErr: unknown;
  for (const base of REST_BASES) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 10000);
    try {
      const r = await fetch(base + path, { signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error(`Binance HTTP ${r.status}`);
      return (await r.json()) as T;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(to);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Network error');
}

type RawKline = [number, string, string, string, string, string, number, ...unknown[]];

export async function fetchKlines(
  symbol: string,
  interval: string,
  { limit = 1000, startTime, endTime }: { limit?: number; startTime?: number; endTime?: number } = {}
): Promise<Candle[]> {
  let q = `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  if (startTime != null) q += `&startTime=${startTime}`;
  if (endTime != null) q += `&endTime=${endTime}`;
  const raw = await fetchJSON<RawKline[]>(q);
  return raw.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], T: +k[6] }));
}

/** Up to `total` most recent candles (paging backwards 1000 at a time). Oldest first. */
export async function fetchBinanceHistory(symbol: string, interval: string, total: number): Promise<Candle[]> {
  let all: Candle[] = [];
  let endTime: number | undefined;
  while (all.length < total) {
    const limit = Math.min(1000, total - all.length);
    const batch = await fetchKlines(symbol, interval, { limit, endTime });
    if (!batch.length) break;
    all = batch.concat(all);
    if (batch.length < limit) break;
    endTime = batch[0].t - 1;
  }
  return all;
}

export async function syncServerTime(): Promise<void> {
  try {
    const t0 = Date.now();
    const j = await fetchJSON<{ serverTime: number }>('/api/v3/time');
    const t1 = Date.now();
    setServerOffset(j.serverTime - (t0 + t1) / 2);
  } catch {
    setServerOffset(0);
  }
}
