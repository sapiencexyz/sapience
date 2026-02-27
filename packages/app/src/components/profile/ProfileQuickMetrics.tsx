'use client';

import * as React from 'react';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

import type { LegacyPosition as Position } from '@sapience/sdk/queries';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { useUserProfitRank } from '~/hooks/graphql/useUserProfitRank';
import { useForecasterRank } from '~/hooks/graphql/useForecasterRank';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';

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
      return { display: '0.00', tooltip: `0 ${effectiveSymbol}` };
    }
    return {
      display: balance.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
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
      month: 'short',
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
  const chainId = DEFAULT_CHAIN_ID;
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';
  const balance = useProfileBalance(address, chainId, collateralSymbol);
  const volume = useProfileVolume(address);
  const first = useFirstActivity(positions);
  // Fetch profit and accuracy data
  const { data: profit, isLoading: profitLoading } = useUserProfitRank(address);
  const { data: accuracy, isLoading: accuracyLoading } =
    useForecasterRank(address);

  const pnlNumber = Number(profit?.totalPnL || 0);

  const accValue = accuracyLoading
    ? '—'
    : Number.isFinite(accuracy?.accuracyScore || 0)
      ? Math.round(accuracy?.accuracyScore || 0).toLocaleString('en-US')
      : '—';

  // Show P&L and Accuracy if they have rankings
  const showPnl = !profitLoading && profit?.rank;
  const showAccuracy = !accuracyLoading && accuracy?.rank;

  type Metric = { label: string; value: React.ReactNode; sublabel?: string };

  // Box 1: Volume metrics (only if volume > 0)
  const volumeMetrics: Metric[] = [];
  if (volume.value > 0) {
    if (showPnl) {
      volumeMetrics.push(
        {
          label: 'Profit/Loss',
          value: profitLoading ? '—' : <NumberDisplay value={pnlNumber} />,
          sublabel: collateralSymbol,
        },
        {
          label: 'Profit Rank',
          value: profitLoading ? '—' : `#${profit?.rank}`,
        }
      );
    }
    volumeMetrics.push({
      label: 'Volume',
      value: volume.display,
      sublabel: collateralSymbol,
    });
  }

  // Box 2: Forecasts + Accuracy (only if forecasts > 0)
  const forecastMetrics: Metric[] = [];
  if (forecastsCount > 0) {
    if (showAccuracy) {
      forecastMetrics.push(
        {
          label: 'Accuracy',
          value: accValue,
        },
        {
          label: 'Accuracy Rank',
          value: accuracyLoading ? '—' : `#${accuracy?.rank}`,
        }
      );
    }
    forecastMetrics.push({
      label: 'Forecasts',
      value: forecastsCount.toLocaleString('en-US'),
    });
  }

  // Box 3: Balance (always renders)
  const balanceMetrics: Metric[] = [
    {
      label: 'Available Balance',
      value: balance.display,
      sublabel: collateralSymbol,
    },
  ];
  if (!first.isNever) {
    balanceMetrics.push({
      label: 'Started',
      value: first.display,
    });
  }

  const boxes = [volumeMetrics, forecastMetrics, balanceMetrics].filter(
    (b) => b.length > 0
  );

  const MetricItem = ({ m }: { m: Metric }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
        {m.label}
      </span>
      <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
        {m.value}
        {m.sublabel ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {m.sublabel}
          </span>
        ) : null}
      </span>
    </div>
  );

  return (
    <div
      className={`flex flex-col md:flex-row flex-wrap items-start gap-3 md:gap-6 ${className ?? ''}`}
    >
      {boxes.map((box, bi) => (
        <div
          key={bi}
          className="flex items-center gap-4 md:gap-6 rounded-md border border-border bg-brand-black px-4 md:px-5 py-3"
        >
          {box.map((m, i) => (
            <React.Fragment key={m.label}>
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="h-8 w-px bg-muted-foreground/30"
                />
              )}
              <MetricItem m={m} />
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
