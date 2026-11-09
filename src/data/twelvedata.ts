import { resample, type Candle } from '../engine';
import { INTERVAL_MS, type Timeframe } from '../lib/constants';

const BASE = 'https://api.twelvedata.com';
/** Twelve Data has no 3min interval: 3m candles are built from 1min. */
const NATIVE: Partial<Record<Timeframe, string>> = { '1m': '1min', '5m': '5min', '15m': '15min' };
const PER_MINUTE = 8; // free plan: 8 requests/min, 800/day

export class TwelveDataError extends Error {
  constructor(
    public code: number,
    message: string
  ) {
    super(message);
  }
}

/* ---------- client-side rate limiter (shared by every feature) ---------- */

const stamps: number[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acquire(onWait?: (ms: number) => void): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (stamps.length && now - stamps[0] > 60000) stamps.shift();
    if (stamps.length < PER_MINUTE) {
      stamps.push(now);
      return;
    }
    const wait = stamps[0] + 60000 - now + 100;
    onWait?.(wait);
    await sleep(wait);
  }
}

const utc = (t: number) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');

function friendly(code: number, message: string, symbol: string, key: string): string {
  if (code === 401 || code === 403) {
    return key === 'demo'
      ? `${symbol} needs your own free Twelve Data API key (Settings tab). The built-in demo key only covers EUR/USD and USD/JPY.`
      : `Twelve Data rejected your API key for ${symbol}: ${message}`;
  }
  if (code === 429) return 'Twelve Data limit reached (free plan: 8 requests per minute, 800 per day). Wait a minute and try again.';
  return `Twelve Data error ${code}: ${message}`;
}

async function series(
  symbol: string,
  interval: string,
  ms: number,
  params: Record<string, string | number>,
  key: string,
  onWait?: (ms: number) => void
): Promise<Candle[]> {
  const q = new URLSearchParams({ symbol, interval, timezone: 'UTC', order: 'ASC', apikey: key });
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  await acquire(onWait);
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 20000);
  let json: { status?: string; code?: number; message?: string; values?: { datetime: string; open: string; high: string; low: string; close: string }[] };
  try {
    const r = await fetch(`${BASE}/time_series?${q}`, { signal: ctl.signal, cache: 'no-store' });
    json = await r.json().catch(() => ({ status: 'error', code: r.status, message: r.statusText }));
    if (!r.ok && json.status !== 'error') json = { status: 'error', code: r.status, message: r.statusText };
  } finally {
    clearTimeout(to);
  }
  if (json.status === 'error') {
    const code = json.code ?? 500;
    // "No data is available" for an empty range is not an error for us
    if (code === 400 && /no data/i.test(json.message ?? '')) return [];
    throw new TwelveDataError(code, friendly(code, json.message ?? 'unknown error', symbol, key));
  }
  return (json.values ?? [])
    .map((v) => {
      const t = Date.parse(v.datetime.replace(' ', 'T') + 'Z');
      return { t, o: +v.open, h: +v.high, l: +v.low, c: +v.close, T: t + ms - 1 };
    })
    .sort((a, b) => a.t - b.t);
}

/** Most recent `total` candles for a timeframe (max 5000 per request; 3m is resampled from 1m). */
export async function tdHistory(symbol: string, tf: Timeframe, total: number, key: string, onWait?: (ms: number) => void): Promise<Candle[]> {
  const native = NATIVE[tf];
  if (native) return series(symbol, native, INTERVAL_MS[tf], { outputsize: Math.min(5000, total) }, key, onWait);
  const one = await series(symbol, '1min', 60000, { outputsize: Math.min(5000, total * 3) }, key, onWait);
  const out = resample(one, INTERVAL_MS[tf]);
  // the oldest group may start mid-candle (missing its first minutes): drop it
  if (out.length && one.length && one[0].t !== out[0].t) out.shift();
  return out;
}

/** Candles for [start, start + count × tf). */
export async function tdRange(symbol: string, tf: Timeframe, start: number, count: number, key: string): Promise<Candle[]> {
  const ms = INTERVAL_MS[tf];
  const end = start + count * ms - 1;
  const native = NATIVE[tf];
  if (native) return series(symbol, native, ms, { start_date: utc(start), end_date: utc(end - ms + 1) }, key);
  const one = await series(symbol, '1min', 60000, { start_date: utc(start), end_date: utc(end - 60000 + 1) }, key);
  return resample(one, ms);
}
