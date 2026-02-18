'use client';

import * as React from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { z } from 'zod';

import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Calendar as DateCalendar } from './ui/calendar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from './ui/command';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

export type CreatePythPredictionFormProps = {
  className?: string;
  disabled?: boolean;
  /**
   * This form is Lazer-only: `priceId` is a Pyth Lazer uint32 feed id (represented as a number
   * string, e.g. "1"). We still use Hermes behind the scenes to fetch a latest reference price.
   *
   * NOTE: The protocol `PythResolver.sol` expects `lazer` feed ids.
   */
  onPick?: (values: CreatePythPredictionFormValues) => void;
};

export type CreatePythPredictionDirection = 'over' | 'under';

export type CreatePythPredictionFormValues = {
  /**
   * Pyth Lazer uint32 feed id represented as a string (e.g. "1").
   */
  priceId: string;
  /** Optional human label (e.g. `Crypto.BTC/USD`) if known at pick time. */
  priceFeedLabel?: string;
  direction: CreatePythPredictionDirection;
  targetPrice: number;
  /** Raw user-visible string for preserving precision (used for tooltips). */
  targetPriceRaw: string;
  /** Full precision string from Hermes (used for tooltips when auto-populated). */
  targetPriceFullPrecision?: string;
  /**
   * Pyth exponent for the selected feed at pick time.
   * Needed to encode a resolver-compatible strike price (int64) and `strikeExpo` (int32).
   */
  priceExpo: number;
  dateTimeLocal: string;
};

type DateTimePreset = '' | '15m' | '1h' | '1w' | 'custom';

type PythProFeedRow = {
  id: number; // Pyth Pro ID (feed id)
  symbol: string; // e.g. "Crypto.BTC/USD"
  description?: string; // e.g. "BITCOIN / US DOLLAR"
  expo: number; // exponent
};

const pythProSchema = z.array(
  z.object({
    asset_type: z.string(),
    description: z.string(),
    name: z.string(),
    symbol: z.string(),
    pyth_lazer_id: z.number().int().positive(),
    exponent: z.number(),
  })
);

async function fetchPythProFeeds(signal: AbortSignal): Promise<PythProFeedRow[]> {
  // Matches upstream Pyth Developer Hub implementation:
  // https://raw.githubusercontent.com/pyth-network/pyth-crosschain/refs/heads/main/apps/developer-hub/src/components/PriceFeedIdsProTable/index.tsx
  const res = await fetch(
    'https://history.pyth-lazer.dourolabs.app/history/v1/symbols',
    { signal }
  );
  if (!res.ok) throw new Error(`Pyth Pro feed list failed (${res.status})`);
  const json = (await res.json()) as unknown;
  const data = pythProSchema.parse(json);
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

let cachedLazerFeeds: PythProFeedRow[] | null = null;
let inflightLazerFeeds: Promise<PythProFeedRow[]> | null = null;

async function loadPythProFeedsCached(
  signal: AbortSignal
): Promise<PythProFeedRow[]> {
  if (cachedLazerFeeds && cachedLazerFeeds.length > 0) return cachedLazerFeeds;
  if (inflightLazerFeeds) return await inflightLazerFeeds;
  inflightLazerFeeds = (async () => {
    try {
      const rows = await fetchPythProFeeds(signal);
      cachedLazerFeeds = rows;
      return rows;
    } finally {
      inflightLazerFeeds = null;
    }
  })();
  return await inflightLazerFeeds;
}

function formatDateTimeLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60_000);
}

function parseDateTimeLocalInputValue(value: string): {
  date: Date | undefined;
  time: string;
} {
  // Expected: YYYY-MM-DDTHH:MM
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return { date: undefined, time: '12:00' };
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const hh = Number(m[4]);
  const min = Number(m[5]);
  const d = new Date(yyyy, mm - 1, dd, hh, min);
  if (Number.isNaN(d.getTime())) return { date: undefined, time: '12:00' };
  return { date: d, time: `${m[4]}:${m[5]}` };
}

function getLocalTimeZoneLabel(): string {
  try {
    const tz =
      typeof Intl !== 'undefined' && 'DateTimeFormat' in Intl
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : undefined;
    const parts =
      typeof Intl !== 'undefined' && 'DateTimeFormat' in Intl
        ? Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(
            new Date()
          )
        : [];
    const abbr = parts.find((p) => p.type === 'timeZoneName')?.value;
    return abbr ? `Local (${abbr})` : tz ? `Local (${tz})` : 'Local';
  } catch {
    return 'Local';
  }
}

function DateTimeSelector({
  disabled,
  value,
  onChange,
  onPresetChange,
}: {
  disabled?: boolean;
  value: string;
  onChange: (next: string) => void;
  onPresetChange?: (preset: DateTimePreset) => void;
}) {
  const [preset, setPreset] = React.useState<DateTimePreset>('');
  const [customValue, setCustomValue] = React.useState<string>('');
  const [customOpen, setCustomOpen] = React.useState<boolean>(false);

  // Default to +15m on first mount (only when no value is set yet).
  React.useEffect(() => {
    if (disabled) return;
    if (value) return;
    setPreset('15m');
    onPresetChange?.('15m');
    onChange(formatDateTimeLocalInputValue(addMinutes(new Date(), 15)));
    // Intentionally run once on mount; don't depend on `value` or `onChange` to avoid
    // re-applying the default after user interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = React.useCallback(
    (nextPreset: DateTimePreset) => {
      // Clicking the active preset toggles it off.
      if (nextPreset === preset) {
        setPreset('');
        onPresetChange?.('');
        setCustomOpen(false);
        onChange('');
        return;
      }

      setPreset(nextPreset);
      onPresetChange?.(nextPreset);

      if (nextPreset === 'custom') {
        setCustomOpen(true);
        const nextCustom =
          customValue ||
          value ||
          formatDateTimeLocalInputValue(addMinutes(new Date(), 15));
        setCustomValue(nextCustom);
        onChange(nextCustom);
        return;
      }

      if (nextPreset === '') {
        setCustomOpen(false);
        onChange('');
        return;
      }

      setCustomOpen(false);
      const now = new Date();
      const next =
        nextPreset === '15m'
          ? formatDateTimeLocalInputValue(addMinutes(now, 15))
          : nextPreset === '1h'
            ? formatDateTimeLocalInputValue(addMinutes(now, 60))
            : formatDateTimeLocalInputValue(addDays(now, 7));

      onChange(next);
    },
    [customValue, onChange, preset, value]
  );

  const isCustom = preset === 'custom';
  const presetBtnBase =
    'h-9 px-2 md:px-4 font-mono font-medium transition-all duration-200 ease-in-out select-none rounded-md border whitespace-nowrap tracking-wider uppercase text-sm disabled:opacity-50 flex-1 md:flex-none text-center';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 w-full">
      <span className="text-base md:text-lg text-muted-foreground whitespace-nowrap">
        {isCustom ? 'at' : 'in'}
      </span>

      <div className="flex flex-wrap items-center gap-2 flex-1 w-full md:w-auto">
        {(
          [
            { id: '15m', label: '15m', aria: 'In 15 minutes' },
            { id: '1h', label: '1h', aria: 'In 1 hour' },
            { id: '1w', label: '1w', aria: 'In a week' },
            { id: 'custom', label: 'custom', aria: 'Custom time' },
          ] as const
        ).map((opt) => {
          const active = preset === opt.id;
          const cls =
            presetBtnBase +
            ' ' +
            (active
              ? 'bg-brand-white text-brand-black border-brand-white'
              : 'bg-brand-white/10 text-brand-white/70 hover:bg-brand-white/15 border-brand-white/20');

          if (opt.id === 'custom') {
            const { date: selectedDate, time: selectedTime } =
              parseDateTimeLocalInputValue(customValue);
            const tzLabel = getLocalTimeZoneLabel();
            return (
              <Popover
                key={opt.id}
                open={customOpen}
                onOpenChange={(v) => setCustomOpen(v)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={() => applyPreset(opt.id)}
                    aria-pressed={active}
                    aria-label={opt.aria}
                    title="Custom time"
                    disabled={disabled}
                    className={cls}
                  >
                    {opt.label}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  className="w-[300px] max-w-[calc(100vw-2rem)] p-2 bg-brand-black text-brand-white border border-brand-white/20 font-mono"
                  align="start"
                >
                  <div className="flex flex-col gap-3">
                    <DateCalendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => {
                        if (!d) return;
                        const [hh, min] = selectedTime.split(':').map(Number);
                        const next = new Date(
                          d.getFullYear(),
                          d.getMonth(),
                          d.getDate(),
                          Number.isFinite(hh) ? hh : 12,
                          Number.isFinite(min) ? min : 0
                        );
                        const nextValue = formatDateTimeLocalInputValue(next);
                        setCustomValue(nextValue);
                        onPresetChange?.('custom');
                        onChange(nextValue);
                      }}
                      disabled={disabled}
                      className="rounded-md border border-brand-white/20 bg-transparent p-1"
                    />

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input
                          type="time"
                          value={selectedTime}
                          onChange={(e) => {
                            const nextTime = e.target.value;
                            const base = selectedDate ?? new Date();
                            const [hh, min] = nextTime.split(':').map(Number);
                            const next = new Date(
                              base.getFullYear(),
                              base.getMonth(),
                              base.getDate(),
                              Number.isFinite(hh) ? hh : 12,
                              Number.isFinite(min) ? min : 0
                            );
                            const nextValue = formatDateTimeLocalInputValue(next);
                            setCustomValue(nextValue);
                            onPresetChange?.('custom');
                            onChange(nextValue);
                          }}
                          disabled={disabled}
                          aria-label="Custom prediction time"
                          className="h-9 w-full bg-transparent border-brand-white/20 text-foreground placeholder:text-muted-foreground pr-20"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground whitespace-nowrap">
                          {tzLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            );
          }

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => applyPreset(opt.id)}
              aria-pressed={active}
              aria-label={opt.aria}
              disabled={disabled}
              className={cls}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type HermesPriceFeed = {
  id: string;
  symbol?: string;
  description?: string;
  asset_type?: string;
};

let hermesPriceFeedsCache: HermesPriceFeed[] | null = null;

function coerceString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined;
}

function coerceNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function coerceIntegerString(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && Number.isSafeInteger(v)) {
    return String(v);
  }
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return undefined;
  // allow leading sign
  if (/^[+-]?\d+$/.test(s)) return s;
  return undefined;
}

function formatPythPriceDecimal(priceInt: string, expo: number): string {
  const sign = priceInt.startsWith('-') ? '-' : '';
  const digits = priceInt.replace(/^[+-]/, '');

  if (!digits || /^0+$/.test(digits)) return '0';

  if (expo >= 0) {
    return sign + digits + '0'.repeat(expo);
  }

  const places = Math.abs(expo);
  let out: string;
  if (digits.length <= places) {
    out = `0.${'0'.repeat(places - digits.length)}${digits}`;
  } else {
    const i = digits.length - places;
    out = `${digits.slice(0, i)}.${digits.slice(i)}`;
  }

  // Trim trailing zeros after decimal, and remove trailing dot.
  out = out.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return sign + out;
}

function normalizeHermesPriceFeed(raw: unknown): HermesPriceFeed | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const id = coerceString(obj.id);
  if (!id) return null;

  // Hermes responses vary by version; some fields are nested under `attributes`.
  const attrs =
    obj.attributes && typeof obj.attributes === 'object'
      ? (obj.attributes as Record<string, unknown>)
      : null;

  const symbol =
    coerceString(obj.symbol) ??
    (attrs ? coerceString(attrs.symbol) : undefined) ??
    (attrs ? coerceString(attrs.ticker) : undefined);
  const description =
    coerceString(obj.description) ??
    (attrs ? coerceString(attrs.description) : undefined) ??
    (attrs ? coerceString(attrs.display_name) : undefined);
  const asset_type =
    coerceString(obj.asset_type) ??
    (attrs ? coerceString(attrs.asset_type) : undefined) ??
    (attrs ? coerceString(attrs.assetType) : undefined);

  return { id, symbol, description, asset_type };
}

function normalizeHermesPriceFeeds(payload: unknown): HermesPriceFeed[] {
  if (Array.isArray(payload)) {
    return payload
      .map(normalizeHermesPriceFeed)
      .filter((f): f is HermesPriceFeed => !!f);
  }
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { price_feeds?: unknown[] }).price_feeds)
  ) {
    return (payload as { price_feeds: unknown[] }).price_feeds
      .map(normalizeHermesPriceFeed)
      .filter((f): f is HermesPriceFeed => !!f);
  }
  return [];
}

type HermesLatestPrice = {
  price: string;
  expo: number;
  publishTime?: number;
};

function normalizeHermesLatestPrice(payload: unknown): HermesLatestPrice | null {
  // Try to find a first "price feed update" object in a few known shapes.
  let candidate: unknown = payload;

  if (Array.isArray(candidate)) {
    candidate = candidate[0];
  } else if (candidate && typeof candidate === 'object') {
    const obj = candidate as Record<string, unknown>;
    if (Array.isArray(obj.parsed)) candidate = obj.parsed[0];
    else if (Array.isArray(obj.price_feeds)) candidate = obj.price_feeds[0];
    else if (Array.isArray(obj.data)) candidate = obj.data[0];
  }

  if (!candidate || typeof candidate !== 'object') return null;
  const obj = candidate as Record<string, unknown>;

  // Sometimes nested under `price`.
  const priceObj =
    obj.price && typeof obj.price === 'object'
      ? (obj.price as Record<string, unknown>)
      : null;

  const priceInt =
    coerceIntegerString(priceObj?.price) ??
    coerceIntegerString(priceObj?.value) ??
    coerceIntegerString(obj.price);
  const expo =
    coerceNumber(priceObj?.expo) ??
    coerceNumber(priceObj?.exponent) ??
    coerceNumber(obj.expo) ??
    coerceNumber(obj.exponent);

  if (!priceInt || typeof expo !== 'number') return null;

  const publishTime =
    coerceNumber(priceObj?.publish_time) ??
    coerceNumber(priceObj?.publishTime) ??
    coerceNumber(obj.publish_time) ??
    coerceNumber(obj.publishTime);

  return { price: priceInt, expo, publishTime };
}

async function fetchHermesLatestPrice(
  priceId: string,
  signal: AbortSignal
): Promise<HermesLatestPrice> {
  const urls = [
    `https://hermes.pyth.network/api/latest_price_feeds?ids[]=${encodeURIComponent(
      priceId
    )}`,
    `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${encodeURIComponent(
      priceId
    )}&parsed=true`,
  ];

  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Hermes latest price failed: ${res.status}`);
      const json = (await res.json()) as unknown;
      const latest = normalizeHermesLatestPrice(json);
      if (latest) return latest;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Hermes latest price failed');
}

async function fetchHermesPriceFeeds(
  signal: AbortSignal
): Promise<HermesPriceFeed[]> {
  const urls = [
    'https://hermes.pyth.network/api/price_feeds',
    'https://hermes.pyth.network/v2/price_feeds',
  ];

  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Hermes fetch failed: ${res.status}`);
      const json = (await res.json()) as unknown;
      const feeds = normalizeHermesPriceFeeds(json).filter(
        (f): f is HermesPriceFeed => !!f && typeof f.id === 'string' && !!f.id
      );
      if (feeds.length > 0) return feeds;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Hermes fetch failed');
}

export function CreatePythPredictionForm({
  className,
  disabled,
  onPick,
}: CreatePythPredictionFormProps) {
  const [priceId, setPriceId] = React.useState<string>('');
  const [priceFeedLabel, setPriceFeedLabel] = React.useState<string>('');
  const [isLoadingLatestPrice, setIsLoadingLatestPrice] =
    React.useState<boolean>(false);
  const [latestPriceError, setLatestPriceError] = React.useState<string | null>(
    null
  );
  const latestPriceAbortRef = React.useRef<AbortController | null>(null);
  const [priceExpo, setPriceExpo] = React.useState<number | null>(null);

  // Pyth Pro (Lazer) feed list (id + symbol + exponent).
  const [lazerFeeds, setLazerFeeds] = React.useState<PythProFeedRow[]>([]);
  const [isLoadingLazerFeeds, setIsLoadingLazerFeeds] = React.useState(false);
  const [lazerFeedsError, setLazerFeedsError] = React.useState<string | null>(
    null
  );
  const [lazerOpen, setLazerOpen] = React.useState<boolean>(false);
  const [lazerQuery, setLazerQuery] = React.useState<string>('');
  const [lazerSelectedLabel, setLazerSelectedLabel] = React.useState<string>('');

  const [direction, setDirection] =
    React.useState<CreatePythPredictionDirection>('over');
  // `targetPriceDisplay` drives the input UI; `targetPriceRaw` preserves full precision for tooltips.
  const [targetPriceDisplay, setTargetPriceDisplay] = React.useState<string>('');
  const [targetPriceRaw, setTargetPriceRaw] = React.useState<string>('');
  const [targetPriceFullPrecision, setTargetPriceFullPrecision] =
    React.useState<string>('');
  const [dateTimeLocal, setDateTimeLocal] = React.useState<string>('');
  const [dateTimePreset, setDateTimePreset] = React.useState<DateTimePreset>('');

  // Once a Lazer feed is selected (and we know its human symbol), use Hermes to
  // fetch a current reference price and populate the Price input (rounded to 2dp).
  // IMPORTANT: this should ONLY run after selection (not during search/open).
  const populateLatestPriceForSymbol = React.useCallback(
    (symbol: string) => {
      if (disabled) return;
      const sym = symbol?.trim();
      if (!sym) return;

      latestPriceAbortRef.current?.abort();
      const ac = new AbortController();
      latestPriceAbortRef.current = ac;
      setIsLoadingLatestPrice(true);
      setLatestPriceError(null);

      (async () => {
        try {
          // Yield so the UI can paint (dropdown closes, etc.) before any heavy work.
          await new Promise<void>((r) => setTimeout(r, 0));
          if (ac.signal.aborted) return;

          // Load Hermes feed list (cached where possible) to map symbol -> feed id.
          const list =
            hermesPriceFeedsCache && hermesPriceFeedsCache.length > 0
              ? hermesPriceFeedsCache
              : await fetchHermesPriceFeeds(ac.signal);
          if (ac.signal.aborted) return;
          if (!hermesPriceFeedsCache || hermesPriceFeedsCache.length === 0) {
            hermesPriceFeedsCache = list;
          }

          const target = list.find(
            (f) => (f.symbol ?? '').toLowerCase() === sym.toLowerCase()
          );
          if (!target?.id) return;

          const p = await fetchHermesLatestPrice(target.id, ac.signal);
          if (ac.signal.aborted) return;

          const formatted = formatPythPriceDecimal(p.price, p.expo);
          const n = Number(formatted);
          const rounded = Number.isFinite(n) ? n.toFixed(2) : formatted;

          setTargetPriceFullPrecision(formatted);
          setTargetPriceRaw(rounded);
          setTargetPriceDisplay(rounded);
        } catch (e) {
          if (ac.signal.aborted) return;
          setLatestPriceError(
            e instanceof Error ? e.message : 'Failed to load latest price'
          );
        } finally {
          if (!ac.signal.aborted) setIsLoadingLatestPrice(false);
        }
      })();
    },
    [disabled]
  );

  const ensureLazerFeedsLoaded = React.useCallback(() => {
    if (disabled) return () => {};
    if (isLoadingLazerFeeds) return () => {};
    if (lazerFeeds.length > 0) return () => {};
    if (cachedLazerFeeds && cachedLazerFeeds.length > 0) {
      setLazerFeeds(cachedLazerFeeds);
      return () => {};
    }

    const ac = new AbortController();
    setIsLoadingLazerFeeds(true);
    setLazerFeedsError(null);

    // Yield before heavy JSON/zod parsing so the UI can paint "Loading…" first.
    (async () => {
      try {
        await new Promise<void>((r) => setTimeout(r, 0));
        const rows = await loadPythProFeedsCached(ac.signal);
        if (ac.signal.aborted) return;
        setLazerFeeds(rows);
      } catch (e) {
        if (ac.signal.aborted) return;
        setLazerFeeds([]);
        setLazerFeedsError(e instanceof Error ? e.message : 'Failed to load feeds');
      } finally {
        if (!ac.signal.aborted) setIsLoadingLazerFeeds(false);
      }
    })();

    return () => ac.abort();
  }, [disabled, isLoadingLazerFeeds, lazerFeeds.length]);

  const filteredLazerFeeds = React.useMemo(() => {
    if (!lazerOpen) return [];
    const q = lazerQuery.trim().toLowerCase();
    const list = lazerFeeds;
    if (!q) {
      // Match the pre-change UX: show a few "popular" defaults when the query is empty.
      const wantedSymbols = ['Crypto.BTC/USD', 'Crypto.ETH/USD', 'Crypto.ENA/USD'];
      const out: PythProFeedRow[] = [];
      const bySymbol = new Map<string, PythProFeedRow>();
      for (const f of list) {
        const sym = (f.symbol ?? '').toLowerCase();
        if (sym) bySymbol.set(sym, f);
      }
      for (const sym of wantedSymbols) {
        const hit = bySymbol.get(sym.toLowerCase());
        if (hit) out.push(hit);
      }
      // Fallback: if exact symbols aren’t present (e.g. ENA missing), show first items by id.
      if (out.length === 0) return list.slice(0, 25);
      return out;
    }

    // Support comma/space separated terms (same UX as Pyth Developer Hub).
    const terms = q
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length === 0) return list.slice(0, 25);

    const exactIdMatches: PythProFeedRow[] = [];
    const otherMatches = new Map<number, PythProFeedRow>();
    const isNumeric = (t: string) => /^\d+$/.test(t);

    const matchesTerm = (item: PythProFeedRow, term: string): boolean => {
      if (isNumeric(term)) return String(item.id) === term;
      const sym = item.symbol.toLowerCase();
      const desc = (item.description ?? '').toLowerCase();
      return sym.includes(term) || desc.includes(term);
    };

    for (const term of terms) {
      for (const item of list) {
        if (!matchesTerm(item, term)) continue;
        if (isNumeric(term) && String(item.id) === term) {
          if (!exactIdMatches.some((m) => m.id === item.id)) exactIdMatches.push(item);
        } else if (!exactIdMatches.some((m) => m.id === item.id)) {
          otherMatches.set(item.id, item);
        }
      }
    }

    const other = [...otherMatches.values()].sort((a, b) => a.id - b.id);
    return [...exactIdMatches, ...other].slice(0, 50);
  }, [lazerFeeds, lazerOpen, lazerQuery]);

  const targetPrice = React.useMemo(() => {
    const n = Number(targetPriceDisplay);
    return Number.isFinite(n) ? n : NaN;
  }, [targetPriceDisplay]);

  const isValid =
    !!priceId &&
    Number.isFinite(targetPrice) &&
    targetPrice > 0 &&
    !!dateTimeLocal &&
    typeof priceExpo === 'number';

  const isPickDisabled = !!disabled || !isValid;

  const submit = React.useCallback(() => {
    if (isPickDisabled) return;
    if (typeof priceExpo !== 'number') return;
    const computedDateTimeLocal =
      dateTimePreset === '15m'
        ? formatDateTimeLocalInputValue(addMinutes(new Date(), 15))
        : dateTimePreset === '1h'
          ? formatDateTimeLocalInputValue(addMinutes(new Date(), 60))
          : dateTimePreset === '1w'
            ? formatDateTimeLocalInputValue(addDays(new Date(), 7))
            : dateTimeLocal;

    // Keep UI in sync when using presets (so the displayed time matches the submitted one).
    if (computedDateTimeLocal && computedDateTimeLocal !== dateTimeLocal) {
      setDateTimeLocal(computedDateTimeLocal);
    }

    // If the price was auto-populated from Hermes, ensure the underlying numeric value
    // is rounded to exactly 2 decimals (avoid float artifacts leaking elsewhere).
    const roundedTargetPrice =
      targetPriceFullPrecision && Number.isFinite(targetPrice)
        ? Number(targetPrice.toFixed(2))
        : targetPrice;
    const roundedTargetPriceRaw =
      targetPriceFullPrecision && Number.isFinite(roundedTargetPrice)
        ? roundedTargetPrice.toFixed(2)
        : targetPriceRaw;

    onPick?.({
      priceId,
      priceFeedLabel:
        priceFeedLabel || (priceId ? `Pyth Pro #${priceId}` : undefined),
      direction,
      targetPrice: roundedTargetPrice,
      targetPriceRaw: roundedTargetPriceRaw,
      targetPriceFullPrecision: targetPriceFullPrecision || undefined,
      priceExpo,
      dateTimeLocal: computedDateTimeLocal,
    });
  }, [
    dateTimeLocal,
    dateTimePreset,
    direction,
    isPickDisabled,
    onPick,
    priceExpo,
    targetPriceRaw,
    targetPriceFullPrecision,
    priceFeedLabel,
    priceId,
    targetPrice,
  ]);

  return (
    <div
      className={cn(
        'rounded-md border border-brand-white/20 overflow-hidden bg-brand-black',
        className
      )}
    >
      <form
        className="px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-wrap md:flex-nowrap items-center gap-x-3 md:gap-x-4 gap-y-3">
          <div className="basis-full md:basis-auto w-full md:w-auto flex-1 min-w-[180px] md:min-w-[220px]">
            <Popover
              open={lazerOpen}
              onOpenChange={(v) => {
                setLazerOpen(v);
                if (v) ensureLazerFeedsLoaded();
              }}
            >
              <div className="relative">
                <Input
                  value={lazerQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setLazerQuery(next);
                    // clear selection when user edits
                    setPriceId('');
                    setPriceFeedLabel('');
                    setLazerSelectedLabel('');
                    setPriceExpo(null);
                    if (!lazerOpen) setLazerOpen(true);
                    ensureLazerFeedsLoaded();
                  }}
                  onFocus={() => {
                    setLazerOpen(true);
                    ensureLazerFeedsLoaded();
                  }}
                  placeholder={
                    lazerSelectedLabel ? lazerSelectedLabel : 'Select Price Feed'
                  }
                  disabled={disabled}
                  aria-label="Search Pyth Pro feeds"
                  className="h-9 bg-transparent border-brand-white/20 text-foreground placeholder:text-foreground pr-9"
                />
                <ChevronsUpDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
                <PopoverTrigger asChild>
                  <div className="absolute inset-0 pointer-events-none" aria-hidden />
                </PopoverTrigger>
              </div>

              <PopoverContent
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0 bg-brand-black text-brand-white border border-brand-white/20 font-mono"
                align="start"
              >
                <Command>
                  <CommandList>
                    {isLoadingLazerFeeds ? (
                      <div className="py-3 px-3 text-sm opacity-75">Loading…</div>
                    ) : lazerFeedsError ? (
                      <div className="py-3 px-3 text-sm text-red-400">
                        {lazerFeedsError}
                      </div>
                    ) : filteredLazerFeeds.length === 0 ? (
                      <CommandEmpty className="py-4 text-center text-sm opacity-75">
                        {lazerQuery.trim().length === 0
                          ? 'No price feeds loaded.'
                          : 'No matching price feeds.'}
                      </CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {filteredLazerFeeds.map((f) => {
                          const label = f.symbol || `Feed #${f.id}`;
                          const sub = f.description || `ID ${f.id} • expo ${f.expo}`;
                          return (
                            <CommandItem
                              key={f.id}
                              onSelect={() => {
                                setPriceId(String(f.id));
                                setPriceFeedLabel(label);
                                setLazerSelectedLabel(label);
                                setLazerQuery(label);
                                setPriceExpo(f.expo);
                                setLazerOpen(false);
                                // After the symbol is selected, use Hermes to populate the Price input (2dp).
                                populateLatestPriceForSymbol(f.symbol);
                              }}
                              className="flex flex-col items-start gap-0.5 text-brand-white transition-colors duration-200 ease-out hover:bg-brand-white/10 data-[highlighted]:bg-brand-white/10 data-[highlighted]:text-brand-white cursor-pointer"
                            >
                              <span className="text-sm text-brand-white">
                                {label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {sub}
                              </span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="basis-full md:basis-auto w-full md:w-auto flex items-center gap-x-3 md:gap-x-4 gap-y-3 flex-wrap md:flex-nowrap">
            <ToggleGroup
              type="single"
              value={direction}
              onValueChange={(v) => {
                if (v === 'over' || v === 'under') setDirection(v);
              }}
              disabled={disabled}
              className="bg-transparent gap-4 shrink-0 justify-start"
              aria-label="Select direction"
            >
              <ToggleGroupItem
                value="over"
                aria-label="Over"
                className="h-9 px-4 font-mono font-medium transition-all duration-200 ease-in-out select-none rounded-md border whitespace-nowrap tracking-wider uppercase text-emerald-700 dark:text-white/90 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-400/60 shadow-[0_0_0_1px_rgba(16,185,129,0.18)] hover:shadow-[0_0_0_1px_rgba(16,185,129,0.28),_0_0_10px_rgba(16,185,129,0.18)] dark:shadow-[0_0_0_1px_rgba(16,185,129,0.28)] dark:hover:shadow-[0_0_0_1px_rgba(16,185,129,0.4),_0_0_12px_rgba(16,185,129,0.3)] data-[state=on]:text-emerald-900 data-[state=on]:bg-emerald-500/50 data-[state=on]:hover:bg-emerald-500/60 data-[state=on]:border-emerald-500 data-[state=on]:shadow-[0_0_0_2px_rgba(16,185,129,0.35)] dark:data-[state=on]:text-white/90 dark:data-[state=on]:bg-emerald-500/70 dark:data-[state=on]:hover:bg-emerald-500/80 dark:data-[state=on]:shadow-[0_0_0_2px_rgba(16,185,129,0.45)]"
              >
                Over
              </ToggleGroupItem>
              <ToggleGroupItem
                value="under"
                aria-label="Under"
                className="h-9 px-4 font-mono font-medium transition-all duration-200 ease-in-out select-none rounded-md border whitespace-nowrap tracking-wider uppercase text-rose-700 dark:text-white/90 bg-rose-500/10 hover:bg-rose-500/20 border-rose-400/60 shadow-[0_0_0_1px_rgba(244,63,94,0.18)] hover:shadow-[0_0_0_1px_rgba(244,63,94,0.28),_0_0_10px_rgba(244,63,94,0.18)] dark:shadow-[0_0_0_1px_rgba(244,63,94,0.28)] dark:hover:shadow-[0_0_0_1px_rgba(244,63,94,0.4),_0_0_12px_rgba(244,63,94,0.3)] data-[state=on]:text-rose-900 data-[state=on]:bg-rose-500/50 data-[state=on]:hover:bg-rose-500/60 data-[state=on]:border-rose-500 data-[state=on]:shadow-[0_0_0_2px_rgba(244,63,94,0.35)] dark:data-[state=on]:text-white/90 dark:data-[state=on]:bg-rose-500/70 dark:data-[state=on]:hover:bg-rose-500/80 dark:data-[state=on]:shadow-[0_0_0_2px_rgba(244,63,94,0.45)]"
              >
                Under
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="relative flex-1 md:flex-none md:w-[180px] min-w-[140px] sm:min-w-[160px] md:min-w-[180px]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={targetPriceDisplay}
                onChange={(e) => {
                  const v = e.target.value;
                  setTargetPriceDisplay(v);
                  // If the user edits, treat their entry as the "raw" tooltip value too.
                  setTargetPriceRaw(v);
                  setTargetPriceFullPrecision('');
                }}
                placeholder="Price"
                disabled={disabled}
                aria-label="Target price"
                className="h-9 w-full bg-transparent border-brand-white/20 text-foreground placeholder:text-muted-foreground pl-7"
              />
            </div>
          </div>

          <div className="basis-full md:basis-auto w-full md:w-auto flex-1 min-w-[220px] md:min-w-0">
            <DateTimeSelector
              disabled={disabled}
              value={dateTimeLocal}
              onChange={setDateTimeLocal}
              onPresetChange={setDateTimePreset}
            />
          </div>

          <Button
            type="submit"
            disabled={isPickDisabled}
            variant="default"
            className="tracking-wider font-mono text-base md:text-sm px-4 h-12 md:h-9 bg-brand-white text-brand-black shrink-0 ml-0 md:ml-2 w-full md:w-auto basis-full md:basis-auto mt-2 md:mt-0"
          >
            PICK
          </Button>
        </div>
      </form>
    </div>
  );
}


