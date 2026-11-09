import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { backtest, getStrategy, planStake, stats, type Candle, type SignalDir, type StrategyId } from '../engine';
import { getAsset, isAvailable, type Asset } from '../data/assets';
import { serverNow } from '../data/clock';
import { fetchHistory, fetchRecent } from '../data/source';
import { beep, flashTitle, keepScreenOn, notify, notifyState, registerServiceWorker, requestNotifications, unlockAudio, vibrate, type NotifyState } from '../lib/alerts';
import { INTERVAL_MS, WS_BASE, type Expiry, type Timeframe } from '../lib/constants';
import { liveEntryDelay } from '../lib/delay';
import { fmtDur } from '../lib/format';
import { payoutFor } from '../lib/settings';
import { storage } from '../lib/storage';
import type { LogEntry, Settings } from '../lib/types';

const ITEMS_KEY = 'asb.watch.v1';

export interface WatchSnap {
  n: number;
  wins: number;
  losses: number;
  winRate: number;
  lo: number;
  hi: number;
  longestLosingStreak: number;
  /** passed the scanner's out-of-sample test, or (manual add) its own 95% range beats break-even */
  validated: boolean;
  label: string;
  source: 'scan' | 'backtest';
}

export interface WatchItem {
  id: string;
  assetId: string;
  tf: Timeframe;
  expiry: Expiry;
  strategy: StrategyId;
  snap?: WatchSnap;
}

export interface WatchAlert {
  id: string;
  itemId: string;
  assetId: string;
  quotex: string;
  tf: Timeframe;
  expiry: Expiry;
  strategy: StrategyId;
  dir: SignalDir;
  score: number;
  maxScore: number;
  reasons: string[];
  /** when the signal candle closed = the entry moment */
  closeAt: number;
  expiresAt: number;
  firedAt: number;
  stake: number;
  hasEdge: boolean;
  blocked: boolean;
}

export interface SeriesState {
  state: 'loading' | 'ok' | 'closed' | 'error';
  message?: string;
  lastClose?: number;
}

export interface ItemCheck {
  at: number;
  dir: SignalDir;
  score: number;
  maxScore: number;
}

const seriesKey = (assetId: string, tf: string) => `${assetId}|${tf}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

interface Options {
  settings: Settings;
  dailyStopped: boolean;
  onSignal: (e: LogEntry) => void;
}

export function useWatch({ settings, dailyStopped, onSignal }: Options) {
  const [items, setItems] = useState<WatchItem[]>(() => {
    const v = storage.get<WatchItem[]>(ITEMS_KEY, []);
    return Array.isArray(v) ? v.filter((x) => getAsset(x.assetId)) : [];
  });
  const [running, setRunning] = useState(false);
  const [alerts, setAlerts] = useState<WatchAlert[]>([]);
  const [series, setSeries] = useState<Record<string, SeriesState>>({});
  const [checks, setChecks] = useState<Record<string, ItemCheck>>({});
  const [transport, setTransport] = useState<'websocket' | 'polling' | null>(null);
  const [notif, setNotif] = useState<NotifyState>(() => notifyState());
  const [awake, setAwake] = useState(false);

  // refs so socket callbacks always see the latest values
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const stopRef = useRef(dailyStopped);
  stopRef.current = dailyStopped;
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;
  const dataRef = useRef(new Map<string, { asset: Asset; tf: Timeframe; closed: Candle[] }>());
  const busyRef = useRef(new Map<string, number>());

  useEffect(() => {
    storage.set(ITEMS_KEY, items);
  }, [items]);

  const add = useCallback((it: Omit<WatchItem, 'id'>) => {
    setItems((list) => {
      const exists = list.find((x) => x.assetId === it.assetId && x.tf === it.tf && x.expiry === it.expiry && x.strategy === it.strategy);
      if (exists) return list.map((x) => (x === exists && it.snap ? { ...x, snap: it.snap } : x));
      return [...list, { ...it, id: uid() }];
    });
  }, []);
  const remove = useCallback((id: string) => setItems((list) => list.filter((x) => x.id !== id)), []);
  const clearAlerts = useCallback(() => setAlerts([]), []);

  /** Backtest a manually added item (instant entry, same as the alerts) once its history is loaded. */
  const snapFor = useCallback((it: WatchItem, closed: Candle[]): WatchSnap => {
    const payout = payoutFor(settingsRef.current, it.assetId);
    const entryDelay = liveEntryDelay(getAsset(it.assetId)!, it.tf);
    const st = stats(backtest(closed, getStrategy(it.strategy), { expiry: it.expiry, entryDelay }).trades, payout);
    return {
      n: st.n,
      wins: st.wins,
      losses: st.losses,
      winRate: st.winRate,
      lo: st.ci.lo,
      hi: st.ci.hi,
      longestLosingStreak: st.longestLosingStreak,
      validated: st.verdict === 'Edge found',
      label: st.verdict,
      source: 'backtest'
    };
  }, []);

  const fillSnaps = useCallback(() => {
    setItems((list) => {
      let changed = false;
      const next = list.map((it) => {
        if (it.snap) return it;
        const d = dataRef.current.get(seriesKey(it.assetId, it.tf));
        if (!d || d.closed.length < 300) return it;
        changed = true;
        return { ...it, snap: snapFor(it, d.closed) };
      });
      return changed ? next : list;
    });
  }, [snapFor]);

  /** A candle closed on one series: evaluate every watched setup on it (only the newest candle of a batch). */
  const onClosed = useCallback((key: string, candle: Candle, evaluateNow = true) => {
    const d = dataRef.current.get(key);
    if (!d) return;
    const last = d.closed[d.closed.length - 1];
    if (last && candle.t <= last.t) return;
    d.closed.push(candle);
    if (d.closed.length > 6000) d.closed.splice(0, d.closed.length - 6000);
    setSeries((s) => ({ ...s, [key]: { state: 'ok', lastClose: candle.T + 1 } }));
    if (!evaluateNow) return;

    const ms = INTERVAL_MS[d.tf];
    // Binance: enter at this candle's close (now). Forex arrives late: enter at the close of the candle forming now.
    const entryOpen = d.asset.source === 'binance' ? candle.t : Math.max(candle.t + ms, Math.floor(serverNow() / ms) * ms);
    if (entryOpen - candle.t > 3 * ms) return; // far too late to act on
    const prepared = new Map<StrategyId, unknown>();
    const newChecks: Record<string, ItemCheck> = {};
    for (const it of itemsRef.current) {
      if (seriesKey(it.assetId, it.tf) !== key) continue;
      const strategy = getStrategy(it.strategy);
      if (!prepared.has(it.strategy)) prepared.set(it.strategy, strategy.prepare(d.closed));
      const sig = strategy.evaluate(prepared.get(it.strategy), d.closed.length - 1, true);
      if (!sig) continue;
      newChecks[it.id] = { at: candle.T + 1, dir: sig.dir, score: sig.score, maxScore: sig.maxScore };
      if (sig.dir === 'NONE') continue;
      // one trade at a time per setup, exactly like the backtest
      if ((busyRef.current.get(it.id) ?? 0) > candle.T) continue;

      const s = settingsRef.current;
      const payout = payoutFor(s, it.assetId);
      const snap = it.snap;
      const hasEdge = !!snap?.validated;
      const blocked = stopRef.current;
      const plan = planStake({
        bankroll: s.bankroll,
        mode: s.stakeMode,
        fixedPct: s.fixedPct,
        maxPct: s.maxPct,
        payout,
        n: snap?.n ?? 0,
        winRate: snap?.winRate ?? NaN,
        lo: snap?.lo ?? NaN,
        hasEdge
      });
      const stake = blocked ? 0 : plan.stake;
      const closeAt = entryOpen + ms;
      const exitAt = entryOpen + (it.expiry + 1) * ms;
      busyRef.current.set(it.id, exitAt - 1);
      const alert: WatchAlert = {
        id: uid(),
        itemId: it.id,
        assetId: it.assetId,
        quotex: d.asset.quotex,
        tf: it.tf,
        expiry: it.expiry,
        strategy: it.strategy,
        dir: sig.dir,
        score: sig.score,
        maxScore: sig.maxScore,
        reasons: sig.reasons.filter((r) => !r.info && r.vote !== 0).map((r) => r.text),
        closeAt,
        expiresAt: exitAt,
        firedAt: serverNow(),
        stake,
        hasEdge,
        blocked
      };
      setAlerts((a) => [alert, ...a].slice(0, 50));
      const arrow = sig.dir === 'BUY' ? '▲ UP' : '▼ DOWN';
      const expiryTxt = fmtDur(it.expiry * ms);
      if (s.sound) beep(sig.dir);
      vibrate();
      flashTitle(`${arrow} ${d.asset.quotex}`);
      void notify(
        `${arrow} ${d.asset.quotex} · expiry ${expiryTxt}`,
        `${strategy.name} ${it.tf} · ${blocked ? 'Daily stop reached — paper only' : hasEdge ? `stake $${stake.toFixed(2)}` : 'no proven edge — paper trade only'}`,
        it.id
      );
      onSignalRef.current({
        id: alert.id,
        createdAt: alert.firedAt,
        assetId: it.assetId,
        quotex: d.asset.quotex,
        tf: it.tf,
        expiry: it.expiry,
        payout,
        strategy: it.strategy,
        mode: 'watch',
        dir: sig.dir,
        score: sig.score,
        maxScore: sig.maxScore,
        signalCandleOpen: candle.t,
        signalClose: candle.c,
        entryOpen,
        entryAt: closeAt,
        exitAt,
        status: 'pending',
        entryPrice: null,
        exitPrice: null,
        result: null,
        stake,
        blocked,
        bt: { scope: 'ANY', winRate: snap?.winRate ?? NaN, n: snap?.n ?? 0, lo: snap?.lo ?? NaN, hi: snap?.hi ?? NaN, verdict: snap?.label ?? 'Not tested' }
      });
    }
    if (Object.keys(newChecks).length) setChecks((c) => ({ ...c, ...newChecks }));
  }, []);

  // the set of price series we need, e.g. "BTCUSDT|1m,EURUSD|5m"
  const keys = useMemo(() => [...new Set(items.map((i) => seriesKey(i.assetId, i.tf)))].sort().join(','), [items]);

  useEffect(() => {
    if (!running || !keys) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let ws: WebSocket | null = null;
    const s = settingsRef.current;
    const list = keys.split(',').map((k) => {
      const [assetId, tf] = k.split('|');
      return { key: k, asset: getAsset(assetId)!, tf: tf as Timeframe };
    });

    // Binance fallback: poll 1.5 s after each candle close. Forex (Twelve Data publishes
    // candles 30–60 s late): poll every 20 s, which stays within the free 8 requests/min.
    const pollAtCloses = (x: (typeof list)[number]) => {
      const ms = INTERVAL_MS[x.tf];
      const forex = x.asset.source === 'twelvedata';
      const schedule = () => {
        const now = serverNow();
        const wait = forex ? 20000 : (Math.floor(now / ms) + 1) * ms + 1500 - now;
        timers.push(
          setTimeout(async () => {
            if (!alive) return;
            try {
              const k = await fetchRecent(x.asset, x.tf, settingsRef.current.tdKey);
              const t = serverNow();
              const fresh = k.filter((c) => c.T < t);
              fresh.forEach((c, idx) => onClosed(x.key, c, idx === fresh.length - 1));
            } catch (e) {
              setSeries((st) => ({ ...st, [x.key]: { ...st[x.key], state: 'error', message: e instanceof Error ? e.message : String(e) } }));
            }
            if (alive) schedule();
          }, wait)
        );
      };
      schedule();
    };

    (async () => {
      // 1. history for every series
      await Promise.all(
        list.map(async (x) => {
          if (!isAvailable(x.asset, s.tdKey)) {
            setSeries((st) => ({ ...st, [x.key]: { state: 'error', message: 'needs a Twelve Data key (Settings)' } }));
            return;
          }
          setSeries((st) => ({ ...st, [x.key]: { state: 'loading' } }));
          try {
            const h = await fetchHistory(x.asset, x.tf, Math.min(s.depth, 2500), s.tdKey);
            if (!alive) return;
            dataRef.current.set(x.key, { asset: x.asset, tf: x.tf, closed: h.closed });
            const last = h.closed[h.closed.length - 1];
            setSeries((st) => ({
              ...st,
              [x.key]: h.stale ? { state: 'closed', message: 'market closed', lastClose: last?.T } : { state: 'ok', lastClose: last ? last.T + 1 : undefined }
            }));
          } catch (e) {
            setSeries((st) => ({ ...st, [x.key]: { state: 'error', message: e instanceof Error ? e.message : String(e) } }));
          }
        })
      );
      if (!alive) return;
      fillSnaps();

      // 2. live updates
      const loaded = list.filter((x) => dataRef.current.has(x.key));
      const bin = loaded.filter((x) => x.asset.source === 'binance');
      loaded.filter((x) => x.asset.source === 'twelvedata').forEach(pollAtCloses);
      if (!bin.length) {
        setTransport('polling');
        return;
      }
      const streams = bin.map((x) => `${x.asset.symbol.toLowerCase()}@kline_${x.tf}`).join('/');
      let fellBack = false;
      const fallback = () => {
        if (fellBack || !alive) return;
        fellBack = true;
        setTransport('polling');
        bin.forEach(pollAtCloses);
      };
      try {
        ws = new WebSocket(`${WS_BASE}/stream?streams=${streams}`);
      } catch {
        fallback();
        return;
      }
      const openTimer = setTimeout(fallback, 8000);
      timers.push(openTimer);
      ws.onopen = () => {
        clearTimeout(openTimer);
        if (alive) setTransport('websocket');
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          const k = msg?.data?.k;
          if (!k || !k.x) return; // only closed candles
          const x = bin.find((b) => b.asset.symbol === k.s && b.tf === k.i);
          if (x) onClosed(x.key, { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v, T: k.T });
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        clearTimeout(openTimer);
        fallback();
      };
    })();

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      if (ws) {
        ws.onclose = null;
        ws.onmessage = null;
        ws.close();
      }
      setTransport(null);
    };
  }, [running, keys, onClosed, fillSnaps]);

  // compute snapshots for items added while running
  useEffect(() => {
    if (running) fillSnaps();
  }, [running, items.length, fillSnaps]);

  const start = useCallback(async () => {
    unlockAudio(); // must run inside the click
    setRunning(true);
    await registerServiceWorker();
    setNotif(await requestNotifications());
    setAwake(await keepScreenOn(true));
  }, []);

  const stop = useCallback(() => {
    setRunning(false);
    void keepScreenOn(false);
    setAwake(false);
  }, []);

  const testAlert = useCallback(() => {
    unlockAudio();
    beep('BUY');
    vibrate();
    void notify('▲ UP · Test alert', 'This is what a Watch signal looks like.', 'test');
  }, []);

  return { items, add, remove, running, start, stop, alerts, clearAlerts, series, checks, transport, notif, awake, testAlert };
}
