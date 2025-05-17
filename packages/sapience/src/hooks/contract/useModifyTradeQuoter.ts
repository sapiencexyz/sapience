import { useMemo } from 'react';
import type { Abi } from 'viem';
import { zeroAddress } from 'viem';
import { useSimulateContract } from 'wagmi';

interface UseModifyTradeQuoterProps {
  marketAddress?: `0x${string}`;
  accountAddress?: `0x${string}`;
  marketAbi: Abi;
  chainId?: number;
  positionId: bigint;
  newSize?: bigint;
  enabled?: boolean;
}

type QuoteModifyResult = readonly [
  collateralDelta: bigint,
  liquidationPrice: bigint,
  fillPrice: bigint,
];

/**
 * Hook to get quotes for modifying an existing trader position (increase, decrease, or close).
 */
export function useModifyTradeQuoter({
  marketAddress,
  marketAbi,
  chainId,
  positionId,
  accountAddress,
  newSize = BigInt(0),
  enabled = true,
}: UseModifyTradeQuoterProps) {
  const isQuoteEnabled = useMemo(
    () =>
      enabled &&
      !!positionId &&
      !!marketAddress &&
      !!accountAddress &&
      newSize !== undefined,
    [enabled, positionId, marketAddress, accountAddress, newSize]
  );

  const {
    data: quoteSimulationResult,
    error: quoteError,
    isFetching: isQuoting,
  } = useSimulateContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: 'quoteModifyTraderPosition',
    args: [positionId, newSize],
    chainId,
    account: accountAddress || zeroAddress,
    query: {
      enabled: isQuoteEnabled,
    },
  });

  const [quotedCollateralDelta, quotedFillPrice] = useMemo(() => {
    const result = quoteSimulationResult?.result as
      | QuoteModifyResult
      | undefined;
    if (!result || !Array.isArray(result) || result.length < 3) {
      return [BigInt(0), BigInt(0), BigInt(0)];
    }
    return [result[0], result[2]];
  }, [quoteSimulationResult]);

  return {
    quotedCollateralDelta,
    quotedFillPrice,
    isQuoting,
    quoteError,
  };
}
