import type { FeedStatus } from '../hooks/useLiveCandles';

const STATUS: Record<FeedStatus, { cls: string; text: string }> = {
  connecting: { cls: '', text: 'Connecting…' },
  live: { cls: 'live', text: 'Live · WebSocket' },
  polling: { cls: 'poll', text: 'Live · polling 3s' },
  error: { cls: 'err', text: 'Feed error · retrying' }
};

export function Header({ status, logCount, onLog }: { status: FeedStatus; logCount: number; onLog: () => void }) {
  const s = STATUS[status];
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
      <button className="iconbtn" type="button" onClick={onLog}>
        Log <span className="badge mono">{logCount}</span>
      </button>
    </header>
  );
}

export function Footer() {
  return (
    <footer>
      Real Binance data. Not financial advice.
      <br />
      Quotex OTC prices have no public feed and cannot be analysed.
    </footer>
  );
}
