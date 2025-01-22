import type React from 'react';

import { useSettlementPrice } from '~/lib/hooks/useSettlementPrice';

import type { SettlementPriceCellProps } from './types';

export const SettlementPriceCell: React.FC<SettlementPriceCellProps> = ({
  market,
  epoch,
}) => {
  const { latestPrice, stEthPerToken, priceAdjusted, sqrtPriceX96, isLoading } =
    useSettlementPrice(market, epoch);

  if (isLoading) {
    return <span>Loading...</span>;
  }

  return (
    <>
      <div className="text-xs">Latest Price: {latestPrice}</div>
      <div className="text-xs">wstETH Ratio: {stEthPerToken}</div>
      <div className="text-xs">Adjusted Price: {priceAdjusted}</div>
      <div className="text-xs">SqrtPriceX96: {sqrtPriceX96.toString()}</div>
    </>
  );
};
