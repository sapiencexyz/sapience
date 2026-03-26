'use client';

import { useCallback, useMemo, useState } from 'react';
import { useReadContract } from 'wagmi';
import { erc20Abi, formatUnits, type Address } from 'viem';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { generateRandomNonce } from '@sapience/sdk';

/**
 * Get PredictionMarketEscrow contract address for a chain.
 * An optional `overrideAddress` can be provided to target a specific
 * escrow deployment (e.g. legacy contracts stored per-position).
 */
export function useEscrowContractAddress(
  chainId?: number,
  overrideAddress?: Address
) {
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const defaultAddress = predictionMarketEscrow[effectiveChainId]?.address as
    | Address
    | undefined;
  return overrideAddress ?? defaultAddress;
}

/**
 * Hook to generate random nonces for the bitmap nonce system (Permit2-style).
 * No longer reads sequential nonces from the contract.
 * Each call to refetch() returns a fresh random nonce.
 */
export function useEscrowNonce(_params: {
  address?: Address;
  chainId?: number;
  enabled?: boolean;
}) {
  const [nonce, setNonce] = useState<bigint>(() => generateRandomNonce());

  const refetch = useCallback(() => {
    const freshNonce = generateRandomNonce();
    setNonce(freshNonce);
    return Promise.resolve({ data: freshNonce });
  }, []);

  return {
    nonce,
    isLoading: false,
    error: null,
    refetch,
  };
}

/**
 * Hook to read pick configuration
 */
export function usePickConfiguration(params: {
  pickConfigId?: `0x${string}`;
  chainId?: number;
  enabled?: boolean;
  contractAddress?: Address;
}) {
  const { pickConfigId, chainId, enabled = true } = params;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const contractAddress = useEscrowContractAddress(
    effectiveChainId,
    params.contractAddress
  );

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
 * Hook to read token pair for a pick configuration
 */
export function useTokenPair(params: {
  pickConfigId?: `0x${string}`;
  chainId?: number;
  enabled?: boolean;
  contractAddress?: Address;
}) {
  const { pickConfigId, chainId, enabled = true } = params;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const contractAddress = useEscrowContractAddress(
    effectiveChainId,
    params.contractAddress
  );

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
 * Hook to read position token balance (ERC20)
 */
export function useTokenBalance(params: {
  tokenAddress?: Address;
  holder?: Address;
  chainId?: number;
  enabled?: boolean;
}) {
  const { tokenAddress, holder, chainId, enabled = true } = params;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;

  const {
    data: balance,
    isLoading: isLoadingBalance,
    error: balanceError,
    refetch: refetchBalance,
  } = useReadContract({
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
 * Hook to check if a prediction can be settled
 */
export function useCanSettle(params: {
  predictionId?: `0x${string}`;
  chainId?: number;
  enabled?: boolean;
  contractAddress?: Address;
}) {
  const { predictionId, chainId, enabled = true } = params;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const contractAddress = useEscrowContractAddress(
    effectiveChainId,
    params.contractAddress
  );

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
 * Hook to calculate claimable amount for redemption
 */
export function useClaimableAmount(params: {
  pickConfigId?: `0x${string}`;
  tokenAddress?: Address;
  amount?: bigint;
  chainId?: number;
  enabled?: boolean;
  contractAddress?: Address;
}) {
  const {
    pickConfigId,
    tokenAddress,
    amount,
    chainId,
    enabled = true,
  } = params;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const contractAddress = useEscrowContractAddress(
    effectiveChainId,
    params.contractAddress
  );

  const { data, isLoading, error, refetch } = useReadContract({
    abi: predictionMarketEscrowAbi,
    address: contractAddress,
    functionName: 'getClaimableAmount',
    args:
      pickConfigId && tokenAddress && amount !== undefined
        ? [pickConfigId, tokenAddress, amount]
        : undefined,
    chainId: effectiveChainId,
    query: {
      enabled:
        enabled &&
        Boolean(pickConfigId) &&
        Boolean(tokenAddress) &&
        amount !== undefined &&
        Boolean(contractAddress),
    },
  });

  return {
    claimableAmount: data as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}
