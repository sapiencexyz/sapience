import { formatUnits, parseUnits } from 'viem';

/**
 * Calculate the new liquidity of a position after depositing collateral
 * @param depositAmount - the amount of collateral to deposit
 * @param positionCollateralAmount - the amount of collateral in the position
 * @param collateralAssetDecimals  - the number of decimals of the collateral asset
 * @param liquidity - the current liquidity of the position
 * @returns the new liquidity of the position
 */
export const getNewLiquidity = (
  depositAmount: number,
  positionCollateralAmount: number,
  collateralAssetDecimals: number,
  liquidity: bigint
): bigint => {
  const depositAmountBigInt = parseUnits(
    depositAmount.toString(),
    collateralAssetDecimals
  );
  const positionCollateralAmountBigInt: bigint = parseUnits(
    positionCollateralAmount.toString(),
    collateralAssetDecimals
  );

  const newLiquidity: bigint =
    (liquidity * depositAmountBigInt) / positionCollateralAmountBigInt;
  return newLiquidity;
};
