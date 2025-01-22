/* eslint-disable sonarjs/no-duplicate-string */
import { formatDistanceToNow } from 'date-fns';
import { InfoIcon } from 'lucide-react';
import { useContext } from 'react';

import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { MarketContext } from '~/lib/context/MarketProvider';
import { convertGgasPerWstEthToGwei } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';

const Stats = () => {
  const {
    endTime,
    averagePrice,
    pool,
    liquidity,
    useMarketUnits,
    stEthPerToken,
  } = useContext(MarketContext);

  let relativeTime = '';
  if (endTime) {
    const dateMilliseconds = Number(endTime) * 1000;
    const date = new Date(dateMilliseconds);
    const now = new Date();
    relativeTime = date < now ? 'Expired' : formatDistanceToNow(date);
  }

  return (
    <TooltipProvider>
      <div className="flex w-full flex-col items-center pb-5">
        <div className="grid w-full grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-lg border border-border p-4 shadow-sm">
            <div className="text-md">
              Index Price
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="ml-1.5 -translate-y-0.5 inline-block h-4" />
                </TooltipTrigger>
                <TooltipContent>
                  Expected settlement price based on the current time-weighted
                  average underlying price for this epoch.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-1 text-2xl font-bold">
              <NumberDisplay
                value={
                  useMarketUnits
                    ? averagePrice
                    : convertGgasPerWstEthToGwei(averagePrice, stEthPerToken)
                }
              />{' '}
              <span className="text-sm">
                {useMarketUnits ? 'Ggas/wstETH' : 'gwei'}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4 shadow-sm">
            <div className="text-md">
              Market Price
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="ml-1.5 -translate-y-0.5 inline-block h-4" />
                </TooltipTrigger>
                <TooltipContent>
                  Current price in the Foil liquidity pool for this epoch.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-1 text-2xl font-bold">
              <NumberDisplay
                value={
                  useMarketUnits
                    ? pool?.token0Price.toSignificant(18) || 0
                    : convertGgasPerWstEthToGwei(
                        Number(pool?.token0Price.toSignificant(18) || 0),
                        stEthPerToken
                      )
                }
              />{' '}
              <span className="text-sm">
                {useMarketUnits ? 'Ggas/wstETH' : 'gwei'}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4 shadow-sm">
            <div className="text-md">
              Liquidity
              <InfoIcon className="ml-1.5 -translate-y-0.5 hidden h-4 text-gray-600" />
            </div>
            <div className="mt-1 text-2xl font-bold">
              <NumberDisplay value={liquidity} />{' '}
              <span className="text-sm">Ggas</span>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4 shadow-sm">
            <div className="text-md">Ends In</div>
            <div className="mt-1 text-2xl font-bold">{relativeTime}</div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Stats;
