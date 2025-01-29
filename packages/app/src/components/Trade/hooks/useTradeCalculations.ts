import { useMemo, useState } from 'react';
import { formatUnits, parseUnits, zeroAddress } from 'viem';
import { useSimulateContract } from 'wagmi';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { HIGH_PRICE_IMPACT, MIN_BIG_INT_SIZE, TOKEN_DECIMALS } from '~/lib/constants/constants';

interface UseTradeCalculationsProps {
  sizeChange: bigint;
  isEdit: boolean;
  nftId?: number;
  option: 'Long' | 'Short';
  positionData?: FoilPosition;
  collateralBalance?: bigint;
  collateralAssetDecimals: number;
  marketAddress: string;
  epoch: number;
  address: string;
  foilData: any;
  pool?: any;
  liquidity?: string;
}

interface TradeCalculations {
  sizeChangeInContractUnit: bigint;
  desiredSizeInContractUnit: bigint;
  originalPositionSizeInContractUnit: bigint;
  quotedCollateralDelta: bigint;
  quotedFillPrice: bigint;
  priceImpact: number;
  closePositionPriceImpact: number;
  isNonZeroSizeChange: boolean;
  quoteError: string | null;
  walletBalance: string;
  quotedResultingWalletBalance: string;
  resultingPositionCollateral: bigint;
  isLoadingCollateralChange: boolean;
  positionCollateralLimit: bigint;
  walletBalanceLimit: bigint;
}

export function useTradeCalculations({
  sizeChange,
  isEdit,
  nftId,
  option,
  positionData,
  collateralBalance,
  collateralAssetDecimals,
  marketAddress,
  epoch,
  address,
  foilData,
  pool,
  liquidity,
}: UseTradeCalculationsProps): TradeCalculations {
  const isLong = option === 'Long';

  // Calculate size change in contract unit
  const sizeChangeInContractUnit = useMemo(() => {
    const baseSize = sizeChange * BigInt(1e9);
    return isLong ? baseSize : -baseSize;
  }, [sizeChange, isLong]);

  const isNonZeroSizeChange = sizeChangeInContractUnit !== BigInt(0);

  // Calculate original position size
  const originalPositionSizeInContractUnit: bigint = useMemo(() => {
    if (isEdit && positionData) {
      const sideFactor = positionData.vGasAmount > BigInt(0) ? BigInt(1) : BigInt(-1);
      const _sizeBigInt = positionData.vGasAmount > BigInt(0)
        ? positionData.vGasAmount
        : positionData.borrowedVGas;
      const adjustedSize = _sizeBigInt >= MIN_BIG_INT_SIZE ? _sizeBigInt : BigInt(0);
      return sideFactor * adjustedSize;
    }
    return BigInt(0);
  }, [positionData, isEdit]);

  // Calculate desired size
  const desiredSizeInContractUnit = useMemo(() => {
    if (!isEdit) {
      return sizeChangeInContractUnit;
    }

    const originalPositionIsLong = positionData?.vGasAmount!! > BigInt(0);
    const currentSize = originalPositionIsLong
      ? positionData?.vGasAmount || BigInt(0)
      : -(positionData?.borrowedVGas || BigInt(0));

    return currentSize + sizeChangeInContractUnit;
  }, [isEdit, positionData, sizeChangeInContractUnit]);

  // Quote simulations
  const quoteCreatePositionResult = useSimulateContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteCreateTraderPosition',
    args: [epoch, desiredSizeInContractUnit],
    chainId: foilData.chainId,
    account: (address || zeroAddress) as `0x${string}`,
    query: { enabled: !isEdit && isNonZeroSizeChange },
  });

  const quoteModifyPositionResult = useSimulateContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteModifyTraderPosition',
    args: [nftId ?? 0, desiredSizeInContractUnit],
    chainId: foilData.chainId,
    account: (address || zeroAddress) as `0x${string}`,
    query: { enabled: isEdit && isNonZeroSizeChange },
  });

  const quoteClosePositionResult = useSimulateContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteModifyTraderPosition',
    args: [nftId ?? 0, BigInt(0)],
    chainId: foilData.chainId,
    account: (address || zeroAddress) as `0x${string}`,
    query: {
      enabled: isEdit && !!positionData,
      refetchOnMount: true,
    },
  });

  // Extract quoted values
  const [quotedCollateralDelta, quotedFillPrice] = useMemo(() => {
    const result = isEdit
      ? quoteModifyPositionResult.data?.result
      : quoteCreatePositionResult.data?.result;

    if (!result) {
      return [BigInt(0), BigInt(0)];
    }

    if (isEdit) {
      const [expectedCollateralDelta, , fillPrice] = result;
      return [expectedCollateralDelta, fillPrice];
    }
    const [requiredCollateral, fillPrice] = result;
    return [requiredCollateral, fillPrice];
  }, [isEdit, quoteCreatePositionResult.data, quoteModifyPositionResult.data]);

  // Calculate price impacts
  const priceImpact: number = useMemo(() => {
    if (pool?.token0Price && quotedFillPrice && isNonZeroSizeChange) {
      const fillPrice = Number(quotedFillPrice) / 1e18;
      const referencePrice = parseFloat(pool.token0Price.toSignificant(18));
      return Math.abs((fillPrice / referencePrice - 1) * 100);
    }
    return 0;
  }, [quotedFillPrice, pool, isNonZeroSizeChange]);

  const closePositionPriceImpact: number = useMemo(() => {
    if (!pool?.token0Price || !positionData) return 0;

    if (positionData.vGasAmount === BigInt(0) && positionData.borrowedVGas === BigInt(0)) {
      return 0;
    }

    const closeQuote = quoteClosePositionResult.data?.result;
    if (!closeQuote) return 0;

    const [, , fillPrice] = closeQuote;
    const referencePrice = parseFloat(pool.token0Price.toSignificant(18));
    const impact = Math.abs((Number(fillPrice) / 1e18 / referencePrice - 1) * 100);
    return impact;
  }, [pool, positionData, quoteClosePositionResult.data]);

  const [positionCollateralLimit, setPositionCollateralLimit] = useState<bigint>(BigInt(0));

  // Calculate quote error
  const quoteError = useMemo(() => {
    if (quoteModifyPositionResult?.error && isEdit && isNonZeroSizeChange) {
      return quoteModifyPositionResult.error.message;
    }
    if (quoteCreatePositionResult.error && !isEdit) {
      return quoteCreatePositionResult.error.message;
    }
    return null;
  }, [
    quoteCreatePositionResult.error,
    quoteModifyPositionResult?.error,
    isEdit,
    isNonZeroSizeChange,
  ]);

  // Calculate wallet balances
  const walletBalance = useMemo(() => {
    if (!collateralBalance) return '0';
    return formatUnits(collateralBalance, collateralAssetDecimals);
  }, [collateralBalance, collateralAssetDecimals]);

    const [walletBalanceLimit, setWalletBalanceLimit] = useState<bigint>(
     BigInt(0));

  const quotedResultingWalletBalance = useMemo(() => {
    if (!collateralBalance) return '0';
    return formatUnits(
      collateralBalance - quotedCollateralDelta,
      collateralAssetDecimals
    );
  }, [collateralBalance, quotedCollateralDelta, collateralAssetDecimals]);

  // Calculate position collateral
  const resultingPositionCollateral = useMemo(() => {
    return (positionData?.depositedCollateralAmount || BigInt(0)) + quotedCollateralDelta;
  }, [positionData, quotedCollateralDelta]);

  const isLoadingCollateralChange = isEdit
    ? quoteModifyPositionResult.isFetching
    : quoteCreatePositionResult.isFetching;
    

  return {
    sizeChangeInContractUnit,
    desiredSizeInContractUnit,
    originalPositionSizeInContractUnit,
    quotedCollateralDelta,
    quotedFillPrice,
    priceImpact,
    closePositionPriceImpact,
    isNonZeroSizeChange,
    quoteError,
    walletBalance,
    quotedResultingWalletBalance,
    resultingPositionCollateral,
    isLoadingCollateralChange,
    positionCollateralLimit,
    walletBalanceLimit,
  };
}
