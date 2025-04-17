import { useFoil } from '../../lib/context/FoilProvider';
import { useSettlementPrice } from '~/lib/hooks/useSettlementPrice';

import type { SettlementPriceCellProps } from './types';

const SettlementPriceCell = ({
  marketGroup: market,
  market: epoch,
}: SettlementPriceCellProps) => {
  const { stEthPerToken } = useFoil();
  const { latestPrice, priceAdjusted, sqrtPriceX96, isLoading } =
    useSettlementPrice(market, epoch);

  if (isLoading) {
    return <span>Loading...</span>;
  }

  const now = Math.floor(Date.now() / 1000);
  if (now < epoch.endTimestamp) {
    return <i>Period in progress</i>;
  }

  return (
    <>
      <div className="text-xs">Settlement Price (gwei): {latestPrice}</div>
      <div className="text-xs">wstETH Ratio: {stEthPerToken}</div>
      <div className="text-xs">
        Adjusted Price (wstETH/Ggas): {priceAdjusted}
      </div>
      <div className="text-xs">SqrtPriceX96: {sqrtPriceX96.toString()}</div>
    </>
  );
};

export default SettlementPriceCell;
