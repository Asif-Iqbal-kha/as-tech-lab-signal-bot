import { ASSETS, GROUPS, getAsset, isAvailable } from '../data/assets';

export function AssetSelect({ value, onChange, tdKey }: { value: string; onChange: (id: string) => void; tdKey: string }) {
  const asset = getAsset(value);
  const available = asset ? isAvailable(asset, tdKey) : false;
  return (
    <>
      <div className="selectwrap">
        <select className="select mono" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Asset">
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {ASSETS.filter((a) => a.group === g).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.quotex} — {a.name}
                  {isAvailable(a, tdKey) ? '' : ' (needs key)'}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {asset && (
        <div className={`srcnote ${available ? '' : 'warn'}`}>
          {available ? (
            <>
              On Quotex pick <b>{asset.quotex}</b> without “OTC”. Data:{' '}
              {asset.source === 'binance' ? 'Binance, real-time' : tdKey.trim() ? 'Twelve Data (your key)' : 'Twelve Data (public demo key)'}.
              {asset.note ? ` ${asset.note}` : ''}
            </>
          ) : (
            <>
              {asset.quotex} needs a free Twelve Data API key. Add it in <b>Settings</b>. Without a key only EUR/USD and USD/JPY work.
            </>
          )}
        </div>
      )}
    </>
  );
}
