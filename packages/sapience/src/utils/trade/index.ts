import { MarketGroupClassification } from '~/lib/types';
import { YES_SQRT_PRICE_X96 } from '~/lib/utils/betslipUtils';

export const DEFAULT_SLIPPAGE = 0.5;

// Calculate collateral limit including slippage
// limitCollateral = maxCollateral * (1 + slippagePercent / 100)
export const calculateCollateralLimit = (
  amount: bigint,
  slippage: number
): bigint => {
  if (amount === BigInt(0)) return BigInt(0);
  // Use BigInt math to avoid floating point issues
  // Multiply slippage by 100 to get basis points, add to 10000 (100%)
  const slippageFactor = BigInt(10000 + Math.floor(slippage * 100));
  // Calculate limit = amount * (10000 + slippageBasisPoints) / 10000
  return (amount * slippageFactor) / BigInt(10000);
};

export function getPredictionValueByMarket(
  marketClassification: MarketGroupClassification | undefined,
  wagerAmount: string | number
) {
  let marketValue: string | number;
  switch (marketClassification) {
    case MarketGroupClassification.YES_NO:
      marketValue =
        wagerAmount === YES_SQRT_PRICE_X96 || wagerAmount == Number(1)
          ? 1
          : 0.0000009;
      break;
    case MarketGroupClassification.MULTIPLE_CHOICE:
      marketValue = 1; // 1 for YES
      break;
    case MarketGroupClassification.NUMERIC:
      marketValue = Number(wagerAmount);
      break;
    default:
      marketValue = 1;
  }

  return marketValue;
}

export function getWagerAmountWithSlippage(
  wagerAmount: string,
  slippage: number = DEFAULT_SLIPPAGE
) {
  return (Number(wagerAmount) * (1 + slippage / 100)).toString();
  //return (Number(wagerAmount) * (1 + slippage)).toString();
}
