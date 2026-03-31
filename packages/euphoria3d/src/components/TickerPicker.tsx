import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PYTH_FEEDS } from '@sapience/sdk/constants';

type PythProFeedRow = {
  id: number;
  symbol: string;
  description?: string;
  expo: number;
};

export type SelectedFeed = {
  id: number;
  symbol: string;
  ticker: string;
  expo: number;
};

let cachedLazerFeeds: PythProFeedRow[] | null = null;
let inflightLazerFeeds: Promise<PythProFeedRow[]> | null = null;

async function fetchLazerFeeds(signal: AbortSignal): Promise<PythProFeedRow[]> {
  const res = await fetch(
    'https://history.pyth-lazer.dourolabs.app/history/v1/symbols',
    { signal },
  );
  if (!res.ok) throw new Error(`Pyth feed list failed (${res.status})`);
  const data = (await res.json()) as Array<{
    asset_type: string;
    description: string;
    name: string;
    symbol: string;
    pyth_lazer_id: number;
    exponent: number;
  }>;
  return data
    .slice()
    .sort((a, b) => a.pyth_lazer_id - b.pyth_lazer_id)
    .map((f) => ({
      id: f.pyth_lazer_id,
      symbol: f.symbol,
      description: f.description,
      expo: f.exponent,
    }));
}

async function loadFeedsCached(signal: AbortSignal): Promise<PythProFeedRow[]> {
  if (cachedLazerFeeds && cachedLazerFeeds.length > 0) return cachedLazerFeeds;
  if (inflightLazerFeeds) return await inflightLazerFeeds;
  inflightLazerFeeds = (async () => {
    try {
      const rows = await fetchLazerFeeds(signal);
      cachedLazerFeeds = rows;
      return rows;
    } finally {
      inflightLazerFeeds = null;
    }
  })();
  return await inflightLazerFeeds;
}

const FEATURED: PythProFeedRow[] = PYTH_FEEDS.map((f) => ({
  id: f.lazerId,
  symbol: f.symbol,
  description: f.ticker,
  expo: -8,
}));

interface TickerPickerProps {
  label: string;
  value: SelectedFeed | null;
  onChange: (feed: SelectedFeed) => void;
}

export function TickerPicker({ label, value, onChange }: TickerPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [feeds, setFeeds] = useState<PythProFeedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ensureLoaded = useCallback(() => {
    if (loading || feeds.length > 0) return () => {};
    if (cachedLazerFeeds && cachedLazerFeeds.length > 0) {
      setFeeds(cachedLazerFeeds);
      return () => {};
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const rows = await loadFeedsCached(ac.signal);
        if (!ac.signal.aborted) setFeeds(rows);
      } catch (e) {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : 'Failed to load feeds');
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [loading, feeds.length]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = useMemo(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    const list = feeds;

    if (!q) {
      if (list.length > 0) {
        const byId = new Map(list.map((f) => [f.id, f]));
        const out = FEATURED.map((f) => byId.get(f.id)).filter((f): f is PythProFeedRow => !!f);
        if (out.length > 0) return out;
      }
      return FEATURED;
    }

    const terms = q.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
    if (terms.length === 0) return list.slice(0, 25);

    const isNumeric = (t: string) => /^\d+$/.test(t);
    const exactIdMatches: PythProFeedRow[] = [];
    const otherMatches = new Map<number, PythProFeedRow>();

    for (const term of terms) {
      for (const item of list) {
        if (isNumeric(term)) {
          if (String(item.id) === term && !exactIdMatches.some((m) => m.id === item.id)) {
            exactIdMatches.push(item);
          }
        } else {
          const sym = item.symbol.toLowerCase();
          const desc = (item.description ?? '').toLowerCase();
          if ((sym.includes(term) || desc.includes(term)) && !exactIdMatches.some((m) => m.id === item.id)) {
            otherMatches.set(item.id, item);
          }
        }
      }
    }

    return [...exactIdMatches, ...[...otherMatches.values()].sort((a, b) => a.id - b.id)].slice(0, 50);
  }, [feeds, open, query]);

  function handleSelect(f: PythProFeedRow) {
    const ticker = f.description || f.symbol.split('.').pop()?.split('/')[0] || f.symbol;
    onChange({ id: f.id, symbol: f.symbol, ticker, expo: f.expo });
    setQuery(f.symbol);
    setOpen(false);
  }

  return (
    <div className="ticker-picker" ref={containerRef}>
      <span className="ticker-label">{label}</span>
      <div className="ticker-input-wrap">
        <input
          ref={inputRef}
          className="ticker-input"
          value={open ? query : (value?.symbol ?? query)}
          placeholder="Select feed"
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) {
              setOpen(true);
              ensureLoaded();
            }
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
            ensureLoaded();
          }}
        />
        <span className="ticker-chevron">&#x25BE;</span>
      </div>

      {open && (
        <div className="ticker-dropdown">
          {loading ? (
            <div className="ticker-dropdown-msg">Loading...</div>
          ) : error ? (
            <div className="ticker-dropdown-msg ticker-error">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="ticker-dropdown-msg">
              {query.trim() ? 'No matching feeds.' : 'No feeds loaded.'}
            </div>
          ) : (
            filtered.map((f) => (
              <div
                key={f.id}
                className="ticker-option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(f);
                }}
              >
                <span className="ticker-option-symbol">{f.symbol}</span>
                <span className="ticker-option-desc">
                  {f.description || `ID ${f.id}`}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
