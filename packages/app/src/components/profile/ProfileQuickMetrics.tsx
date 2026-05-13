'use client';

import * as React from 'react';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { useAccountStatsRank } from '~/hooks/graphql/useAccountStatsRank';
import { useAccountAccuracyRank } from '~/hooks/graphql/useAccountAccuracyRank';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { useProfileVolume } from '~/hooks/useProfileVolume';

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

type ProfileQuickMetricsProps = {
  address: string;
  forecastsCount: number;
  className?: string;
};

export default function ProfileQuickMetrics({
  address,
  forecastsCount,
  className,
}: ProfileQuickMetricsProps) {
  const chainId = DEFAULT_CHAIN_ID;
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';
  const balance = useProfileBalance(address, chainId, collateralSymbol);
  const volume = useProfileVolume(address);
  // All-time NET_PNL stats + rank for this address — single per-address resolver,
  // so the PnL cell renders for anyone with realized activity, not just the
  // leaderboard's top 100. Rank cell is gated separately on rank availability.
  const { data: profitStats, isLoading: profitLoading } =
    useAccountStatsRank(address);
  const { data: accuracy, isLoading: accuracyLoading } =
    useAccountAccuracyRank(address);

  // `netPnL` is wei (18 decimals) from the wire; convert for display.
  const pnlNumber = profitStats ? Number(profitStats.netPnL) / 1e18 : 0;
  const profitRank = profitStats?.rank ?? null;
  const hasProfitActivity = profitStats != null && pnlNumber !== 0;

  const accValue = accuracyLoading
    ? '—'
    : Number.isFinite(accuracy?.accuracyScore || 0)
      ? Math.round(accuracy?.accuracyScore || 0).toLocaleString('en-US')
      : '—';

  // Show PnL for anyone with non-zero realized PnL even if outside the ranked
  // set; show rank cell only when the address is actually ranked.
  const showPnl = !profitLoading && hasProfitActivity;
  const showProfitRank = !profitLoading && profitRank != null;
  const showAccuracy = !accuracyLoading && accuracy?.rank;

  type Metric = { label: string; value: React.ReactNode; sublabel?: string };

  // Box 1: Volume metrics (only if volume > 0)
  const volumeMetrics: Metric[] = [];
  if (volume.value > 0) {
    if (showPnl) {
      volumeMetrics.push({
        label: 'Profit/Loss',
        value: <NumberDisplay value={pnlNumber} />,
        sublabel: collateralSymbol,
      });
    }
    if (showProfitRank) {
      volumeMetrics.push({
        label: 'Profit Rank',
        value: `#${profitRank}`,
      });
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
