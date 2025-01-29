/* eslint-disable sonarjs/no-duplicate-string */
import { formatDistanceToNow } from 'date-fns';
import { BookTextIcon, InfoIcon } from 'lucide-react';
import { useContext } from 'react';

import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { convertGgasPerWstEthToGwei } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';

const Stats = () => {
  const {
    endTime,
    startTime,
    averagePrice,
    pool,
    liquidity,
    useMarketUnits,
    stEthPerToken,
  } = useContext(PeriodContext);

  const now = Math.floor(Date.now() / 1000);
  const isBeforeStart = startTime > now;

  let relativeTime = '';
  if (endTime) {
    const dateMilliseconds = Number(endTime) * 1000;
    const date = new Date(dateMilliseconds);
    const now = new Date();
    relativeTime = date < now ? 'Expired' : formatDistanceToNow(date);
  }

  const startTimeRelative = isBeforeStart
    ? formatDistanceToNow(new Date(startTime * 1000))
    : '';

  return (
    <TooltipProvider>
      <div className="flex w-full flex-col items-center pb-5">
        <div className="grid w-full md:grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-sm border border-border py-4 px-6 shadow-sm">
            <div>
              Index Price
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="ml-1 -translate-y-0.5 inline-block h-4 opacity-60 hover:opacity-80" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[225px] text-center p-3">
                  The estimated settlement price based on the average resource
                  price for this period{' '}
                  <a
                    href="https://docs.foil.xyz/price-glossary"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-blue-500 hover:text-blue-600 ml-0.5 -translate-y-0.5"
                  >
                    <BookTextIcon className="h-3.5 w-3.5 inline-block" />
                  </a>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-0.5 text-2xl font-bold">
              {isBeforeStart ? (
                <>
                  <span className="text-sm">available in</span>{' '}
                  {startTimeRelative}
                </>
              ) : (
                <>
                  <NumberDisplay
                    value={
                      useMarketUnits
                        ? averagePrice
                        : convertGgasPerWstEthToGwei(
                            averagePrice,
                            stEthPerToken
                          )
                    }
                  />{' '}
                  <span className="text-sm">
                    {useMarketUnits ? 'Ggas/wstETH' : 'gwei'}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-sm border border-border py-4 px-6 shadow-sm">
            <div>
              Market Price
              <Tooltip>
                <TooltipTrigger className="cursor-default">
                  <InfoIcon className="ml-1 -translate-y-0.5 inline-block h-4 opacity-60 hover:opacity-80" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[225px] text-center p-3">
                  The current price available from the liquidity pool{' '}
                  <a
                    href="https://docs.foil.xyz/price-glossary"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-blue-500 hover:text-blue-600 ml-0.5 -translate-y-0.5"
                  >
                    <BookTextIcon className="h-3.5 w-3.5 inline-block" />
                  </a>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-0.5 text-2xl font-bold">
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

          <div className="rounded-sm border border-border py-4 px-6 shadow-sm">
            <div>
              Liquidity
              <Tooltip>
                <TooltipTrigger className="cursor-default">
                  <InfoIcon className="ml-1 -translate-y-0.5 inline-block h-4 opacity-60 hover:opacity-80" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[225px] text-center p-3">
                  The largest long position that can be opened currently
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-0.5 text-2xl font-bold">
              <NumberDisplay value={liquidity} />{' '}
              <span className="text-sm">Ggas</span>
            </div>
          </div>

          <div className="rounded-sm border border-border py-4 px-6 shadow-sm">
            <div>Ends in</div>
            <div className="mt-0.5 text-2xl font-bold">{relativeTime}</div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Stats;
