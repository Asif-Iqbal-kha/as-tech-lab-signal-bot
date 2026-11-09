import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SetupResult } from './engine';
import { AnalysingView } from './components/AnalysingView';
import { Footer, Header } from './components/Header';
import { LogView } from './components/LogView';
import { ResultView } from './components/ResultView';
import { ScannerView } from './components/ScannerView';
import { SettingsView } from './components/SettingsView';
import { SetupView } from './components/SetupView';
import { TabBar, type Tab } from './components/TabBar';
import { WatchView } from './components/WatchView';
import { getAsset } from './data/assets';
import { syncServerTime } from './data/binance';
import { useForwardLog } from './hooks/useForwardLog';
import { useLiveCandles } from './hooks/useLiveCandles';
import { useNow } from './hooks/useNow';
import { useScanner } from './hooks/useScanner';
import { useWatch } from './hooks/useWatch';
import type { Expiry, Timeframe } from './lib/constants';
import { runSignal } from './lib/runSignal';
import { loadSettings, saveSettings } from './lib/settings';
import type { Settings, SignalRun, StepId, StepState } from './lib/types';

type SignalView = 'setup' | 'analysing' | 'result';

const INITIAL_STEPS: Record<StepId, StepState> = {
  fetch: { status: 'pending' },
  ind: { status: 'pending' },
  bt: { status: 'pending' },
  risk: { status: 'pending' }
};

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [tab, setTab] = useState<Tab>('signal');
  const [view, setView] = useState<SignalView>('setup');
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<SignalRun | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const asset = getAsset(settings.assetId)!;
  const now = useNow(250);
  const forward = useForwardLog(settings.tdKey);
  const live = useLiveCandles(asset, settings.tf, settings.tdKey, tab === 'signal');
  const scanner = useScanner();

  // Daily stop: losing trades today that had a real (non-zero) suggested stake.
  const dailyStop = useMemo(() => {
    const losses = forward.log.filter(
      (e) => e.status === 'done' && e.result === 'L' && (e.stake ?? 0) > 0 && !e.blocked && sameDay(e.exitAt, Date.now())
    ).length;
    return { losses, max: settings.dailyMaxLosses, stopped: settings.dailyMaxLosses > 0 && losses >= settings.dailyMaxLosses };
  }, [forward.log, settings.dailyMaxLosses]);

  const watch = useWatch({ settings, dailyStopped: dailyStop.stopped, onSignal: forward.add });

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    void syncServerTime().then(forward.checkPending);
  }, [forward.checkPending]);
  // Block body on purpose: newer browsers return a Promise from scrollTo, and an
  // effect must never return anything except a cleanup function.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view, tab]);

  // Expose live app state for testing in the console.
  useEffect(() => {
    window.ASApp = { settings, candles: live.candles, run, log: forward.log, scan: scanner.state, watch: { items: watch.items, alerts: watch.alerts } };
  }, [settings, live.candles, run, forward.log, scanner.state, watch.items, watch.alerts]);

  const updateSettings = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), []);

  const generate = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setSteps(INITIAL_STEPS);
    setError(null);
    setView('analysing');
    try {
      const result = await runSignal(settings, (id, s) => setSteps((prev) => ({ ...prev, [id]: s })), dailyStop.stopped);
      live.mergeCandles(result.closed.slice(-3));
      forward.add(result.entry);
      setRun(result);
      setView('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [settings, dailyStop.stopped, live, forward]);

  const isWatched = (assetId: string, tf: string, expiry: number, strategy: string) =>
    watch.items.some((w) => w.assetId === assetId && w.tf === tf && w.expiry === expiry && w.strategy === strategy);

  const watchCurrent = () => watch.add({ assetId: settings.assetId, tf: settings.tf, expiry: settings.expiry, strategy: settings.strategy });

  const watchScan = (r: SetupResult) =>
    watch.add({
      assetId: r.assetId,
      tf: r.tf as Timeframe,
      expiry: r.expiry as Expiry,
      strategy: r.strategy,
      snap: {
        n: r.all.n,
        wins: r.all.wins,
        losses: r.all.losses,
        winRate: r.all.winRate,
        lo: r.all.ci.lo,
        hi: r.all.ci.hi,
        longestLosingStreak: r.all.longestLosingStreak,
        validated: r.validated,
        label: r.label,
        source: 'scan'
      }
    });

  const openScan = (r: SetupResult) => {
    updateSettings({ assetId: r.assetId, tf: r.tf as Timeframe, expiry: r.expiry as Expiry, strategy: r.strategy });
    setTab('signal');
    setView('setup');
  };

  const watchedKeys = useMemo(() => new Set(watch.items.map((w) => `${w.assetId}|${w.tf}|${w.expiry}|${w.strategy}`)), [watch.items]);
  const settled = forward.log.filter((e) => e.status === 'done').length;
  const liveAlerts = watch.alerts.filter((a) => now < a.expiresAt).length;

  return (
    <div className="app">
      <Header status={tab === 'signal' ? live.status : null} watching={watch.running ? watch.items.length : 0} />
      <TabBar
        tab={tab}
        onTab={(t) => {
          setTab(t);
          if (t === 'signal' && view === 'analysing' && !busy) setView(run ? 'result' : 'setup');
        }}
        badges={{ log: settled, watch: liveAlerts || undefined }}
        live={{ watch: watch.running, scan: scanner.state.status === 'running' }}
      />

      {tab === 'signal' && view === 'setup' && (
        <SetupView
          settings={settings}
          onChange={updateSettings}
          candles={live.candles}
          feedError={live.error}
          now={now}
          onGenerate={generate}
          onWatch={watchCurrent}
          watched={isWatched(settings.assetId, settings.tf, settings.expiry, settings.strategy)}
          busy={busy}
          dailyStop={dailyStop}
        />
      )}
      {tab === 'signal' && view === 'analysing' && (
        <AnalysingView
          what={`${asset.quotex} · ${settings.tf} · ${settings.expiry}c`}
          steps={steps}
          error={error}
          onBack={() => setView('setup')}
        />
      )}
      {tab === 'signal' && view === 'result' && run && (
        <ResultView
          run={run}
          now={now}
          bankroll={settings.bankroll}
          onNew={generate}
          onBack={() => setView('setup')}
          onWatch={() => watch.add({ assetId: run.entry.assetId, tf: run.entry.tf, expiry: run.entry.expiry, strategy: run.entry.strategy })}
          watched={isWatched(run.entry.assetId, run.entry.tf, run.entry.expiry, run.entry.strategy)}
          busy={busy}
        />
      )}
      {tab === 'scan' && (
        <ScannerView
          state={scanner.state}
          settings={settings}
          onRun={(cfg) => void scanner.run(cfg)}
          onCancel={scanner.cancel}
          onWatch={watchScan}
          onOpen={openScan}
          watchedKeys={watchedKeys}
        />
      )}
      {tab === 'watch' && <WatchView watch={watch} now={now} onOpenScanner={() => setTab('scan')} />}
      {tab === 'log' && <LogView log={forward.log} onClear={forward.clear} />}
      {tab === 'settings' && <SettingsView settings={settings} onChange={updateSettings} />}

      <Footer />
    </div>
  );
}
