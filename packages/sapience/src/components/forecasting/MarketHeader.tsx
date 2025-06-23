import { Badge } from '@foil/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import type { MarketType } from '@foil/ui/types';
import { format, formatDistanceToNow, fromUnixTime } from 'date-fns';
import { MoveHorizontal, ArrowRight } from 'lucide-react';
import { FaCubes, FaRegCalendar } from 'react-icons/fa';
import { IoDocumentTextOutline } from 'react-icons/io5';
import { LiaRulerVerticalSolid } from 'react-icons/lia';
import * as chains from 'viem/chains';

import NumberDisplay from '../shared/NumberDisplay';
import type { MarketGroupClassification } from '~/lib/types';
import { tickToPrice } from '~/lib/utils/tickUtils';

interface MarketDataContract {
  epochId: bigint;
  startTime: bigint;
  endTime: bigint;
  pool: string;
  ethToken: string;
  gasToken: string;
  minPriceD18: bigint;
  maxPriceD18: bigint;
  baseAssetMinPriceTick: number;
  baseAssetMaxPriceTick: number;
  settled: boolean;
  settlementPriceD18: bigint;
  assertionId: `0x${string}`;
}

interface MarketHeaderProps {
  marketData: MarketType;
  marketContractData: MarketDataContract | undefined;
  chainId: number;
  marketAddress: string;
  marketClassification: MarketGroupClassification;
  collateralAssetAddress: string | undefined;
  baseTokenName: string;
  quoteTokenName: string;
  minTick: number;
  maxTick: number;
}

const MarketHeader: React.FC<MarketHeaderProps> = ({
  marketData,
  chainId,
  marketAddress,
  collateralAssetAddress,
  quoteTokenName,
  minTick,
  maxTick,
}) => {
  // Get chain information
  const chain = Object.values(chains).find((c) => c.id === chainId);

  // Format end time for badge
  const endTimeBadge = (() => {
    const endTime = marketData?.endTimestamp;
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

  // Format start and end times for period display
  let endTimeString = '';
  let startTimeString = '';
  let startTimeTooltip = '';
  let endTimeTooltip = '';

  if (marketData?.startTimestamp) {
    const dateMilliseconds = Number(marketData.startTimestamp) * 1000;
    const date = new Date(dateMilliseconds);
    startTimeString = format(date, 'MMMM do');
    startTimeTooltip = format(date, 'MMMM do, yyyy h:mm a (O)');
  }

  if (marketData?.endTimestamp) {
    const dateMilliseconds = Number(marketData.endTimestamp) * 1000;
    const date = new Date(dateMilliseconds);
    endTimeString = format(date, 'MMMM do');
    endTimeTooltip = format(date, 'MMMM do, yyyy h:mm a (O)');
  }

  // Get price range from ticks
  const minPrice = minTick ? tickToPrice(minTick) : undefined;
  const maxPrice = maxTick ? tickToPrice(maxTick) : undefined;

  const unitDisplay = quoteTokenName || 'USD';

  const links = (
    <>
      <a
        className="hover:no-underline inline-flex items-center"
        target="_blank"
        rel="noopener noreferrer"
        href={`${chain?.blockExplorers?.default.url}/address/${marketAddress}`}
      >
        <span className="inline-block mr-1.5">
          <IoDocumentTextOutline />
        </span>
        <span className="border-b border-dotted border-current font-medium">
          Smart Contract
        </span>
      </a>

      {collateralAssetAddress && (
        <a
          className="hover:no-underline inline-flex items-center"
          target="_blank"
          rel="noopener noreferrer"
          href={`${chain?.blockExplorers?.default.url}/address/${collateralAssetAddress}`}
        >
          <span className="inline-block mr-1.5">
            <FaCubes />
          </span>
          <span className="border-b border-dotted border-current font-medium">
            Collateral Token
          </span>
        </a>
      )}

      {minPrice && maxPrice && (
        <div className="inline-flex items-center">
          <span className="inline-block mr-1">
            <LiaRulerVerticalSolid />
          </span>
          <span className="font-medium mr-1">Market Price Range:</span>
          <NumberDisplay value={minPrice} />
          <MoveHorizontal className="w-3 h-3 mx-1" />
          <NumberDisplay value={maxPrice} />
          <span className="ml-1">{unitDisplay}</span>
        </div>
      )}

      {startTimeString && endTimeString && (
        <div className="inline-flex items-center">
          <span className="inline-block mr-1.5">
            <FaRegCalendar className="opacity-80" />
          </span>
          <span className="font-medium mr-1">Period:</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>{startTimeString}</TooltipTrigger>
              <TooltipContent>{startTimeTooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <ArrowRight className="w-3 h-3 mx-1" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>{endTimeString}</TooltipTrigger>
              <TooltipContent>{endTimeTooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </>
  );

  const displayQuestion =
    marketData?.question ||
    `${marketData?.marketGroup?.resource?.name} Market ${marketData?.marketId}`;

  return (
    <div className="w-full pt-6 pb-4 md:py-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl md:text-4xl font-normal mb-2 leading-tight flex items-center gap-2.5">
            {displayQuestion}
          </h1>
          <div className="flex flex-wrap gap-y-3 gap-x-3 lg:gap-x-6 text-xs sm:text-sm items-center">
            {endTimeBadge}
            {links}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketHeader;
