/**
 * Signal engine: pure functions, no DOM, no network.
 * Everything here works on CLOSED candles only and never reads data after index i.
 */

export interface Candle {
  /** open time (ms) */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
  /** close time (ms) */
  T: number;
}

export type Direction = 'BUY' | 'SELL';
export type SignalDir = Direction | 'NONE';
export type Scope = Direction | 'ANY';
export type TradeResult = 'W' | 'L' | 'T';

export interface Indicators {
  close: number[];
  ema9: number[];
  ema21: number[];
  ema50: number[];
  rsi: number[];
  macd: number[];
  macdSignal: number[];
  hist: number[];
}

export interface Signal {
  i: number;
  dir: SignalDir;
  score: number;
  /** [EMA9 vs EMA21, MACD hist sign, hist slope, close vs EMA50], each −1/0/+1 */
  components: [number, number, number, number];
  /** direction the score qualified for but the RSI filter blocked */
  filtered: Direction | null;
  values: { ema9: number; ema21: number; ema50: number; hist: number; histPrev: number; rsi: number; close: number };
}

export interface Trade {
  i: number;
  t: number;
  dir: Direction;
  score: number;
  entry: number;
  exit: number;
  result: TradeResult;
}

export interface BacktestResult {
  trades: Trade[];
  candles: number;
  expiry: number;
  direction: Scope;
}

export interface Stats {
  wins: number;
  losses: number;
  ties: number;
  /** decisive trades (wins + losses) */
  n: number;
  total: number;
  winRate: number;
  ci: { lo: number; hi: number };
  breakEven: number;
  ev: number;
  longestLosingStreak: number;
  verdict: Verdict;
  payout: number;
}

export type Verdict = 'Edge found' | 'No proven edge' | 'Losing setup';

export const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
const ok = (x: number): boolean => typeof x === 'number' && Number.isFinite(x);

/** EMA seeded with the SMA of the first `period` valid values. Leading NaNs are skipped. */
export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
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

/** RSI with Wilder smoothing. */
export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
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

export function computeIndicators(candles: Candle[]): Indicators {
  const close = candles.map((c) => c.c);
  const m = macd(close);
  return {
    close,
    ema9: ema(close, 9),
    ema21: ema(close, 21),
    ema50: ema(close, 50),
    rsi: rsi(close, 14),
    macd: m.line,
    macdSignal: m.signal,
    hist: m.hist
  };
}

/** Confluence signal at index i. Uses only data at indices <= i. */
export function evaluate(ind: Indicators, i: number): Signal | null {
  if (i < 1) return null;
  const e9 = ind.ema9[i];
  const e21 = ind.ema21[i];
  const e50 = ind.ema50[i];
  const h = ind.hist[i];
  const hp = ind.hist[i - 1];
  const r = ind.rsi[i];
  const c = ind.close[i];
  if (![e9, e21, e50, h, hp, r, c].every(ok)) return null;
  const components: Signal['components'] = [sign(e9 - e21), sign(h), sign(h - hp), sign(c - e50)];
  const score = components[0] + components[1] + components[2] + components[3];
  let dir: SignalDir = score >= 3 ? 'BUY' : score <= -3 ? 'SELL' : 'NONE';
  let filtered: Direction | null = null;
  if (dir === 'BUY' && r > 70) {
    filtered = 'BUY';
    dir = 'NONE';
  }
  if (dir === 'SELL' && r < 30) {
    filtered = 'SELL';
    dir = 'NONE';
  }
  return {
    i,
    dir,
    score,
    components,
    filtered,
    values: { ema9: e9, ema21: e21, ema50: e50, hist: h, histPrev: hp, rsi: r, close: c }
  };
}

/** Entry = close[i], exit = close[i + expiry]. One trade at a time. */
export function backtest(
  candles: Candle[],
  opts: { expiry?: number; direction?: Scope; ind?: Indicators } = {}
): BacktestResult {
  const expiry = opts.expiry ?? 1;
  const direction = opts.direction ?? 'ANY';
  const ind = opts.ind ?? computeIndicators(candles);
  const close = ind.close;
  const n = close.length;
  const trades: Trade[] = [];
  let i = 1;
  while (i + expiry < n) {
    const s = evaluate(ind, i);
    if (s && s.dir !== 'NONE' && (direction === 'ANY' || s.dir === direction)) {
      const entry = close[i];
      const exit = close[i + expiry];
      const d = exit - entry;
      const result: TradeResult = d === 0 ? 'T' : (s.dir === 'BUY') === d > 0 ? 'W' : 'L';
      trades.push({ i, t: candles[i]?.t ?? i, dir: s.dir, score: s.score, entry, exit, result });
      i += expiry; // next entry only at the exit candle's close
    } else i++;
  }
  return { trades, candles: n, expiry, direction };
}

/** Wilson score interval (default 95%). */
export function wilson(k: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (!n) return { lo: NaN, hi: NaN };
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

export const breakEven = (payout: number): number => 1 / (1 + payout);

export function verdictFor(n: number, ci: { lo: number; hi: number }, be: number): Verdict {
  if (n && ci.lo > be) return 'Edge found';
  if (n && ci.hi < be) return 'Losing setup';
  return 'No proven edge';
}

export function stats(trades: Trade[] | { result: TradeResult }[], payout = 0.85): Stats {
  let w = 0;
  let l = 0;
  let t = 0;
  let run = 0;
  let maxRun = 0;
  for (const tr of trades) {
    if (tr.result === 'W') {
      w++;
      run = 0;
    } else if (tr.result === 'L') {
      l++;
      run++;
      if (run > maxRun) maxRun = run;
    } else t++; // tie: stake returned, streak unchanged
  }
  const n = w + l;
  const winRate = n ? w / n : NaN;
  const ci = wilson(w, n);
  const be = breakEven(payout);
  const ev = n ? winRate * payout - (1 - winRate) : NaN;
  return {
    wins: w,
    losses: l,
    ties: t,
    n,
    total: trades.length,
    winRate,
    ci,
    breakEven: be,
    ev,
    longestLosingStreak: maxRun,
    verdict: verdictFor(n, ci, be),
    payout
  };
}

/* ---------- random-walk test data (look-ahead check) ---------- */

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomWalkCandles(n = 20000, seed = 42, start = 100, vol = 0.002): Candle[] {
  const rnd = mulberry32(seed);
  const gauss = () => {
    let u = 0;
    let v = 0;
    while (!u) u = rnd();
    while (!v) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const out: Candle[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = o * Math.exp(vol * gauss());
    const h = Math.max(o, c) * (1 + Math.abs(gauss()) * vol * 0.3);
    const l = Math.min(o, c) * (1 - Math.abs(gauss()) * vol * 0.3);
    out.push({ t: i * 60000, o, h, l, c, T: i * 60000 + 59999 });
    p = c;
  }
  return out;
}

export type RandomWalkReport = Record<number, Record<Scope, { winRate: number; n: number; ciLo: number; ciHi: number }>>;

export function runRandomWalkTest(
  opts: { n?: number; seeds?: number[]; expiries?: number[]; payout?: number } = {}
): RandomWalkReport {
  const n = opts.n ?? 20000;
  const seeds = opts.seeds ?? [1, 2, 3];
  const expiries = opts.expiries ?? [1, 2, 3, 5];
  const payout = opts.payout ?? 0.85;
  const scopes: Scope[] = ['BUY', 'SELL', 'ANY'];
  const res: RandomWalkReport = {};
  for (const e of expiries) {
    const all: Record<Scope, Trade[]> = { BUY: [], SELL: [], ANY: [] };
    for (const s of seeds) {
      const c = randomWalkCandles(n, s);
      const ind = computeIndicators(c);
      for (const d of scopes) all[d].push(...backtest(c, { expiry: e, direction: d, ind }).trades);
    }
    res[e] = {} as RandomWalkReport[number];
    for (const d of scopes) {
      const st = stats(all[d], payout);
      res[e][d] = { winRate: st.winRate, n: st.n, ciLo: st.ci.lo, ciHi: st.ci.hi };
    }
  }
  return res;
}

export const ASEngine = {
  sign,
  ema,
  rsi,
  macd,
  computeIndicators,
  evaluate,
  backtest,
  wilson,
  breakEven,
  verdictFor,
  stats,
  mulberry32,
  randomWalkCandles,
  runRandomWalkTest
};
