import { format } from 'date-fns';
import { MoveHorizontal, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { useContext } from 'react';
import { FaRegChartBar, FaCubes, FaRegCalendar } from 'react-icons/fa';
import { IoDocumentTextOutline } from 'react-icons/io5';
import { LiaRulerVerticalSolid } from 'react-icons/lia';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { useFoil } from '~/lib/context/FoilProvider';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { tickToPrice, convertGgasPerWstEthToGwei } from '~/lib/utils/util';

import NumberDisplay from './numberDisplay';

const PeriodHeader = () => {
  const { stEthPerToken } = useFoil();
  const {
    chain,
    address,
    collateralAsset,
    startTime,
    endTime,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    useMarketUnits,
    market,
    resource,
    unitDisplay,
  } = useContext(PeriodContext);
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

  const minPrice =
    useMarketUnits || market?.isCumulative
      ? tickToPrice(baseAssetMinPriceTick)
      : convertGgasPerWstEthToGwei(
          tickToPrice(baseAssetMinPriceTick),
          stEthPerToken
        );

  const maxPrice =
    useMarketUnits || market?.isCumulative
      ? tickToPrice(baseAssetMaxPriceTick)
      : convertGgasPerWstEthToGwei(
          tickToPrice(baseAssetMaxPriceTick),
          stEthPerToken
        );

  const links = (
    <>
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
        <span className="inline-block mr-1">
          <LiaRulerVerticalSolid />
        </span>
        <span className="font-medium mr-1">Market Price Range:</span>
        <NumberDisplay value={minPrice} />
        <MoveHorizontal className="w-3 h-3 mx-1" />
        <NumberDisplay value={maxPrice} />
        <span className="ml-1">{unitDisplay}</span>
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

      <div className="inline-flex items-center">
        <span className="inline-block mr-1.5">
          <FaRegChartBar />
        </span>
        <span className="font-medium mr-1">Market Type:</span>
        <span>
          {market?.isCumulative ? 'Cumulative Spent' : 'Average Price'}
        </span>
      </div>
    </>
  );

  return (
    <div className="w-full p-3 pt-6 pb-4 md:py-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold flex items-center gap-2.5">
            {resource?.iconPath && (
              <Image
                src={resource.iconPath}
                alt={resource?.name || ''}
                width={32}
                height={32}
                className="w-8 h-8  "
              />
            )}
            {resource?.name} Market
          </h1>
          <div className="flex flex-wrap gap-y-1.5 lg:gap-y-2 gap-x-3 lg:gap-x-6 text-xs sm:text-sm">
            {links}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PeriodHeader;
