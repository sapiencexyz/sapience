'use client';

import Image from 'next/image';
import * as React from 'react';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  Calendar,
  TrendingUp,
  Telescope,
  BarChart2,
  Target,
} from 'lucide-react';

import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';

import { formatFiveSigFigs } from '~/lib/utils/util';
import type { Position } from '~/hooks/graphql/useUserPositions';
import { useUserProfitRank } from '~/hooks/graphql/useUserProfitRank';
import { useForecasterRank } from '~/hooks/graphql/useForecasterRank';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
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
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;

  const { balance, symbol } = useCollateralBalance({
    address: address as `0x${string}` | undefined,
    chainId: effectiveChainId,
    enabled: Boolean(address),
  });

  const memo = React.useMemo(() => {
    const effectiveSymbol = collateralSymbol ?? symbol;
    if (balance === 0) {
      return { display: '0', tooltip: `0 ${effectiveSymbol}` };
    }
    return {
      display: `${formatFiveSigFigs(balance)}`,
      tooltip: `${balance.toLocaleString()} ${effectiveSymbol}`,
    };
  }, [balance, symbol, collateralSymbol]);

  return memo;
}

import { useProfileVolume } from '~/hooks/useProfileVolume';

function useFirstActivity(positions: Position[] | undefined) {
  return React.useMemo(() => {
    let earliest: Date | undefined;
    try {
      for (const position of positions || []) {
        const sec = Number(position.mintedAt);
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
  }, [positions]);
}

type ProfileQuickMetricsProps = {
  address: string;
  forecastsCount: number;
  positions: Position[];
  className?: string;
};

export default function ProfileQuickMetrics({
  address,
  forecastsCount,
  positions,
  className,
}: ProfileQuickMetricsProps) {
  const chainId = useChainIdFromLocalStorage();
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';
  const balance = useProfileBalance(address, chainId, collateralSymbol);
  const volume = useProfileVolume(positions, address);
  const first = useFirstActivity(positions);
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
    : Number(profit?.totalPnL || 0).toFixed(2);

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
