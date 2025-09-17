import type { MarketGroupType, MarketType } from '@sapience/ui/types';

import type { MarketGroupClassification } from '~/lib/types';
import EndTimeDisplay from '~/components/shared/EndTimeDisplay';
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

  return (
    <div className="w-full py-6 px-4 md:px-3 lg:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl md:text-4xl font-normal mb-1 leading-tight flex items-center gap-2.5">
          {displayQuestion}
        </h1>
        <div className="flex items-center gap-3 md:gap-6">
          <EndTimeDisplay endTime={activeMarket?.endTimestamp} size="large" />
        </div>
      </div>
    </div>
  );
};

export default MarketGroupHeader;
