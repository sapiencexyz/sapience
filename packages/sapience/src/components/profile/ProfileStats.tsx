'use client';

import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { cn } from '@sapience/ui/lib/utils';
import { BarChart2, Target } from 'lucide-react';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { useUserProfitRank } from '~/hooks/graphql/useUserProfitRank';
import { useForecasterRank } from '~/hooks/graphql/useForecasterRank';

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
    <Card className="border-border/70">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          {Icon ? (
            <Icon
              className="w-14 h-14 text-muted-foreground/50 shrink-0"
              strokeWidth={1.25}
            />
          ) : null}
          <div className="flex-1">
            <div className="text-xs md:text-sm text-muted-foreground font-medium mb-0.5">
              {label}
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-xl md:text-2xl font-heading font-normal">
                {value}
              </div>
              {sublabel ? (
                <div className="text-xs md:text-sm text-muted-foreground">
                  {sublabel}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ProfileStats = ({ address, className }: ProfileStatsProps) => {
  const { data: profit, isLoading: profitLoading } = useUserProfitRank(address);
  const { data: accuracy, isLoading: accuracyLoading } =
    useForecasterRank(address);

  const pnlValue = profitLoading ? (
    '—'
  ) : (
    <NumberDisplay
      value={Number(profit?.totalPnL || 0)}
      appendedText=" testUSDe"
    />
  );

  const pnlRank = profitLoading
    ? '—'
    : profit?.rank
      ? `Rank #${profit.rank} of ${profit.totalParticipants}`
      : 'Not ranked';

  const accValue = accuracyLoading
    ? '—'
    : Number.isFinite(accuracy?.accuracyScore || 0)
      ? Math.round(accuracy?.accuracyScore || 0).toLocaleString('en-US')
      : '—';

  const accRank = accuracyLoading
    ? '—'
    : accuracy?.rank
      ? `Rank #${accuracy.rank} of ${accuracy.totalForecasters}`
      : 'Not ranked';

  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 my-4 md:my-6',
        className
      )}
    >
      <StatTile
        label="Realized Profit/Loss"
        value={pnlValue}
        sublabel={pnlRank}
        Icon={BarChart2}
      />
      <StatTile
        label="Accuracy Score"
        value={accValue}
        sublabel={accRank}
        Icon={Target}
      />
    </div>
  );
};

export default ProfileStats;
