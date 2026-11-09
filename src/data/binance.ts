import type { Candle } from '../engine/engine';
import { REST_BASES } from '../lib/constants';

let serverOffset = 0;

/** Current time on Binance's clock (corrects a wrong phone clock). */
export const serverNow = (): number => Date.now() + serverOffset;

async function fetchJSON<T>(path: string): Promise<T> {
  let lastErr: unknown;
  for (const base of REST_BASES) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(base + path, { signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error(`${base} HTTP ${r.status}`);
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
  { limit = 1000, startTime }: { limit?: number; startTime?: number } = {}
): Promise<Candle[]> {
  let q = `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  if (startTime != null) q += `&startTime=${startTime}`;
  const raw = await fetchJSON<RawKline[]>(q);
  return raw.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], T: +k[6] }));
}

export async function syncServerTime(): Promise<void> {
  try {
    const t0 = Date.now();
    const j = await fetchJSON<{ serverTime: number }>('/api/v3/time');
    const t1 = Date.now();
    serverOffset = j.serverTime - (t0 + t1) / 2;
  } catch {
    serverOffset = 0;
  }
}
