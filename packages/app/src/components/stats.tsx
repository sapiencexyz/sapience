/* eslint-disable sonarjs/no-duplicate-string */
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { BookTextIcon, InfoIcon } from 'lucide-react';
import { useContext } from 'react';
import { formatUnits } from 'viem';

import type { MarketGroup } from '~/lib/context/FoilProvider';
import { useFoil } from '~/lib/context/FoilProvider';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { useLatestIndexPrice } from '~/lib/hooks/useResources';

import NumberDisplay from './numberDisplay';

interface StatBoxProps {
  title: string;
  tooltipContent?: React.ReactNode;
  value: React.ReactNode;
  docsLink?: boolean;
}

const StatBox = ({ title, tooltipContent, value, docsLink }: StatBoxProps) => (
  <div className="rounded-sm border border-border p-2.5 md:py-4 md:px-6 shadow-sm text-xs md:text-base">
    <div>
      {title}
      {tooltipContent && (
        <Tooltip>
          <TooltipTrigger className="cursor-default">
            <InfoIcon className="md:ml-1 -translate-y-0.5 inline-block h-3 md:h-4 opacity-60 hover:opacity-80" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] text-center p-3">
            {tooltipContent}
            {docsLink && (
              <a
                href="https://docs.foil.xyz/price-glossary"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-blue-500 hover:text-blue-600 ml-1 -translate-y-0.5"
              >
                <BookTextIcon className="h-3.5 w-3.5 inline-block" />
              </a>
            )}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
    <div className="mt-0.5 text-sm md:text-2xl font-bold">{value}</div>
  </div>
);

const IndexPriceDisplay = ({
  isBeforeStart,
  startTimeRelative,
  isLoadingIndexPrice,
  marketGroup,
  latestIndexPrice,
  useMarketUnits,
  stEthPerToken,
  unitDisplay,
}: {
  isBeforeStart: boolean;
  startTimeRelative: string;
  isLoadingIndexPrice: boolean;
  marketGroup: MarketGroup;
  latestIndexPrice: any;
  useMarketUnits: boolean;
  stEthPerToken: number | undefined;
  unitDisplay: string;
}) => {
  if (isBeforeStart) {
    return (
      <>
        <span className="text-sm">available in</span> {startTimeRelative}
      </>
    );
  }

  if (isLoadingIndexPrice || !marketGroup) {
    return <span>Loading...</span>;
  }

  const value = useMarketUnits
    ? Number(formatUnits(BigInt(latestIndexPrice?.value || 0), 9)) /
      ((stEthPerToken || 1e9) / 1e9)
    : Number(formatUnits(BigInt(latestIndexPrice?.value || 0), 9));

  return (
    <>
      <NumberDisplay value={value} />{' '}
      <span className="text-sm">{unitDisplay}</span>
    </>
  );
};

const Stats = () => {
  const {
    endTime,
    startTime,
    pool,
    liquidity,
    useMarketUnits,
    marketGroup,
    resource,
    unitDisplay,
    valueDisplay,
  } = useContext(PeriodContext);
  const { stEthPerToken } = useFoil();
  const { data: latestIndexPrice, isLoading: isLoadingIndexPrice } =
    useLatestIndexPrice(
      marketGroup
        ? {
            address: marketGroup.address,
            chainId: marketGroup.chainId,
            marketId: marketGroup.currentMarket!.marketId,
          }
        : {
            address: '',
            chainId: 0,
            marketId: 0,
          }
    );

  const resourceName = resource?.name?.toLowerCase() || 'resource';

  const currentTime = Math.floor(Date.now() / 1000);
  const isBeforeStart = startTime > currentTime;

  const getRelativeTime = () => {
    if (!endTime) return '';
    const dateMilliseconds = Number(endTime) * 1000;
    const endDate = new Date(dateMilliseconds);
    const currentDate = new Date();
    return endDate < currentDate ? 'Expired' : formatDistanceToNow(endDate);
  };

  const startTimeRelative = isBeforeStart
    ? formatDistanceToNow(new Date(startTime * 1000))
    : '';

  const isCumulative = marketGroup?.isCumulative;
  const gridColsClass = isCumulative
    ? 'grid-cols-1 md:grid-cols-3'
    : 'grid-cols-1 md:grid-cols-4';

  return (
    <TooltipProvider>
      <div className="flex w-full flex-col items-center pb-5">
        <div className={`grid w-full gap-3 ${gridColsClass}`}>
          <StatBox
            title="Index Price"
            tooltipContent={`The estimated settlement price based on the average ${resourceName} price for this period`}
            docsLink
            value={
              <IndexPriceDisplay
                isBeforeStart={isBeforeStart}
                startTimeRelative={startTimeRelative}
                isLoadingIndexPrice={isLoadingIndexPrice}
                marketGroup={marketGroup!}
                latestIndexPrice={latestIndexPrice}
                useMarketUnits={useMarketUnits}
                stEthPerToken={stEthPerToken}
                unitDisplay={unitDisplay()}
              />
            }
          />

          <StatBox
            title="Market Price"
            tooltipContent="The current price available from the liquidity pool"
            docsLink
            value={
              <>
                <NumberDisplay
                  value={valueDisplay(
                    Number(pool?.token0Price.toSignificant(18) || 0),
                    stEthPerToken
                  )}
                />{' '}
                <span className="text-sm">{unitDisplay()}</span>
              </>
            }
          />

          {!isCumulative && (
            <StatBox
              title="Liquidity"
              tooltipContent="The largest long position that can be opened right now"
              value={
                <>
                  <NumberDisplay value={liquidity} />{' '}
                  <span className="text-sm">{unitDisplay(false)}</span>
                </>
              }
            />
          )}

          <StatBox title="Ends in" value={getRelativeTime()} />
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Stats;
