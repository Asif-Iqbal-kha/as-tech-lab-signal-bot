import { useCallback, useEffect, useRef, useState } from 'react';
import { AnalysingView } from './components/AnalysingView';
import { Footer, Header } from './components/Header';
import { LogView } from './components/LogView';
import { ResultView } from './components/ResultView';
import { SetupView } from './components/SetupView';
import { syncServerTime } from './data/binance';
import { useForwardLog } from './hooks/useForwardLog';
import { useLiveCandles } from './hooks/useLiveCandles';
import { useNow } from './hooks/useNow';
import { EXPIRIES, MARKETS, TIMEFRAMES } from './lib/constants';
import { runSignal } from './lib/runSignal';
import { storage } from './lib/storage';
import type { Settings, SignalRun, StepId, StepState } from './lib/types';

type View = 'setup' | 'analysing' | 'result' | 'log';

const SETTINGS_KEY = 'asb.settings.v1';
const INITIAL_STEPS: Record<StepId, StepState> = {
  fetch: { status: 'pending' },
  ind: { status: 'pending' },
  bt: { status: 'pending' }
};

function loadSettings(): Settings {
  const s = storage.get<Partial<Settings>>(SETTINGS_KEY, {});
  return {
    symbol: MARKETS.includes(s.symbol as never) ? (s.symbol as Settings['symbol']) : 'BTCUSDT',
    tf: TIMEFRAMES.includes(s.tf as never) ? (s.tf as Settings['tf']) : '1m',
    expiry: EXPIRIES.includes(s.expiry as never) ? (s.expiry as Settings['expiry']) : 1,
    payout: typeof s.payout === 'number' && s.payout > 0 ? s.payout : 0.85
  };
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [view, setView] = useState<View>('setup');
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<SignalRun | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const { candles, status, mergeCandle } = useLiveCandles(settings.symbol, settings.tf);
  const forward = useForwardLog();
  const now = useNow(250);

  useEffect(() => storage.set(SETTINGS_KEY, settings), [settings]);
  useEffect(() => {
    void syncServerTime().then(forward.checkPending);
  }, [forward.checkPending]);
  useEffect(() => window.scrollTo({ top: 0 }), [view]);

  // Expose live app state for testing in the console.
  useEffect(() => {
    window.ASApp = { settings, candles, run, log: forward.log, checkPending: forward.checkPending };
  }, [settings, candles, run, forward.log, forward.checkPending]);

  const updateSettings = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), []);

  const generate = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setSteps(INITIAL_STEPS);
    setError(null);
    setView('analysing');
    const params = settings;
    try {
      const result = await runSignal(params, (id, s) => setSteps((prev) => ({ ...prev, [id]: s })));
      mergeCandle(result.forming);
      forward.add(result.entry);
      setRun(result);
      setView('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [settings, mergeCandle, forward]);

  const completed = forward.log.filter((e) => e.status === 'done').length;

  return (
    <div className="app">
      <Header status={status} logCount={completed} onLog={() => setView('log')} />

      {view === 'setup' && (
        <SetupView settings={settings} onChange={updateSettings} candles={candles} now={now} onGenerate={generate} busy={busy} />
      )}
      {view === 'analysing' && (
        <AnalysingView
          what={`${settings.symbol} · ${settings.tf} · ${settings.expiry}c`}
          steps={steps}
          error={error}
          onBack={() => setView('setup')}
        />
      )}
      {view === 'result' && run && (
        <ResultView run={run} now={now} onNew={generate} onBack={() => setView('setup')} busy={busy} />
      )}
      {view === 'log' && (
        <LogView log={forward.log} payout={settings.payout} onClear={forward.clear} onBack={() => setView(run ? 'result' : 'setup')} />
      )}

      <Footer />
    </div>
  );
}
