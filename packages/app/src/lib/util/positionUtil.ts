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
  isShort?: boolean
): bigint => {
  console.log('size -', size);
  console.log('ref price -', refPrice);
  console.log('slippage -', slippage);

  const nonBigIntSize = formatUnits(size, 18);
  const nonBigIntRefPrice = formatUnits(refPrice, 18);
  const slippageMultiplier = isShort ? 1 + slippage / 100 : 1 - slippage / 100;
  const tokenAmountLimit =
    Number(nonBigIntSize) * Number(nonBigIntRefPrice) * slippageMultiplier;

  console.log('nonBigIntSize- ', nonBigIntSize);
  console.log('nonBigIntRefPrice =', nonBigIntRefPrice);
  console.log('slippageMultiplier-', slippageMultiplier);
  console.log('tokenAmountLimit', tokenAmountLimit);

  return parseUnits(tokenAmountLimit.toString(), 18);

  // const product = Number(nonBigIntSize) * Number(nonBigIntRefPrice);
  // const productBigInt = parseUnits(product.toString(), 18);
  // const slippageMaxDecimals = 2;
  // const multiplier = 10 ** slippageMaxDecimals;
  // const numerator = isShort
  //   ? BigInt(100 * multiplier) + BigInt(slippage * multiplier)
  //   : BigInt(100 * multiplier) - BigInt(slippage * multiplier);
  // const denominator = BigInt(100 * multiplier);
  // return (productBigInt * numerator) / denominator;
};
