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
  if (!refPrice) {
    // Fallback to the original calculation if refPrice is not available
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
  return parseUnits(cdl.toString(), collateralAssetDecimals);
};

export const getMinResultBalance = (
  collateralBalance: any,
  refPrice: string | undefined,
  collateralAssetDecimals: number,
  collateralDelta: bigint,
  slippage: number
) => {
  if (collateralBalance && refPrice) {
    const collateralDeltaLimit = calculateCollateralDeltaLimit(
      collateralAssetDecimals,
      collateralDelta,
      slippage,
      refPrice
    );
    const balance = (collateralBalance as bigint) - collateralDeltaLimit;
    return formatBalance(collateralAssetDecimals, balance);
  }
  return '0';
};
