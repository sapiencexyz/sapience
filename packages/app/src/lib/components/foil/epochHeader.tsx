/* eslint-disable sonarjs/no-duplicate-string */
import { format, formatDistanceToNow } from 'date-fns';
import React, { useContext } from 'react';
import { FaRegChartBar, FaCubes, FaRegCalendar } from 'react-icons/fa';
import { IoDocumentTextOutline } from 'react-icons/io5';

import { useMarketList } from '~/lib/context/MarketListProvider';
import { MarketContext } from '~/lib/context/MarketProvider';
import { tickToPrice } from '~/lib/util/util';

import EpochSelector from './epochSelector';

const EpochHeader = () => {
  const { chain, address, collateralAsset, epochParams, startTime, endTime } =
    useContext(MarketContext);
  const { markets } = useMarketList();

  const currentMarket = markets.find((market) => market.address === address);

  let relativeTime = '';
  let formattedTime = '';
  let endTimeString = '';
  let startTimeString = '';
  if (startTime) {
    const dateMilliseconds = Number(startTime) * 1000;
    const date = new Date(dateMilliseconds);
    startTimeString = format(date, 'PPpp');
  }
  if (endTime) {
    const dateMilliseconds = Number(endTime) * 1000;
    const date = new Date(dateMilliseconds);
    relativeTime = formatDistanceToNow(date);
    formattedTime = format(date, 'PPpp');
    endTimeString = format(date, 'PPpp');
  }

  return (
    <div className="flex items-center flex-col w-full">
      <div className="w-full items-start flex flex-col lg:flex-row px-6 py-4">
        <h1 className="text-2xl font-bold mb-0 self-start lg:self-end">
          {currentMarket ? currentMarket.name : 'Market Name Not Found'}
        </h1>
        <div className="mt-2">
          <EpochSelector />
        </div>

        <div className="flex flex-col items-start lg:items-end mt-4 lg:mt-auto mb-0 lg:mb-1 lg:ml-auto w-full lg:w-auto">
          <div className="flex flex-wrap gap-2 lg:gap-6">
            <a
              className="text-sm text-gray-800 hover:no-underline inline-flex items-center"
              target="_blank"
              rel="noopener noreferrer"
              href={`${chain?.blockExplorers?.default.url}/address/${address}`}
            >
              <span className="inline-block mr-1">
                <IoDocumentTextOutline />
              </span>
              <span className="border-b border-dotted border-current font-medium">
                Contract
              </span>
            </a>

            <a
              className="text-sm text-gray-800 hover:no-underline inline-flex items-center"
              target="_blank"
              rel="noopener noreferrer"
              href={`${chain?.blockExplorers?.default.url}/address/${collateralAsset}`}
            >
              <span className="inline-block mr-1">
                <FaCubes />
              </span>
              <span className="border-b border-dotted border-current font-medium">
                Collateral
              </span>
            </a>

            <div className="inline-flex items-center text-sm">
              <span className="inline-block mr-1">
                <FaRegChartBar />
              </span>
              <span className="font-medium mr-1">Contract Price Range:</span>
              {tickToPrice(epochParams.baseAssetMinPriceTick).toLocaleString()}-
              {tickToPrice(epochParams.baseAssetMaxPriceTick).toLocaleString()}{' '}
              Ggas/wstETH
            </div>

            <div className="inline-flex items-center text-sm">
              <span className="inline-block mr-1">
                <FaRegCalendar className="opacity-80" />
              </span>
              <span className="font-medium mr-1">Period:</span>
              {startTimeString} - {endTimeString}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EpochHeader;
