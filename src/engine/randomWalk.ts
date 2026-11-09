import type { Candle } from './types';

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

/**
 * Test candles. phi = 0 is a pure random walk (no strategy can beat 50%).
 * phi > 0 adds momentum (returns are autocorrelated), a planted edge for testing the scanner.
 */
export function randomWalkCandles(n = 20000, seed = 42, start = 100, vol = 0.002, phi = 0): Candle[] {
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
  let r = 0;
  for (let i = 0; i < n; i++) {
    const o = p;
    r = phi * r + vol * gauss();
    const c = o * Math.exp(r);
    const h = Math.max(o, c) * (1 + Math.abs(gauss()) * vol * 0.3);
    const l = Math.min(o, c) * (1 - Math.abs(gauss()) * vol * 0.3);
    out.push({ t: i * 60000, o, h, l, c, T: i * 60000 + 59999 });
    p = c;
  }
  return out;
}
