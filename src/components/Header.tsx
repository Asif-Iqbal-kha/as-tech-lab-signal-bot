import type { FeedStatus } from '../hooks/useLiveCandles';

const STATUS: Record<FeedStatus, { cls: string; text: string }> = {
  connecting: { cls: '', text: 'Connecting…' },
  live: { cls: 'live', text: 'Live · WebSocket' },
  polling: { cls: 'poll', text: 'Live · polling 3s' },
  slow: { cls: 'poll', text: 'Forex · updates every 20s' },
  error: { cls: 'err', text: 'Feed error · retrying' },
  unavailable: { cls: 'err', text: 'Needs Twelve Data key' }
};

export function Header({ status, watching }: { status: FeedStatus | null; watching: number }) {
  const s = status ? STATUS[status] : { cls: '', text: 'Binance · Twelve Data' };
  return (
    <header>
      <div className="brand">
        <div className="logo">AS</div>
        <div>
          <h1>
            AS <span>SIGNAL</span> BOT
          </h1>
          <div className="status">
            <i className={`dot ${s.cls}`} />
            <span>{s.text}</span>
          </div>
        </div>
      </div>
      {watching > 0 && (
        <div className="watching mono" title="Watch mode is running">
          <i className="dot live" /> Watching {watching}
        </div>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer>
      Real market data (Binance, Twelve Data). Not financial advice.
      <br />
      Quotex OTC prices have no public feed and cannot be analysed.
    </footer>
  );
}
