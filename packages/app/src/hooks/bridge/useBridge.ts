'use client';

import { useState, useMemo, useCallback } from 'react';
import { useReadContract, useWriteContract as useWagmiWriteContract, useSwitchChain, useAccount } from 'wagmi';
import { formatEther, zeroAddress } from 'viem';
import erc20ABI from '@sapience/sdk/queries/abis/erc20abi.json';
import {
  predictionMarketBridge,
  predictionMarketBridgeRemote,
} from '@sapience/sdk/contracts';
import {
  predictionMarketBridgeAbi,
  predictionMarketBridgeRemoteAbi,
} from '@sapience/sdk/abis';
import { CHAIN_ID_ETHEREAL, CHAIN_ID_ARBITRUM } from '@sapience/sdk/constants';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { useCurrentAddress } from '~/hooks/blockchain/useCurrentAddress';

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

/**
 * Returns the bridge contract address and ABI for a given source chain.
 */
function getBridgeConfig(fromChainId: number) {
  if (fromChainId === CHAIN_ID_ETHEREAL) {
    return {
      address: predictionMarketBridge[CHAIN_ID_ETHEREAL]
        ?.address as `0x${string}`,
      abi: predictionMarketBridgeAbi,
    };
  }
  if (fromChainId === CHAIN_ID_ARBITRUM) {
    return {
      address: predictionMarketBridgeRemote[CHAIN_ID_ARBITRUM]
        ?.address as `0x${string}`,
      abi: predictionMarketBridgeRemoteAbi,
    };
  }
  return { address: undefined, abi: undefined };
}

export function useBridgeQuote({
  tokenAddress,
  amount,
  fromChainId,
  enabled = true,
}: {
  tokenAddress?: `0x${string}`;
  amount?: bigint;
  fromChainId: number;
  enabled?: boolean;
}) {
  const { address: bridgeAddress, abi } = getBridgeConfig(fromChainId);

  const { data, isLoading, error, refetch } = useReadContract({
    address: bridgeAddress,
    abi,
    functionName: 'quoteBridge',
    args: [tokenAddress ?? zeroAddress, amount ?? 0n],
    chainId: fromChainId,
    query: {
      enabled:
        enabled &&
        !!bridgeAddress &&
        !!tokenAddress &&
        !!amount &&
        amount > 0n,
      refetchInterval: 30_000,
    },
  });

  const fee = data as { nativeFee: bigint; lzTokenFee: bigint } | undefined;

  return {
    nativeFee: fee?.nativeFee,
    lzTokenFee: fee?.lzTokenFee,
    nativeFeeFormatted: fee?.nativeFee ? formatEther(fee.nativeFee) : undefined,
    isLoading,
    error,
    refetch,
  };
}

const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export function useBridgeApproval({
  tokenAddress,
  amount,
  fromChainId,
  enabled = true,
}: {
  tokenAddress?: `0x${string}`;
  amount?: bigint;
  fromChainId: number;
  enabled?: boolean;
}) {
  const { currentAddress, isConnected } = useCurrentAddress();
  const { address: bridgeAddress } = getBridgeConfig(fromChainId);
  const { chain: walletChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const {
    data: allowance,
    isLoading: isLoadingAllowance,
    refetch: refetchAllowance,
  } = useReadContract({
    abi: erc20ABI,
    address: tokenAddress,
    functionName: 'allowance',
    args: [currentAddress as `0x${string}`, bridgeAddress as `0x${string}`],
    account: currentAddress || zeroAddress,
    chainId: fromChainId,
    query: {
      enabled:
        enabled &&
        isConnected &&
        !!currentAddress &&
        !!tokenAddress &&
        !!bridgeAddress,
    },
  });

  const hasAllowance = useMemo(() => {
    if (!allowance || !amount) return false;
    return (allowance as bigint) >= amount;
  }, [allowance, amount]);

  const [isApproving, setIsApproving] = useState(false);

  // Use raw wagmi writeContract for approve — position tokens are dynamically
  // deployed addresses that can't be enumerated in session key permissions,
  // so this requires owner (wallet) signing.
  const {
    writeContractAsync,
    isPending: isWritePending,
  } = useWagmiWriteContract();

  const approve = useCallback(async () => {
    if (!tokenAddress || !bridgeAddress || !amount) return;
    setIsApproving(true);
    try {
      // Ensure wallet is on the correct chain before approving
      if (walletChain?.id !== fromChainId) {
        await switchChainAsync({ chainId: fromChainId });
      }
      await writeContractAsync({
        abi: ERC20_APPROVE_ABI,
        address: tokenAddress,
        functionName: 'approve',
        args: [bridgeAddress, amount],
        chainId: fromChainId,
      });
      refetchAllowance();
    } catch {
      // approval failed or user rejected
    } finally {
      setIsApproving(false);
    }
  }, [tokenAddress, bridgeAddress, amount, fromChainId, walletChain?.id, switchChainAsync, writeContractAsync, refetchAllowance]);

  return {
    hasAllowance,
    isLoadingAllowance,
    approve,
    isApproving: isApproving || isWritePending,
    refetchAllowance,
  };
}

export function useBridgeExecute({
  fromChainId,
}: {
  fromChainId: number;
}) {
  const { address: bridgeAddress, abi } = getBridgeConfig(fromChainId);
  const [isBridging, setIsBridging] = useState(false);
  const [bridgeSuccess, setBridgeSuccess] = useState(false);

  const {
    writeContract: sapienceWriteContract,
    isPending: isWritePending,
  } = useSapienceWriteContract({
    onSuccess: () => {
      setIsBridging(false);
      setBridgeSuccess(true);
    },
    onError: () => {
      setIsBridging(false);
    },
    successMessage: 'Bridge transaction submitted! Tokens will arrive on the destination chain shortly.',
    fallbackErrorMessage: 'Bridge transaction failed',
    disableAutoRedirect: true,
  });

  const bridge = useCallback(
    async ({
      tokenAddress,
      recipient,
      amount,
      nativeFee,
    }: {
      tokenAddress: `0x${string}`;
      recipient: `0x${string}`;
      amount: bigint;
      nativeFee: bigint;
    }) => {
      if (!bridgeAddress || !abi) return;
      setIsBridging(true);
      setBridgeSuccess(false);
      try {
        await sapienceWriteContract({
          address: bridgeAddress,
          abi,
          functionName: 'bridge',
          args: [tokenAddress, recipient, amount, ZERO_BYTES32],
          value: nativeFee,
          chainId: fromChainId,
        });
      } catch {
        setIsBridging(false);
      }
    },
    [bridgeAddress, abi, fromChainId, sapienceWriteContract]
  );

  return {
    bridge,
    isBridging: isBridging || isWritePending,
    bridgeSuccess,
    resetBridgeSuccess: () => setBridgeSuccess(false),
  };
}

export function usePendingBridges({
  fromChainId,
  enabled = true,
}: {
  fromChainId: number;
  enabled?: boolean;
}) {
  const { currentAddress, isConnected } = useCurrentAddress();
  const { address: bridgeAddress, abi } = getBridgeConfig(fromChainId);

  const {
    data: bridgeIds,
    isLoading,
    refetch,
  } = useReadContract({
    address: bridgeAddress,
    abi,
    functionName: 'getPendingBridges',
    args: [currentAddress as `0x${string}`],
    chainId: fromChainId,
    query: {
      enabled:
        enabled &&
        isConnected &&
        !!currentAddress &&
        !!bridgeAddress,
      refetchInterval: 15_000,
    },
  });

  return {
    bridgeIds: (bridgeIds as `0x${string}`[]) ?? [],
    isLoading,
    refetch,
  };
}

export { getBridgeConfig, ZERO_BYTES32 };
