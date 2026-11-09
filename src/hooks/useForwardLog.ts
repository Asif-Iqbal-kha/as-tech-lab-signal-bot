import { useCallback, useEffect, useRef, useState } from 'react';
import type { TradeResult } from '../engine';
import { getAsset, isAvailable } from '../data/assets';
import { serverNow } from '../data/clock';
import { fetchRange } from '../data/source';
import { INTERVAL_MS, LOG_CHECK_MS } from '../lib/constants';
import { storage } from '../lib/storage';
import type { LogEntry } from '../lib/types';

const LOG_KEY = 'asb.log.v1';
const MAX_ENTRIES = 3000;

/** Fill in fields that entries saved by older versions don't have. */
function normalize(e: Partial<LogEntry> & { symbol?: string }): LogEntry {
  const assetId = e.assetId ?? e.symbol ?? 'BTCUSDT';
  return {
    ...(e as LogEntry),
    assetId,
    quotex: e.quotex ?? getAsset(assetId)?.quotex ?? assetId,
    strategy: e.strategy ?? 'trend',
    mode: e.mode ?? 'manual',
    maxScore: e.maxScore ?? 4,
    stake: e.stake ?? null
  };
}

/**
 * Forward-test log in localStorage. Pending trades are settled automatically once
 * the exit candle has closed: entry = close of the entry candle, exit = close
 * `expiry` candles later, both fetched from the same data source.
 */
export function useForwardLog(tdKey: string) {
  const [log, setLog] = useState<LogEntry[]>(() => {
    const v = storage.get<LogEntry[]>(LOG_KEY, []);
    return Array.isArray(v) ? v.map(normalize) : [];
  });
  const logRef = useRef(log);
  logRef.current = log;
  const keyRef = useRef(tdKey);
  keyRef.current = tdKey;

  useEffect(() => {
    storage.set(LOG_KEY, log);
  }, [log]);

  const add = useCallback((e: LogEntry) => setLog((l) => [e, ...l].slice(0, MAX_ENTRIES)), []);
  const clear = useCallback(() => setLog([]), []);

  const checking = useRef(false);
  const checkPending = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    const updates = new Map<string, Partial<LogEntry>>();
    try {
      for (const e of logRef.current) {
        if (e.status !== 'pending') continue;
        const asset = getAsset(e.assetId);
        if (!asset || !isAvailable(asset, keyRef.current)) continue;
        const ms = INTERVAL_MS[e.tf];
        if (serverNow() < e.entryOpen + (e.expiry + 1) * ms + 3000) continue;
        try {
          const k = await fetchRange(asset, e.tf, e.entryOpen, e.expiry + 1, keyRef.current);
          const first = k.find((c) => c.t === e.entryOpen);
          const exitC = k.find((c) => c.t === e.entryOpen + e.expiry * ms);
          if (!first || !exitC) continue;
          const d = exitC.c - first.c;
          const result: TradeResult = d === 0 ? 'T' : (e.dir === 'BUY') === d > 0 ? 'W' : 'L';
          updates.set(e.id, { entryPrice: first.c, exitPrice: exitC.c, result, status: 'done' });
        } catch {
          /* retry next cycle */
        }
      }
    } finally {
      checking.current = false;
      if (updates.size) setLog((l) => l.map((e) => (updates.has(e.id) ? { ...e, ...updates.get(e.id) } : e)));
    }
  }, []);

  useEffect(() => {
    void checkPending();
    const id = setInterval(checkPending, LOG_CHECK_MS);
    return () => clearInterval(id);
  }, [checkPending]);

  return { log, add, clear, checkPending };
}
