import { MoveHorizontal, TrendingUp, DollarSign } from 'lucide-react';
import { FaCubes } from 'react-icons/fa';
import { IoDocumentTextOutline } from 'react-icons/io5';
import { LiaRulerVerticalSolid } from 'react-icons/lia';
import * as chains from 'viem/chains';

import type { MarketType } from '@sapience/ui/types';
import NumberDisplay from '../shared/NumberDisplay';
import {
  useTotalVolume,
  useOpenInterest,
} from '~/hooks/graphql/useMarketGroups';
import type { MarketGroupClassification } from '~/lib/types';
import { tickToPrice } from '~/lib/utils/tickUtils';
import EndTimeDisplay from '~/components/shared/EndTimeDisplay';

interface MarketDataContract {
  marketId: bigint;
  startTime: bigint;
  endTime: bigint;
  pool: string;
  quoteToken: string;
  baseToken: string;
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
  collateralSymbol: string;
  minTick: number;
  maxTick: number;
}

const MarketHeader: React.FC<MarketHeaderProps> = ({
  marketData,
  chainId,
  marketAddress,
  collateralAssetAddress,
  baseTokenName,
  collateralSymbol,
  minTick,
  maxTick,
}) => {
  // Get chain information
  const chain = Object.values(chains).find((c) => c.id === chainId);

  // Fetch volume and open interest data
  const { data: totalVolume } = useTotalVolume({
    address: marketAddress,
    chainId,
    marketId: marketData?.marketId || 0,
  });

  const { data: openInterest } = useOpenInterest({
    address: marketAddress,
    chainId,
    marketId: marketData?.marketId || 0,
  });

  // Get price range from ticks
  const minPrice = minTick ? tickToPrice(minTick) : undefined;
  const maxPrice = maxTick ? tickToPrice(maxTick) : undefined;

  // Use collateral symbol for volume/open interest, base token for price ranges
  const collateralUnitDisplay = collateralSymbol || 'USD';
  const priceUnitDisplay = baseTokenName || 'USD';

  const links = (
    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5 items-start leading-6 sm:leading-5 sm:gap-y-5 sm:gap-x-4">
      {totalVolume !== null && totalVolume !== undefined && (
        <div className="inline-flex items-center">
          <span className="inline-block mr-1.5">
            <TrendingUp className="w-4 h-4 opacity-80" />
          </span>
          <span className="font-medium mr-1">Volume:</span>
          <NumberDisplay value={totalVolume} />
          <span className="ml-1">{collateralUnitDisplay}</span>
        </div>
      )}

      {openInterest !== null && openInterest !== undefined && (
        <div className="inline-flex items-center">
          <span className="inline-block mr-1">
            <DollarSign className="w-4 h-4 opacity-80" />
          </span>
          <span className="font-medium mr-1">Open Interest:</span>
          <NumberDisplay value={openInterest} />
          <span className="ml-1">{collateralUnitDisplay}</span>
        </div>
      )}

      <div className="inline-flex items-center gap-3">
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
      </div>

      {minPrice && maxPrice && (
        <div className="inline-flex items-center">
          <span className="inline-block mr-1">
            <LiaRulerVerticalSolid />
          </span>
          <span className="font-medium mr-1">Range:</span>
          <NumberDisplay value={minPrice} />
          <MoveHorizontal className="w-3 h-3 mx-1" />
          <NumberDisplay value={maxPrice} />
          <span className="ml-1">{priceUnitDisplay}</span>
        </div>
      )}
    </div>
  );

  const displayQuestion =
    marketData?.question ||
    `${marketData?.marketGroup?.resource?.name} Market ${marketData?.marketId}`;

  return (
    <div className="w-full pb-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-2 lg:gap-3">
          <h1 className="text-2xl md:text-4xl font-normal mb-0 leading-tight flex items-center gap-2.5">
            {displayQuestion}
          </h1>
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            {/* End Time Badge - Always on left/top */}
            <div className="flex-shrink-0">
              <EndTimeDisplay endTime={marketData?.endTimestamp} />
            </div>

            {/* Metadata Links - Right justified on large screens, stacked on mobile */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 text-sm items-start">
              {links}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketHeader;
