import { Badge } from '@foil/ui/components/ui/badge';
import type { MarketGroupType, MarketType } from '@foil/ui/types';
import { formatDistanceToNow, fromUnixTime } from 'date-fns';

import type { MarketGroupClassification } from '~/lib/types';

interface MarketGroupHeaderProps {
  marketGroupData: MarketGroupType;
  activeMarket: MarketType | undefined;
  chainId: number;
  marketClassification: MarketGroupClassification | undefined;
  chainShortName: string;
}

const MarketGroupHeader: React.FC<MarketGroupHeaderProps> = ({
  marketGroupData,
  activeMarket,
}) => {
  // Format end time for badge
  const endTimeBadge = (() => {
    const endTime = activeMarket?.endTimestamp;
    if (typeof endTime !== 'number') {
      return null;
    }

    try {
      const date = fromUnixTime(endTime);
      const displayTime = formatDistanceToNow(date, { addSuffix: true });
      return <Badge>Ends {displayTime}</Badge>;
    } catch (error) {
      console.error('Error formatting relative time:', error);
      return null;
    }
  })();

  return (
    <div className="w-full p-3 pt-6 pb-4 md:py-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl md:text-4xl font-normal mb-2 leading-tight flex items-center gap-2.5">
            {marketGroupData?.question ??
              `${marketGroupData?.resource?.name} Market`}
          </h1>
          <div className="flex flex-wrap gap-y-1.5 lg:gap-y-2 gap-x-3 lg:gap-x-6 text-xs sm:text-sm items-center">
            {endTimeBadge}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketGroupHeader;
