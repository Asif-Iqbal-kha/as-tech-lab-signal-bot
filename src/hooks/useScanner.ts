import { useCallback, useRef, useState } from 'react';
import { finalizeScan, scanSeries, type ScanSummary, type SetupResult, type StrategyId } from '../engine';
import { getAsset } from '../data/assets';
import { fetchHistory } from '../data/source';
import type { Timeframe } from '../lib/constants';
import { liveEntryDelay } from '../lib/delay';

export interface ScanConfig {
  assetIds: string[];
  tfs: Timeframe[];
  expiries: number[];
  strategies: StrategyId[];
  depth: number;
  tdKey: string;
  payoutFor: (assetId: string) => number;
}

export interface ScanProgress {
  done: number;
  total: number;
  current: string;
  waiting: number;
}

export interface ScanState {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: ScanProgress;
  summary: ScanSummary | null;
  /** series that could not be loaded (market closed, missing key, network) */
  skipped: { what: string; why: string }[];
  candlesPerSeries: number;
  finishedAt: number | null;
  error: string | null;
}

const IDLE: ScanState = {
  status: 'idle',
  progress: { done: 0, total: 0, current: '', waiting: 0 },
  summary: null,
  skipped: [],
  candlesPerSeries: 0,
  finishedAt: null,
  error: null
};

const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0));

/** Fetches every asset × timeframe (real progress), runs stage 1 per series, then the stage-2 confirmation. */
export function useScanner() {
  const [state, setState] = useState<ScanState>(IDLE);
  const cancelRef = useRef(false);

  const run = useCallback(async (cfg: ScanConfig) => {
    cancelRef.current = false;
    const jobs = cfg.assetIds.flatMap((id) => cfg.tfs.map((tf) => ({ id, tf })));
    const results: SetupResult[] = [];
    const skipped: ScanState['skipped'] = [];
    let done = 0;
    let candleSum = 0;
    let loaded = 0;
    setState({ ...IDLE, status: 'running', progress: { done: 0, total: jobs.length, current: 'Starting', waiting: 0 } });

    const progress = (current: string, waiting = 0) =>
      setState((s) => ({ ...s, progress: { done, total: jobs.length, current, waiting } }));

    // Binance jobs run 4 at a time; Twelve Data jobs go one by one through its rate limiter.
    const binance = jobs.filter((j) => getAsset(j.id)?.source === 'binance');
    const td = jobs.filter((j) => getAsset(j.id)?.source === 'twelvedata');

    const work = async (job: { id: string; tf: Timeframe }) => {
      if (cancelRef.current) return;
      const asset = getAsset(job.id)!;
      const what = `${asset.quotex} ${job.tf}`;
      progress(`Fetching ${what}`);
      try {
        const h = await fetchHistory(asset, job.tf, cfg.depth, cfg.tdKey, (ms) => progress(`Waiting for Twelve Data limit · ${what}`, ms));
        if (h.stale) throw new Error('market closed (no new candles)');
        if (h.closed.length < 300) throw new Error(`only ${h.closed.length} candles`);
        if (cancelRef.current) return;
        progress(`Testing ${what}`);
        await yieldUI();
        results.push(
          ...scanSeries(
            { assetId: asset.id, tf: job.tf, candles: h.closed, entryDelay: liveEntryDelay(asset, job.tf) },
            { expiries: cfg.expiries, strategies: cfg.strategies, payoutFor: cfg.payoutFor }
          )
        );
        candleSum += h.closed.length;
        loaded++;
      } catch (e) {
        skipped.push({ what, why: e instanceof Error ? e.message : String(e) });
      } finally {
        done++;
        progress('');
      }
    };

    const queue = [...binance];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length && !cancelRef.current) await work(queue.shift()!);
    });
    await Promise.all(workers);
    for (const job of td) {
      if (cancelRef.current) break;
      await work(job);
    }

    if (cancelRef.current) {
      setState((s) => ({ ...s, status: 'idle', progress: { ...s.progress, current: 'Cancelled' } }));
      return;
    }
    if (!results.length) {
      setState((s) => ({ ...s, status: 'error', skipped, error: 'No data could be loaded for the selected markets.' }));
      return;
    }
    const summary = finalizeScan(results);
    setState({
      status: 'done',
      progress: { done, total: jobs.length, current: '', waiting: 0 },
      summary,
      skipped,
      candlesPerSeries: Math.round(candleSum / Math.max(1, loaded)),
      finishedAt: Date.now(),
      error: null
    });
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { state, run, cancel };
}
