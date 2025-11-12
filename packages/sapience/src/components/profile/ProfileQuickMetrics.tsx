'use client';

import Image from 'next/image';
import * as React from 'react';
import { erc20Abi, formatUnits } from 'viem';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useReadContract } from 'wagmi';
import {
  Calendar,
  TrendingUp,
  Telescope,
  BarChart2,
  Target,
} from 'lucide-react';

import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';

import type { PositionType } from '@sapience/sdk/types';
import { DEFAULT_COLLATERAL_ASSET } from '~/components/admin/constants';
import { formatFiveSigFigs, bigIntAbs } from '~/lib/utils/util';
import type { Parlay } from '~/hooks/graphql/useUserParlays';
import { useUserProfitRank } from '~/hooks/graphql/useUserProfitRank';
import { useForecasterRank } from '~/hooks/graphql/useForecasterRank';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';

type MetricBadgeProps = {
  icon?: React.ReactNode;
  imageSrc?: string;
  label: string;
  value: React.ReactNode;
  sublabel?: string;
  tooltip?: string;
  size?: 'normal' | 'large';
  muted?: boolean;
  highlighted?: boolean;
};

function MetricBadge({
  icon,
  imageSrc,
  label,
  value,
  sublabel,
  tooltip,
  size = 'normal',
  muted = false,
  highlighted = false,
}: MetricBadgeProps) {
  const baseBadgeClasses = 'h-8 items-center px-3 text-xs leading-none';
  const desktopBase =
    size === 'large'
      ? 'h-9 items-center px-3.5 text-sm leading-none'
      : baseBadgeClasses;
  const outlineExtras = highlighted
    ? 'bg-background text-foreground border-foreground/30'
    : 'bg-card border-border';

  const variant = muted ? 'secondary' : 'outline';
  const smallClass = `${baseBadgeClasses} ${muted ? '' : outlineExtras}`.trim();
  const largeClass =
    `${desktopBase} inline-flex ${muted ? '' : outlineExtras}`.trim();

  const textColor = highlighted ? 'text-foreground' : 'text-brand-white';
  const sublabelColor = highlighted
    ? 'text-foreground/70'
    : 'text-muted-foreground';
  const dividerColor = highlighted
    ? 'bg-foreground/30'
    : 'bg-muted-foreground/30';

  const left = (
    <>
      {imageSrc ? (
        <Image
          src={imageSrc}
          alt={label}
          width={16}
          height={16}
          className="mr-2 opacity-80"
        />
      ) : icon ? (
        <span
          className={`mr-2 -mt-0.5 ${size === 'large' ? 'h-4 w-4' : 'h-3.5 w-3.5'}`}
        >
          {icon}
        </span>
      ) : null}
      <span className={`font-medium ${textColor}`}>{label}</span>
    </>
  );

  const content = (
    <>
      {left}
      <span
        aria-hidden="true"
        className={`hidden md:inline-block mx-2.5 h-4 w-px ${dividerColor}`}
      />
      <span className={`tabular-nums ${textColor}`}>{value}</span>
      {sublabel ? (
        <span className={`ml-1 ${sublabelColor} font-normal`}>{sublabel}</span>
      ) : null}
    </>
  );

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-default md:hidden">
              <Badge variant={variant as any} className={smallClass}>
                {left}
                <span
                  aria-hidden="true"
                  className={`mx-2 h-3.5 w-px ${dividerColor} inline-block`}
                />
                <span className={`tabular-nums ${textColor}`}>{value}</span>
                {sublabel ? (
                  <span className={`ml-1 ${sublabelColor} font-normal`}>
                    {sublabel}
                  </span>
                ) : null}
              </Badge>
            </span>
          </TooltipTrigger>
          {tooltip ? (
            <TooltipContent>
              <p>{tooltip}</p>
            </TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>

      <span className="hidden md:inline-flex cursor-default">
        <Badge variant={variant as any} className={largeClass}>
          {content}
        </Badge>
      </span>
    </>
  );
}

function useProfileBalance(
  address?: string,
  chainId?: number,
  collateralSymbol?: string
) {
  const collateralAssetAddress = DEFAULT_COLLATERAL_ASSET;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const effectiveSymbol = collateralSymbol ?? 'testUSDe';

  const { data: decimals } = useReadContract({
    abi: erc20Abi,
    address: collateralAssetAddress,
    functionName: 'decimals',
    chainId: effectiveChainId,
    query: { enabled: Boolean(address) },
  });

  const { data: balance } = useReadContract({
    abi: erc20Abi,
    address: collateralAssetAddress,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId: effectiveChainId,
    query: { enabled: Boolean(address) },
  });

  const memo = React.useMemo(() => {
    try {
      const dec =
        typeof decimals === 'number' ? decimals : Number(decimals ?? 18);
      if (balance === undefined || balance === null)
        return { display: '0', tooltip: `0 ${effectiveSymbol}` };
      const human = formatUnits(balance as unknown as bigint, dec);
      const num = Number(human);
      if (Number.isNaN(num))
        return { display: '0', tooltip: `0 ${effectiveSymbol}` };
      return {
        display: `${formatFiveSigFigs(num)}`,
        tooltip: `${num.toLocaleString()} ${effectiveSymbol}`,
      };
    } catch {
      return { display: '0', tooltip: `0 ${effectiveSymbol}` };
    }
  }, [balance, decimals, effectiveSymbol]);

  return memo;
}

function useProfileVolume(
  positions: PositionType[] | undefined,
  parlays: Parlay[] | undefined,
  address?: string
) {
  return React.useMemo(() => {
    try {
      let total = 0;
      const viewer = String(address || '').toLowerCase();
      // Markets volume: sum of absolute deltas of collateral per position (per-market decimals)
      for (const p of positions || []) {
        const txs = [...(p.transactions || [])].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        let lastCollateral = 0n;
        const dec = Number(p.market?.marketGroup?.collateralDecimals ?? 18);
        for (const t of txs) {
          const type = String(t.type);
          if (type === 'addLiquidity' || type === 'removeLiquidity') continue;
          const currentRaw = t.collateralTransfer?.collateral ?? t.collateral;
          let current = 0n;
          try {
            current = BigInt(currentRaw ?? '0');
          } catch {
            current = 0n;
          }
          const delta = current - lastCollateral;
          const abs = bigIntAbs(delta);
          lastCollateral = current;
          const human = Number(formatUnits(abs, dec));
          if (Number.isFinite(human)) total += human;
        }
      }

      // Parlays volume: add only the party matching this address; values are 18 decimals
      for (const parlay of parlays || []) {
        try {
          const makerIsUser =
            typeof parlay.maker === 'string' &&
            parlay.maker.toLowerCase() === viewer;
          const takerIsUser =
            typeof parlay.taker === 'string' &&
            parlay.taker.toLowerCase() === viewer;
          if (makerIsUser && parlay.makerCollateral) {
            const human = Number(
              formatUnits(BigInt(parlay.makerCollateral), 18)
            );
            if (Number.isFinite(human)) total += human;
          }
          if (takerIsUser && parlay.takerCollateral) {
            const human = Number(
              formatUnits(BigInt(parlay.takerCollateral), 18)
            );
            if (Number.isFinite(human)) total += human;
          }
        } catch {
          // ignore
        }
      }

      const value = total;
      return { value, display: formatFiveSigFigs(value) };
    } catch {
      return { value: 0, display: '0' };
    }
  }, [positions, parlays, address]);
}

function useFirstActivity(
  positions: PositionType[] | undefined,
  parlays: Parlay[] | undefined
) {
  return React.useMemo(() => {
    let earliest: Date | undefined;
    try {
      for (const p of positions || []) {
        for (const t of p.transactions || []) {
          const d = new Date(t.createdAt);
          if (!Number.isFinite(d.getTime())) continue;
          if (!earliest || d < earliest) earliest = d;
        }
      }
      for (const parlay of parlays || []) {
        const sec = Number(parlay.mintedAt);
        if (!Number.isFinite(sec)) continue;
        const d = new Date(sec * 1000);
        if (!earliest || d < earliest) earliest = d;
      }
    } catch {
      // ignore
    }

    if (!earliest)
      return {
        date: undefined,
        display: 'Never',
        tooltip: undefined,
        isNever: true,
      };

    const monthYear = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
    }).format(earliest);
    const full = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(earliest);
    return {
      date: earliest,
      display: monthYear,
      tooltip: full,
      isNever: false,
    };
  }, [positions, parlays]);
}

export type ProfileQuickMetricsProps = {
  address: string;
  forecastsCount: number;
  positions: PositionType[];
  parlays: Parlay[];
  className?: string;
};

export default function ProfileQuickMetrics({
  address,
  forecastsCount,
  positions,
  parlays,
  className,
}: ProfileQuickMetricsProps) {
  const chainId = useChainIdFromLocalStorage();
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';
  const balance = useProfileBalance(address, chainId, collateralSymbol);
  const volume = useProfileVolume(positions, parlays, address);
  const first = useFirstActivity(positions, parlays);
  const forecastsIsFinite = Number.isFinite(forecastsCount);
  const forecastsUnit = forecastsIsFinite
    ? forecastsCount === 1
      ? 'forecast'
      : 'forecasts'
    : undefined;

  // Fetch profit and accuracy data
  const { data: profit, isLoading: profitLoading } = useUserProfitRank(address);
  const { data: accuracy, isLoading: accuracyLoading } =
    useForecasterRank(address);

  const pnlValue = profitLoading
    ? '—'
    : formatFiveSigFigs(Number(profit?.totalPnL || 0));

  const pnlRank = profitLoading
    ? undefined
    : profit?.rank
      ? `${collateralSymbol} (Rank #${profit.rank})`
      : undefined;

  const accValue = accuracyLoading
    ? '—'
    : Number.isFinite(accuracy?.accuracyScore || 0)
      ? Math.round(accuracy?.accuracyScore || 0).toLocaleString('en-US')
      : '—';

  const accRank = accuracyLoading
    ? undefined
    : accuracy?.rank
      ? `(Rank #${accuracy.rank})`
      : undefined;

  // Show P&L and Accuracy if they have rankings
  const showPnl = !profitLoading && profit?.rank;
  const showAccuracy = !accuracyLoading && accuracy?.rank;

  return (
    <ul className={`flex flex-wrap items-center gap-4 ${className ?? ''}`}>
      {showPnl && (
        <li>
          <MetricBadge
            icon={<BarChart2 className="h-4 w-4 opacity-70" />}
            label="Realized PnL"
            value={pnlValue}
            sublabel={pnlRank}
            size="normal"
            highlighted
          />
        </li>
      )}
      {showAccuracy && (
        <li>
          <MetricBadge
            icon={<Target className="h-4 w-4 opacity-70" />}
            label="Accuracy Score"
            value={accValue}
            sublabel={accRank}
            size="normal"
            highlighted
          />
        </li>
      )}
      <li>
        <MetricBadge
          imageSrc="/usde.svg"
          label="Available Balance"
          value={balance.display}
          sublabel={collateralSymbol}
          tooltip={balance.tooltip}
          size="normal"
        />
      </li>
      <li>
        <MetricBadge
          icon={<TrendingUp className="h-4 w-4 opacity-70" />}
          label="Trading Volume"
          value={volume.display}
          sublabel={collateralSymbol}
          size="normal"
        />
      </li>
      <li>
        <MetricBadge
          icon={<Telescope className="h-4 w-4 opacity-70" />}
          label="Forecasts"
          value={forecastsIsFinite ? forecastsCount : '—'}
          sublabel={forecastsUnit}
          size="normal"
        />
      </li>
      <li>
        <MetricBadge
          icon={<Calendar className="h-3.5 w-3.5 opacity-70" />}
          label="Started"
          value={first.display}
          tooltip={first.tooltip}
          muted={first.isNever}
          size="normal"
        />
      </li>
    </ul>
  );
}
