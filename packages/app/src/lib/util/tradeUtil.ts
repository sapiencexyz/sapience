import { formatUnits, parseUnits } from 'viem';

export const formatBalance = (
  collateralAssetDecimals: number,
  balance: bigint
) => {
  return Number(formatUnits(balance, collateralAssetDecimals)).toFixed(4);
};

export const calculateCollateralDeltaLimit = (
  collateralAssetDecimals: number,
  collateralDelta: bigint,
  slippage: number,
  refPrice: string | undefined,
  isShort?: boolean
) => {
  const MIN_REF_PRICE = 1e-12;
  if (!refPrice || parseFloat(refPrice) < MIN_REF_PRICE) {
    // Fallback to the original calculation if refPrice is not available or is too low
    return (
      (collateralDelta * BigInt(Math.floor((100 + slippage) * 100))) /
      BigInt(10000)
    );
  }
  const collateralDeltaInt = parseFloat(
    formatUnits(collateralDelta, collateralAssetDecimals)
  );
  const slippageFactor: number = isShort
    ? 1 - slippage / 100
    : 1 + slippage / 100;

  const cdl: number =
    collateralDeltaInt * parseFloat(refPrice) * slippageFactor;
  return parseUnits(
    cdl.toFixed(collateralAssetDecimals),
    collateralAssetDecimals
  );
};

export const getMinResultBalance = (
  collateralBalance: bigint | undefined,
  refPrice: string | undefined,
  collateralAssetDecimals: number,
  collateralDelta: bigint,
  slippage: number
) => {
  if (collateralBalance && refPrice) {
    const estimatedNewBalance = collateralBalance - collateralDelta;
    const slippageAmount =
      (estimatedNewBalance * BigInt(Math.floor(slippage * 100))) /
      BigInt(10000);
    const minResultingBalance = estimatedNewBalance - slippageAmount;

    return formatUnits(minResultingBalance, collateralAssetDecimals);
  }
  return '0';
};
