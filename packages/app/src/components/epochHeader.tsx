import { format } from 'date-fns';
import { MoveHorizontal, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { useContext } from 'react';
import { FaRegChartBar, FaCubes, FaRegCalendar } from 'react-icons/fa';
import { IoDocumentTextOutline } from 'react-icons/io5';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { useMarketList } from '~/lib/context/MarketListProvider';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { useResources } from '~/lib/hooks/useResources';
import { tickToPrice, convertWstEthToGwei } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';

const EpochHeader = () => {
  const {
    chain,
    address,
    collateralAsset,
    startTime,
    endTime,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    useMarketUnits,
    stEthPerToken,
  } = useContext(PeriodContext);
  const { markets } = useMarketList();
  const { data: resources } = useResources();

  const currentMarket = markets.find(
    (market) => market.address.toLowerCase() === address.toLowerCase()
  );

  const resource = resources?.find(
    (r) => r.name === currentMarket?.resource?.name
  );

  let endTimeString = '';
  let startTimeString = '';
  let startTimeTooltip = '';
  let endTimeTooltip = '';
  if (startTime) {
    const dateMilliseconds = Number(startTime) * 1000;
    const date = new Date(dateMilliseconds);
    startTimeString = format(date, 'MMMM do');
    startTimeTooltip = format(date, 'MMMM do, yyyy h:mm a (O)');
  }
  if (endTime) {
    const dateMilliseconds = Number(endTime) * 1000;
    const date = new Date(dateMilliseconds);
    endTimeString = format(date, 'MMMM do');
    endTimeTooltip = format(date, 'MMMM do, yyyy h:mm a (O)');
  }

  const minPrice = useMarketUnits
    ? tickToPrice(baseAssetMinPriceTick)
    : convertWstEthToGwei(tickToPrice(baseAssetMinPriceTick), stEthPerToken);

  const maxPrice = useMarketUnits
    ? tickToPrice(baseAssetMaxPriceTick)
    : convertWstEthToGwei(tickToPrice(baseAssetMaxPriceTick), stEthPerToken);

  return (
    <div className="flex items-center flex-col w-full">
      <div className="w-full items-center flex flex-col lg:flex-row px-3 py-6">
        <div className="w-full lg:w-auto flex justify-between lg:justify-start items-center">
          <h1 className="text-3xl font-semibold mb-0 flex items-center gap-2">
            {resource?.iconPath && (
              <Image
                src={resource.iconPath}
                alt={resource?.name || ''}
                width={32}
                height={32}
              />
            )}
            {resource?.name} Market
          </h1>
        </div>

        <div className="flex flex-col lg:flex-row items-start lg:items-center mt-4 lg:mt-0 mb-0 lg:ml-auto lg:flex-1 w-full">
          <div className="flex flex-wrap gap-y-2 gap-x-4 lg:gap-x-6 lg:justify-end w-full lg:pr-2">
            <a
              className="hover:no-underline inline-flex items-center"
              target="_blank"
              rel="noopener noreferrer"
              href={`${chain?.blockExplorers?.default.url}/address/${address}`}
            >
              <span className="inline-block mr-1.5">
                <IoDocumentTextOutline />
              </span>
              <span className="border-b border-dotted border-current font-medium">
                Smart Contract
              </span>
            </a>

            <a
              className="hover:no-underline inline-flex items-center"
              target="_blank"
              rel="noopener noreferrer"
              href={`${chain?.blockExplorers?.default.url}/address/${collateralAsset}`}
            >
              <span className="inline-block mr-1.5">
                <FaCubes />
              </span>
              <span className="border-b border-dotted border-current font-medium">
                Collateral Token
              </span>
            </a>

            <div className="inline-flex items-center">
              <span className="inline-block mr-1.5">
                <FaRegChartBar />
              </span>
              <span className="font-medium mr-1">Market Price Range:</span>
              <NumberDisplay value={minPrice} />
              <MoveHorizontal className="w-3 h-3 mx-1" />
              <NumberDisplay value={maxPrice} />
              <span className="ml-1">
                {useMarketUnits ? 'Ggas/wstETH' : 'gwei'}
              </span>
            </div>

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
          </div>
        </div>
      </div>
    </div>
  );
};

export default EpochHeader;
