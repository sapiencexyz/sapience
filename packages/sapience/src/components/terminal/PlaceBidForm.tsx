'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import ToWinLine from '~/components/terminal/ToWinLine';
import PercentChance from '~/components/shared/PercentChance';
// removed ChevronsDown icon per design update
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@sapience/sdk/ui/components/ui/popover';
import { Pencil } from 'lucide-react';
import { useRestrictedJurisdiction } from '~/hooks/useRestrictedJurisdiction';
import RestrictedJurisdictionBanner from '~/components/shared/RestrictedJurisdictionBanner';

type ExpiryMode = 'duration' | 'datetime';

type Props = {
  collateralAssetTicker: string;
  availableBalance?: number; // in display units
  decimals?: number; // display decimals for amount formatting
  onSubmit?: (data: {
    amount: string;
    expirySeconds: number;
    mode: ExpiryMode;
  }) => void;
  className?: string;
  variant?: 'card' | 'compact';
  // Maker amount in display units (same units as amount input), used to compute to-win and forecast
  makerAmountDisplay?: number;
  // Optional initial amount in display units to prefill (e.g., highest bid + 1)
  initialAmountDisplay?: number;
  // Optional maximum expiry seconds allowed (e.g., remaining time until latest condition end)
  maxExpirySeconds?: number;
  // Current best taker wager in display units; used to anchor quick-increment buttons
  bestBidDisplay?: number;
};

const formatAmount = (value: number, decimals = 2): string => {
  try {
    if (!Number.isFinite(value)) return '0.00';
    return value.toLocaleString(undefined, {
      minimumFractionDigits: Math.min(2, decimals),
      maximumFractionDigits: Math.max(2, decimals),
    });
  } catch {
    return '0.00';
  }
};

const PlaceBidForm: React.FC<Props> = ({
  collateralAssetTicker,
  availableBalance,
  decimals = 2,
  onSubmit,
  className,
  variant = 'card',
  makerAmountDisplay,
  initialAmountDisplay,
  maxExpirySeconds,
  bestBidDisplay,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [mode, setMode] = useState<ExpiryMode>('duration');
  const [duration, setDuration] = useState<number | null>(24 * 60 * 60);
  const [date, setDate] = useState<string>(''); // yyyy-mm-dd
  const [time, setTime] = useState<string>(''); // HH:mm
  const [seconds, setSeconds] = useState<string>('60'); // compact variant expiry seconds
  const [increment, setIncrement] = useState<number>(1);
  const [anchorAmount, setAnchorAmount] = useState<number | null>(null);

  const { isRestricted, isPermitLoading } = useRestrictedJurisdiction();

  const parsedAmount = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) ? n : NaN;
  }, [amount]);

  // Prefill amount from initialAmountDisplay if provided and the user hasn't typed anything yet
  useEffect(() => {
    if (amount !== '') return;
    const v = Number(initialAmountDisplay);
    if (!Number.isFinite(v) || v <= 0) return;
    try {
      setAmount(v.toFixed(decimals));
    } catch {
      /* noop */
    }
    // Only run when initialAmountDisplay changes and amount is empty
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAmountDisplay]);

  // One-time anchor to the best bid on mount/init; do not react to subsequent best bid changes
  useEffect(() => {
    if (anchorAmount != null) return;
    const base = Number(bestBidDisplay);
    if (!Number.isFinite(base) || base <= 0) return;
    setAnchorAmount(base);
    const next = base + increment;
    try {
      setAmount(next.toFixed(decimals));
    } catch {
      setAmount(String(next));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestBidDisplay]);

  // After a bid is submitted, re-anchor to the latest best bid value passed down at that time
  useEffect(() => {
    const handler = () => {
      const base = Number(bestBidDisplay);
      if (!Number.isFinite(base) || base <= 0) return;
      setAnchorAmount(base);
      const next = base + increment;
      try {
        setAmount(next.toFixed(decimals));
      } catch {
        setAmount(String(next));
      }
    };
    try {
      window.addEventListener('auction.bid.submitted', handler);
    } catch {
      /* noop */
    }
    return () => {
      try {
        window.removeEventListener('auction.bid.submitted', handler);
      } catch {
        /* noop */
      }
    };
  }, [bestBidDisplay, increment, decimals]);

  const isAmountValid = useMemo(() => {
    if (amount === '') return false;
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return false;
    if (typeof availableBalance === 'number' && parsedAmount > availableBalance)
      return false;
    const re = new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`);
    return re.test(amount);
  }, [amount, parsedAmount, availableBalance, decimals]);

  const expirySeconds = useMemo(() => {
    if (mode === 'duration')
      return typeof duration === 'number' ? duration : null;
    if (!date || !time) return null;
    try {
      const local = new Date(`${date}T${time}`);
      const secs = Math.floor((local.getTime() - Date.now()) / 1000);
      return Math.max(0, secs);
    } catch {
      return null;
    }
  }, [mode, duration, date, time]);

  const isExpiryValid = useMemo(() => {
    if (typeof expirySeconds !== 'number') return false;
    const min = 5 * 60; // 5 minutes
    const max = 7 * 24 * 60 * 60; // 7 days
    return expirySeconds >= min && expirySeconds <= max;
  }, [expirySeconds]);

  const canSubmit =
    isAmountValid && isExpiryValid && !isPermitLoading && !isRestricted;

  const presetDurations = useMemo(
    () => [
      { label: '1h', s: 1 * 3600 },
      { label: '4h', s: 4 * 3600 },
      { label: '24h', s: 24 * 3600 },
      { label: '3d', s: 3 * 24 * 3600 },
      { label: '7d', s: 7 * 24 * 3600 },
    ],
    []
  );

  if (variant === 'compact') {
    const secondsNumber = useMemo(() => {
      const n = Number(seconds);
      return Number.isFinite(n) ? Math.floor(n) : NaN;
    }, [seconds]);
    const isExpiryValidCompact =
      seconds !== '' && Number.isFinite(secondsNumber) && secondsNumber > 0;
    const canSubmitCompact =
      isAmountValid &&
      isExpiryValidCompact &&
      !isPermitLoading &&
      !isRestricted;
    const makerDisplay = Number.isFinite(makerAmountDisplay as number)
      ? Number(makerAmountDisplay)
      : 0;
    const takerDisplay = Number.isFinite(parsedAmount) ? parsedAmount : 0;
    const totalDisplay =
      Number.isFinite(takerDisplay) && Number.isFinite(makerDisplay)
        ? makerDisplay + takerDisplay
        : NaN;
    const forecastPct =
      totalDisplay > 0 ? Math.round((takerDisplay / totalDisplay) * 100) : null;
    const amountDisplay = Number.isFinite(parsedAmount)
      ? formatAmount(parsedAmount, decimals)
      : '—';

    return (
      <div
        className={(className ? className + ' ' : '') + 'flex flex-col gap-2'}
      >
        <div className="space-y-1 border border-border rounded-md bg-background p-2">
          {/* Row 1: Amount input + inline to-win on left; chance on right */}
          <div className="flex items-baseline justify-between">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-1 gap-y-0.5 min-w-0">
              <div className="inline-flex items-center gap-0.5 text-xs">
                <span className="font-mono text-brand-white">
                  {amountDisplay}
                </span>
                <span className="font-mono text-brand-white ml-1">
                  {collateralAssetTicker}
                </span>
              </div>
              <ToWinLine
                value={Number.isFinite(totalDisplay) ? totalDisplay : NaN}
                ticker={collateralAssetTicker}
                asInline
                label="to win "
                textSize="text-xs"
                className="block basis-full sm:basis-auto sm:inline"
              />
            </div>
            {typeof forecastPct === 'number' ? (
              <PercentChance
                probability={forecastPct / 100}
                showLabel={true}
                label="Chance"
                className="font-mono text-brand-white text-xs whitespace-nowrap"
              />
            ) : (
              <span />
            )}
          </div>

          {/* Row 2: Left text and right-aligned expiration with popover editor */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {[0.01, 1, 10, 100].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setIncrement(opt);
                    const base =
                      anchorAmount != null
                        ? anchorAmount
                        : Number(amount || '0');
                    const next = Number.isFinite(base) ? base + opt : opt;
                    try {
                      setAmount(next.toFixed(decimals));
                    } catch {
                      setAmount(String(next));
                    }
                  }}
                  aria-pressed={increment === opt}
                  className={
                    (increment === opt
                      ? 'bg-accent-gold text-black '
                      : 'bg-muted/20 text-muted-foreground hover:bg-muted/30 ') +
                    'rounded text-[11px] font-mono px-1 mx-0.5'
                  }
                >
                  {`+${opt}`}
                </button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center text-xs"
                    aria-label="Edit wager amount"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-3">
                  <div className="space-y-2">
                    <div className="flex">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder={`0.${'0'.repeat(Math.min(2, decimals))}`}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.trim())}
                        className={
                          (isAmountValid || amount === ''
                            ? ''
                            : 'border-red-600/50 ') +
                          'h-8 text-xs rounded-r-none flex-1'
                        }
                      />
                      <div className="h-8 px-2 flex items-center border border-input bg-muted rounded-r-md ml-[-1px] text-xs text-muted-foreground">
                        {collateralAssetTicker}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="text-xs">
                  <span className="text-muted-foreground">expires in </span>
                  <span className="text-brand-white underline decoration-dotted underline-offset-2 hover:opacity-90">
                    {(seconds || '—') + ' seconds'}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-3">
                <div className="space-y-2">
                  <div className="flex">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={seconds}
                      onChange={(e) =>
                        setSeconds(e.target.value.replace(/[^0-9]/g, ''))
                      }
                      className="h-8 text-xs rounded-r-none border-r-0"
                    />
                    <span className="inline-flex items-center h-8 rounded-md rounded-l-none border border-input border-l-0 bg-muted/30 px-3 text-xs text-muted-foreground whitespace-nowrap">
                      seconds
                    </span>
                  </div>
                  {(() => {
                    const max = Number(maxExpirySeconds);
                    const s = Number(seconds);
                    if (
                      Number.isFinite(max) &&
                      max > 0 &&
                      Number.isFinite(s) &&
                      s > max
                    ) {
                      return (
                        <div className="text-[11px] text-amber-500">
                          Clamped to {Math.floor(max)}s (max allowed for this
                          auction)
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <RestrictedJurisdictionBanner
          show={!isPermitLoading && isRestricted}
          className="mt-2"
          iconClassName="h-4 w-4"
        />

        {/* Submit button: full width under form */}
        <button
          type="button"
          disabled={!canSubmitCompact}
          onClick={() => {
            if (!canSubmitCompact || !Number.isFinite(secondsNumber)) return;
            const sMax = Number(maxExpirySeconds);
            const clamped =
              Number.isFinite(sMax) && sMax > 0
                ? Math.min(secondsNumber, Math.floor(sMax))
                : secondsNumber;
            onSubmit?.({ amount, expirySeconds: clamped, mode: 'duration' });
          }}
          className={
            (canSubmitCompact
              ? 'bg-[hsl(var(--accent-gold)/0.08)] text-accent-gold border border-[hsl(var(--accent-gold)/0.4)] hover:bg-[hsl(var(--accent-gold)/0.03)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-gold)/0.4)] tracking-normal '
              : 'bg-muted text-muted-foreground cursor-not-allowed border border-input ') +
            'w-full rounded-md px-3 py-1.5 inline-flex items-center justify-center text-center text-xs whitespace-nowrap'
          }
        >
          <span className="font-normal">
            Bid{' '}
            <span className="font-semibold">
              {amountDisplay} {collateralAssetTicker}
            </span>{' '}
            <span>to win</span>{' '}
            <span className="font-semibold">
              {Number.isFinite(totalDisplay)
                ? formatAmount(totalDisplay, decimals)
                : '—'}{' '}
              {collateralAssetTicker}
            </span>
          </span>
          {/* icon removed */}
        </button>
      </div>
    );
  }

  return (
    <div
      className={
        (className ? className + ' ' : '') + 'flex items-stretch gap-2'
      }
    >
      <div className="border border-border rounded-md bg-background p-3 flex-1">
        <div className="text-sm font-medium mb-3 text-brand-white">
          Place Bid
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Amount</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                inputMode="decimal"
                placeholder={`0.${'0'.repeat(Math.min(2, decimals))}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value.trim())}
                className="h-9 w-full rounded-md border border-border bg-background px-3 pr-16 text-sm focus:outline-none focus:ring-1 focus:ring-border/60"
              />
              <div className="absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
                {collateralAssetTicker}
              </div>
            </div>
            {typeof availableBalance === 'number' ? (
              <button
                type="button"
                className="inline-flex items-center justify-center h-9 px-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-xs"
                onClick={() => setAmount(availableBalance.toFixed(decimals))}
              >
                MAX
              </button>
            ) : null}
          </div>
          {typeof availableBalance === 'number' ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div>
                Available: {formatAmount(availableBalance, decimals)}{' '}
                {collateralAssetTicker}
              </div>
              <div className="flex gap-1">
                {[0.25, 0.5, 0.75, 1].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="rounded px-2 py-0.5 hover:bg-muted/40"
                    onClick={() =>
                      setAmount((availableBalance * p).toFixed(decimals))
                    }
                  >
                    {Math.round(p * 100)}%
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {!isAmountValid && amount !== '' ? (
            <div className="text-xs text-red-400">
              Enter a valid amount
              {typeof availableBalance === 'number' ? ' ≤ balance' : ''}.
            </div>
          ) : null}
        </div>

        <div className="space-y-2 mt-4">
          <label className="text-xs text-muted-foreground">Expiration</label>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setMode('duration')}
              className={
                mode === 'duration'
                  ? 'px-2 py-1 rounded bg-muted text-foreground'
                  : 'px-2 py-1 rounded text-muted-foreground hover:bg-muted/40'
              }
            >
              Duration
            </button>
            <button
              type="button"
              onClick={() => setMode('datetime')}
              className={
                mode === 'datetime'
                  ? 'px-2 py-1 rounded bg-muted text-foreground'
                  : 'px-2 py-1 rounded text-muted-foreground hover:bg-muted/40'
              }
            >
              Date & time
            </button>
          </div>

          {mode === 'duration' ? (
            <div className="flex flex-wrap gap-2">
              {presetDurations.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => setDuration(d.s)}
                  className={
                    duration === d.s
                      ? 'text-xs rounded px-2 py-1 bg-muted text-foreground'
                      : 'text-xs rounded px-2 py-1 hover:bg-muted/40'
                  }
                >
                  {d.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDuration(null)}
                className={
                  duration === null
                    ? 'text-xs rounded px-2 py-1 bg-muted text-foreground'
                    : 'text-xs rounded px-2 py-1 hover:bg-muted/40'
                }
              >
                Custom
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="date"
                className="h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-border/60"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <input
                type="time"
                className="h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-border/60"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          )}
          {!isExpiryValid ? (
            <div className="text-xs text-red-400">
              Expiration must be between 5 minutes and 7 days.
            </div>
          ) : null}
        </div>

        <div className="rounded-md bg-background border border-border mt-4 p-3 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">You’ll escrow</span>
            <span className="text-brand-white">
              {amount || '—'} {collateralAssetTicker}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expires</span>
            <span className="text-brand-white">
              {(() => {
                if (!isExpiryValid) return '—';
                if (mode === 'duration' && duration) {
                  const hrs = Math.round(duration / 3600);
                  return `in ${hrs}h`;
                }
                if (date && time) return `${date} ${time}`;
                return '—';
              })()}
            </span>
          </div>
          {(() => {
            const makerDisplay = Number.isFinite(makerAmountDisplay as number)
              ? Number(makerAmountDisplay)
              : 0;
            const takerDisplay = Number.isFinite(parsedAmount)
              ? parsedAmount
              : 0;
            const totalDisplay =
              Number.isFinite(takerDisplay) && Number.isFinite(makerDisplay)
                ? makerDisplay + takerDisplay
                : NaN;
            const forecastPct =
              totalDisplay > 0
                ? Math.round((takerDisplay / totalDisplay) * 100)
                : null;
            return (
              <ToWinLine
                value={Number.isFinite(totalDisplay) ? totalDisplay : NaN}
                ticker={collateralAssetTicker}
                pct={forecastPct}
                className="mt-1"
                textSize="text-[11px]"
              />
            );
          })()}
        </div>

        <div className="mt-2 text-[11px] text-muted-foreground">
          Funds are escrowed until your bid expires or fills.
        </div>
      </div>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => {
          if (!canSubmit || typeof expirySeconds !== 'number') return;
          const sMax = Number(maxExpirySeconds);
          const clamped =
            Number.isFinite(sMax) && sMax > 0
              ? Math.min(expirySeconds, Math.floor(sMax))
              : expirySeconds;
          onSubmit?.({ amount, expirySeconds: clamped, mode });
        }}
        className={
          (canSubmit
            ? 'bg-[hsl(var(--accent-gold)/0.08)] text-accent-gold border border-[hsl(var(--accent-gold)/0.4)] hover:bg-[hsl(var(--accent-gold)/0.03)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-gold)/0.4)] tracking-normal '
            : 'bg-muted text-muted-foreground cursor-not-allowed border border-input ') +
          'self-stretch w-28 shrink-0 rounded-md px-3 inline-flex items-center justify-center text-center text-sm whitespace-nowrap'
        }
      >
        <span className="font-normal">
          Bid{' '}
          <span className="font-semibold">
            {(() =>
              Number.isFinite(parsedAmount)
                ? formatAmount(parsedAmount, decimals)
                : '—')()}{' '}
            {collateralAssetTicker}
          </span>{' '}
          <span>to win</span>{' '}
          <span className="font-semibold">
            {(() => {
              const makerDisplay = Number.isFinite(makerAmountDisplay as number)
                ? Number(makerAmountDisplay)
                : 0;
              const takerDisplay = Number.isFinite(parsedAmount)
                ? parsedAmount
                : 0;
              const totalDisplay =
                Number.isFinite(takerDisplay) && Number.isFinite(makerDisplay)
                  ? makerDisplay + takerDisplay
                  : NaN;
              return Number.isFinite(totalDisplay)
                ? formatAmount(totalDisplay, decimals)
                : '—';
            })()}{' '}
            {collateralAssetTicker}
          </span>
        </span>
        {/* icon removed */}
      </button>
    </div>
  );
};

export default PlaceBidForm;
