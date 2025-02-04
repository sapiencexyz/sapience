import { useFoil } from '../../lib/context/FoilProvider';
import { useSettlementPrice } from '~/lib/hooks/useSettlementPrice';

import type { SettlementPriceCellProps } from './types';

const SettlementPriceCell = ({ market, epoch }: SettlementPriceCellProps) => {
  const { stEthPerToken } = useFoil();
  const { latestPrice, priceAdjusted, sqrtPriceX96, isLoading } =
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

export default SettlementPriceCell;
