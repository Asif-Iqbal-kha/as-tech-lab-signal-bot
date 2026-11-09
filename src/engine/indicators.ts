import type { Candle } from './types';

export const ok = (x: number): boolean => typeof x === 'number' && Number.isFinite(x);
export const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
const nans = (n: number): number[] => new Array(n).fill(NaN);

/** EMA seeded with the SMA of the first `period` valid values. Leading NaNs are skipped. */
export function ema(values: number[], period: number): number[] {
  const out = nans(values.length);
  let s = 0;
  while (s < values.length && !ok(values[s])) s++;
  if (values.length - s < period) return out;
  let sum = 0;
  for (let i = s; i < s + period; i++) sum += values[i];
  let prev = sum / period;
  out[s + period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = s + period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Simple moving average; NaN unless the whole window is finite. */
export function sma(values: number[], period: number): number[] {
  const out = nans(values.length);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    let good = true;
    for (let j = i - period + 1; j <= i; j++) {
      if (!ok(values[j])) {
        good = false;
        break;
      }
      sum += values[j];
    }
    if (good) out[i] = sum / period;
  }
  return out;
}

/** Population standard deviation over a rolling window. */
export function rollingStd(values: number[], period: number): number[] {
  const mean = sma(values, period);
  const out = nans(values.length);
  for (let i = period - 1; i < values.length; i++) {
    if (!ok(mean[i])) continue;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - mean[i]) ** 2;
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const sd = rollingStd(closes, period);
  return {
    mid,
    upper: mid.map((m, i) => m + mult * sd[i]),
    lower: mid.map((m, i) => m - mult * sd[i])
  };
}

/** Rolling max over indices i-period+1..i. */
export function rollingMax(values: number[], period: number): number[] {
  const out = nans(values.length);
  for (let i = period - 1; i < values.length; i++) {
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) if (values[j] > m) m = values[j];
    out[i] = m;
  }
  return out;
}

export function rollingMin(values: number[], period: number): number[] {
  const out = nans(values.length);
  for (let i = period - 1; i < values.length; i++) {
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) if (values[j] < m) m = values[j];
    out[i] = m;
  }
  return out;
}

/** RSI with Wilder smoothing. */
export function rsi(closes: number[], period = 14): number[] {
  const out = nans(closes.length);
  if (closes.length <= period) return out;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  let ag = g / period;
  let al = l / period;
  const val = () => (al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al));
  out[period] = val();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = val();
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, sig = 9) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = closes.map((_, i) => (ok(f[i]) && ok(s[i]) ? f[i] - s[i] : NaN));
  const signal = ema(line, sig);
  const hist = line.map((v, i) => (ok(v) && ok(signal[i]) ? v - signal[i] : NaN));
  return { line, signal, hist };
}

/** Slow stochastic: %K smoothed by `smoothK`, %D = SMA of %K. */
export function stochastic(candles: Candle[], kPeriod = 14, smoothK = 3, dPeriod = 3) {
  const raw = nans(candles.length);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].h > hh) hh = candles[j].h;
      if (candles[j].l < ll) ll = candles[j].l;
    }
    raw[i] = hh === ll ? 50 : (100 * (candles[i].c - ll)) / (hh - ll);
  }
  const k = sma(raw, smoothK);
  const d = sma(k, dPeriod);
  return { k, d };
}
