/* eslint-disable sonarjs/no-duplicate-string */
import { format, formatDistanceToNow } from 'date-fns';
import React, { useContext } from 'react';
import { FaRegChartBar, FaCubes, FaRegCalendar } from 'react-icons/fa';
import { IoDocumentTextOutline } from 'react-icons/io5';

import { useMarketList } from '~/lib/context/MarketListProvider';
import { MarketContext } from '~/lib/context/MarketProvider';
import { tickToPrice } from '~/lib/util/util';

const EpochHeader = () => {
  const {
    chain,
    address,
    collateralAsset,
    startTime,
    endTime,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
  } = useContext(MarketContext);
  const { markets } = useMarketList();

  const currentMarket = markets.find(
    (market) => market.address.toLowerCase() === address.toLowerCase()
  );

  let relativeTime = '';
  let formattedTime = '';
  let endTimeString = '';
  let startTimeString = '';
  if (startTime) {
    const dateMilliseconds = Number(startTime) * 1000;
    const date = new Date(dateMilliseconds);
    startTimeString = format(date, 'M/d/yy h:mm a');
  }
  if (endTime) {
    const dateMilliseconds = Number(endTime) * 1000;
    const date = new Date(dateMilliseconds);
    relativeTime = formatDistanceToNow(date);
    formattedTime = format(date, 'M/d/yy h:mm a');
    endTimeString = format(date, 'M/d/yy h:mm a');
  }

  return (
    <div className="flex items-center flex-col w-full">
      <div className="w-full items-center flex flex-col lg:flex-row px-6 py-4">
        <div className="w-full lg:w-auto flex justify-between lg:justify-start items-center">
          <h1 className="text-3xl font-semibold mb-0">
            {currentMarket?.resource?.name || 'Name Not Found'}
          </h1>
        </div>

        <div className="flex flex-col lg:flex-row items-start lg:items-center mt-4 lg:mt-0 mb-0 lg:ml-auto lg:flex-1 w-full">
          <div className="flex flex-wrap gap-x-6 gap-y-2 lg:justify-end w-full">
            <a
              className="text-sm hover:no-underline inline-flex items-center"
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
              className="text-sm hover:no-underline inline-flex items-center"
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
              {tickToPrice(baseAssetMinPriceTick).toLocaleString()} -{' '}
              {tickToPrice(baseAssetMaxPriceTick).toLocaleString()} Ggas/wstETH
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
