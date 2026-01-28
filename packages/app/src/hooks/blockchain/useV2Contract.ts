'use client';

import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { erc20Abi, formatUnits, type Address } from 'viem';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { CHAIN_ID_ETHEREAL, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

/**
 * Get V2 PredictionMarketEscrow contract address for a chain
 */
export function useV2ContractAddress(chainId?: number) {
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  return predictionMarketEscrow[effectiveChainId]?.address as Address | undefined;
}

/**
 * Hook to read V2 nonce for an account
 */
export function useV2Nonce(params: {
  address?: Address;
  chainId?: number;
  enabled?: boolean;
}) {
  const { address, chainId, enabled = true } = params;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const contractAddress = useV2ContractAddress(effectiveChainId);

  const { data, isLoading, error, refetch } = useReadContract({
    abi: predictionMarketEscrowAbi,
    address: contractAddress,
    functionName: 'getNonce',
    args: address ? [address] : undefined,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(address) && Boolean(contractAddress),
    },
  });

  return {
    nonce: data as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to read V2 pick configuration
 */
export function useV2PickConfiguration(params: {
  pickConfigId?: `0x${string}`;
  chainId?: number;
  enabled?: boolean;
}) {
  const { pickConfigId, chainId, enabled = true } = params;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const contractAddress = useV2ContractAddress(effectiveChainId);

  const { data, isLoading, error, refetch } = useReadContract({
    abi: predictionMarketEscrowAbi,
    address: contractAddress,
    functionName: 'getPickConfiguration',
    args: pickConfigId ? [pickConfigId] : undefined,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(pickConfigId) && Boolean(contractAddress),
    },
  });

  const pickConfig = useMemo(() => {
    if (!data) return undefined;
    const [
      totalPredictorCollateral,
      totalCounterpartyCollateral,
      claimedPredictorCollateral,
      claimedCounterpartyCollateral,
      resolved,
      result,
    ] = data as [bigint, bigint, bigint, bigint, boolean, number];

    return {
      totalPredictorCollateral,
      totalCounterpartyCollateral,
      claimedPredictorCollateral,
      claimedCounterpartyCollateral,
      resolved,
      result, // SettlementResult enum: 0=UNRESOLVED, 1=PREDICTOR_WINS, 2=COUNTERPARTY_WINS, 3=NON_DECISIVE
    };
  }, [data]);

  return {
    pickConfig,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to read V2 token pair for a pick configuration
 */
export function useV2TokenPair(params: {
  pickConfigId?: `0x${string}`;
  chainId?: number;
  enabled?: boolean;
}) {
  const { pickConfigId, chainId, enabled = true } = params;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const contractAddress = useV2ContractAddress(effectiveChainId);

  const { data, isLoading, error, refetch } = useReadContract({
    abi: predictionMarketEscrowAbi,
    address: contractAddress,
    functionName: 'getTokenPair',
    args: pickConfigId ? [pickConfigId] : undefined,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(pickConfigId) && Boolean(contractAddress),
    },
  });

  const tokenPair = useMemo(() => {
    if (!data) return undefined;
    const [predictorToken, counterpartyToken] = data as [Address, Address];
    return { predictorToken, counterpartyToken };
  }, [data]);

  return {
    tokenPair,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to read V2 position token balance (ERC20)
 */
export function useV2TokenBalance(params: {
  tokenAddress?: Address;
  holder?: Address;
  chainId?: number;
  enabled?: boolean;
}) {
  const { tokenAddress, holder, chainId, enabled = true } = params;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;

  const { data: balance, isLoading: isLoadingBalance, error: balanceError, refetch: refetchBalance } = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    functionName: 'balanceOf',
    args: holder ? [holder] : undefined,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(tokenAddress) && Boolean(holder),
    },
  });

  const { data: decimals, isLoading: isLoadingDecimals } = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    functionName: 'decimals',
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(tokenAddress),
    },
  });

  const formattedBalance = useMemo(() => {
    if (balance === undefined) return '0';
    const dec = typeof decimals === 'number' ? decimals : 18;
    return formatUnits(balance, dec);
  }, [balance, decimals]);

  return {
    balance,
    formattedBalance,
    decimals: typeof decimals === 'number' ? decimals : 18,
    isLoading: isLoadingBalance || isLoadingDecimals,
    error: balanceError,
    refetch: refetchBalance,
  };
}

/**
 * Hook to check if a V2 prediction can be settled
 */
export function useV2CanSettle(params: {
  predictionId?: `0x${string}`;
  chainId?: number;
  enabled?: boolean;
}) {
  const { predictionId, chainId, enabled = true } = params;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const contractAddress = useV2ContractAddress(effectiveChainId);

  const { data, isLoading, error, refetch } = useReadContract({
    abi: predictionMarketEscrowAbi,
    address: contractAddress,
    functionName: 'canSettle',
    args: predictionId ? [predictionId] : undefined,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(predictionId) && Boolean(contractAddress),
    },
  });

  return {
    canSettle: data as boolean | undefined,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to calculate claimable amount for V2 redemption
 */
export function useV2ClaimableAmount(params: {
  pickConfigId?: `0x${string}`;
  tokenAddress?: Address;
  amount?: bigint;
  chainId?: number;
  enabled?: boolean;
}) {
  const { pickConfigId, tokenAddress, amount, chainId, enabled = true } = params;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const contractAddress = useV2ContractAddress(effectiveChainId);

  const { data, isLoading, error, refetch } = useReadContract({
    abi: predictionMarketEscrowAbi,
    address: contractAddress,
    functionName: 'getClaimableAmount',
    args: pickConfigId && tokenAddress && amount !== undefined
      ? [pickConfigId, tokenAddress, amount]
      : undefined,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(pickConfigId) && Boolean(tokenAddress) && amount !== undefined && Boolean(contractAddress),
    },
  });

  return {
    claimableAmount: data as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}
