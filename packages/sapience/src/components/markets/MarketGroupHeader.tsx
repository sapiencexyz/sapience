import type { MarketGroupType, MarketType } from '@sapience/ui/types';
import { Badge } from '@sapience/ui/components/ui/badge';
import { formatDistanceToNow, fromUnixTime } from 'date-fns';

import type { MarketGroupClassification } from '~/lib/types';
import { getMarketHeaderQuestion } from '~/lib/utils/util';

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
  // Determine which question to display using the utility function
  const displayQuestion = getMarketHeaderQuestion(
    marketGroupData,
    activeMarket
  );

  const endTimeBadge = (() => {
    const endTime = activeMarket?.endTimestamp;
    if (typeof endTime !== 'number') {
      return null;
    }
    try {
      const date = fromUnixTime(endTime);
      const displayTime = formatDistanceToNow(date, { addSuffix: true });
      return <Badge>Ends {displayTime}</Badge>;
    } catch (_error) {
      return null;
    }
  })();

  return (
    <div className="w-full p-3 pt-6 pb-4 md:py-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl md:text-4xl font-normal mb-1 leading-tight flex items-center gap-2.5">
            {displayQuestion}
          </h1>
          {endTimeBadge && <div className="flex">{endTimeBadge}</div>}
        </div>
      </div>
    </div>
  );
};

export default MarketGroupHeader;
