export type Tab = 'signal' | 'scan' | 'watch' | 'log' | 'settings';

const ICONS: Record<Tab, JSX.Element> = {
  signal: <path d="M3 17l5-6 4 3 6-8M14 6h4v4" />,
  scan: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5M8 10.5h5M10.5 8v5" />
    </>
  ),
  watch: (
    <>
      <path d="M6 9a6 6 0 1112 0c0 5 2 7 2 7H4s2-2 2-7" />
      <path d="M10 20a2 2 0 004 0" />
    </>
  ),
  log: <path d="M5 5h14M5 10h14M5 15h9M5 20h6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  )
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'signal', label: 'Signal' },
  { id: 'scan', label: 'Scanner' },
  { id: 'watch', label: 'Watch' },
  { id: 'log', label: 'Log' },
  { id: 'settings', label: 'Settings' }
];

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  badges: Partial<Record<Tab, string | number>>;
  live: Partial<Record<Tab, boolean>>;
}

export function TabBar({ tab, onTab, badges, live }: Props) {
  return (
    <nav className="tabs" aria-label="Sections">
      {TABS.map((t) => (
        <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => onTab(t.id)}>
          <span className="tico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ICONS[t.id]}
            </svg>
            {live[t.id] && <i className="tlive" />}
          </span>
          <span className="tlabel">{t.label}</span>
          {badges[t.id] != null && badges[t.id] !== 0 && <span className="tbadge mono">{badges[t.id]}</span>}
        </button>
      ))}
    </nav>
  );
}
