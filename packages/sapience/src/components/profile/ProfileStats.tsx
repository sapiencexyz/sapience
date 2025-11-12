'use client';

import { Card, CardContent } from '@sapience/sdk/ui/components/ui/card';
import { cn } from '@sapience/sdk/ui/lib/utils';
import { BarChart2, Target } from 'lucide-react';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { useUserProfitRank } from '~/hooks/graphql/useUserProfitRank';
import { useForecasterRank } from '~/hooks/graphql/useForecasterRank';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';

interface ProfileStatsProps {
  address: string;
  className?: string;
}

const StatTile = ({
  label,
  value,
  sublabel,
  Icon,
}: {
  label: string;
  value: React.ReactNode;
  sublabel?: string;
  Icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) => {
  return (
    <Card className="bg-brand-black text-brand-white/90 border border-border w-full lg:w-auto">
      <CardContent className="py-3 px-3 lg:py-4 lg:px-4">
        <div className="flex items-center gap-3">
          {Icon ? (
            <Icon
              className="w-12 h-12 text-muted-foreground/50 shrink-0"
              strokeWidth={1.25}
            />
          ) : null}
          <div className="flex-1">
            <div className="text-sm text-muted-foreground font-medium mb-0.5">
              {label}
            </div>
            <div className="flex flex-row items-baseline gap-2">
              <div className="text-lg md:text-xl font-mono font-normal tabular-nums">
                {value}
              </div>
              {sublabel ? (
                <div className="text-sm text-muted-foreground">{sublabel}</div>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ProfileStats = ({ address, className }: ProfileStatsProps) => {
  const chainId = useChainIdFromLocalStorage();
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';
  const { data: profit, isLoading: profitLoading } = useUserProfitRank(address);
  const { data: accuracy, isLoading: accuracyLoading } =
    useForecasterRank(address);

  const pnlValue = profitLoading ? (
    '—'
  ) : (
    <NumberDisplay
      value={Number(profit?.totalPnL || 0)}
      appendedText={` ${collateralSymbol}`}
    />
  );

  const pnlRank = profitLoading
    ? '—'
    : profit?.rank
      ? `Rank #${profit.rank}`
      : 'Not ranked';

  const accValue = accuracyLoading
    ? '—'
    : Number.isFinite(accuracy?.accuracyScore || 0)
      ? Math.round(accuracy?.accuracyScore || 0).toLocaleString('en-US')
      : '—';

  const accRank = accuracyLoading
    ? '—'
    : accuracy?.rank
      ? `Rank #${accuracy.rank}`
      : 'Not ranked';

  // Hide boxes if they have no ranking
  const showPnl = !profitLoading && profit?.rank;
  const showAccuracy = !accuracyLoading && accuracy?.rank;

  // If both are hidden, return null or show nothing
  if (!showPnl && !showAccuracy) {
    return null;
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 lg:auto-cols-max lg:grid-flow-col gap-4',
        className
      )}
    >
      {showPnl && (
        <StatTile
          label="Realized Profit/Loss"
          value={pnlValue}
          sublabel={pnlRank}
          Icon={BarChart2}
        />
      )}
      {showAccuracy && (
        <StatTile
          label="Accuracy Score"
          value={accValue}
          sublabel={accRank}
          Icon={Target}
        />
      )}
    </div>
  );
};

export default ProfileStats;
