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

export const getTokenAmountLimit = (
  size: bigint,
  slippage: number,
  refPrice: bigint,
  decimals: number,
  isShort?: boolean
): bigint => {
  console.log('size -', size);
  console.log('ref price -', refPrice);
  console.log('slippage -', slippage);

  const nonBigIntSize = formatUnits(size, decimals);
  const nonBigIntRefPrice = formatUnits(refPrice, decimals);
  const slippageMultiplier = isShort
    ? 1 - (slippage * 10) / 100
    : 1 + (slippage * 10) / -100;
  const tokenAmountLimit: number =
    Number(nonBigIntSize) * Number(nonBigIntRefPrice) * slippageMultiplier;

  console.log('nonBigIntSize- ', nonBigIntSize);
  console.log('nonBigIntRefPrice =', nonBigIntRefPrice);
  console.log('slippageMultiplier-', slippageMultiplier);
  console.log('tokenAmountLimit', tokenAmountLimit);

  return parseUnits(tokenAmountLimit.toString(), decimals);
};
