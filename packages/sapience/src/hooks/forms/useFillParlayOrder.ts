'use client';

import { useToast } from '@sapience/ui/hooks/use-toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import { encodeFunctionData, erc20Abi } from 'viem';
import {
  useAccount,
  useCallsStatus,
  useReadContracts,
  useSendCalls,
  useSwitchChain,
} from 'wagmi';

// Keep in sync with other parlay hooks for now
export const PARLAY_CONTRACT_ADDRESS =
  '0x918e72DAB2aF7672AbF534F744770D7F8859C55e' as Address;

const PARLAY_ABI = [
  {
    type: 'function',
    name: 'getConfig',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: 'config',
        type: 'tuple',
        components: [
          { name: 'collateralToken', type: 'address' },
          { name: 'makerNft', type: 'address' },
          { name: 'takerNft', type: 'address' },
          { name: 'maxParlayMarkets', type: 'uint256' },
          { name: 'minCollateral', type: 'uint256' },
          { name: 'minRequestExpirationTime', type: 'uint256' },
          { name: 'maxRequestExpirationTime', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'fillParlayOrder',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [],
  },
] as const;

type UseFillParlayOrderParams = {
  requestId: bigint;
  payout: bigint; // total payout of the parlay
  collateral: bigint; // maker collateral
  chainId?: number;
  onSuccess?: () => void;
  enabled?: boolean;
};

export function useFillParlayOrder({
  requestId,
  payout,
  collateral,
  chainId,
  onSuccess,
  enabled = true,
}: UseFillParlayOrderParams) {
  const { address, chainId: currentChainId } = useAccount();
  const activeChainId = chainId ?? currentChainId;
  const { switchChainAsync } = useSwitchChain();
  const { toast } = useToast();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Read config for collateral token
  const configRead = useReadContracts({
    contracts: [
      {
        address: PARLAY_CONTRACT_ADDRESS,
        abi: PARLAY_ABI,
        functionName: 'getConfig',
        chainId: activeChainId,
      },
    ],
    query: { enabled: !!activeChainId && enabled },
  });

  const collateralToken: Address | undefined = useMemo(() => {
    const item = configRead.data?.[0];
    if (item && item.status === 'success') {
      const cfg = item.result as unknown as { collateralToken: Address };
      return cfg.collateralToken;
    }
    return undefined;
  }, [configRead.data]);

  const delta = useMemo(() => {
    try {
      if (payout <= collateral) return 0n;
      return payout - collateral;
    } catch {
      return 0n;
    }
  }, [payout, collateral]);

  const calls = useMemo(() => {
    if (!enabled || !collateralToken || delta === 0n)
      return [] as {
        to: `0x${string}`;
        data: `0x${string}`;
      }[];

    const approveCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [PARLAY_CONTRACT_ADDRESS, delta],
    });

    const fillCalldata = encodeFunctionData({
      abi: PARLAY_ABI,
      functionName: 'fillParlayOrder',
      args: [requestId],
    });

    return [
      { to: collateralToken, data: approveCalldata },
      { to: PARLAY_CONTRACT_ADDRESS, data: fillCalldata },
    ];
  }, [enabled, collateralToken, delta, requestId]);

  const {
    sendCalls,
    data: sendCallsId,
    isPending: isSendCallsPending,
    error: sendCallsError,
    reset: resetSendCalls,
  } = useSendCalls();

  const {
    data: callsStatus,
    isSuccess: isCallsSuccess,
    error: callsStatusError,
  } = useCallsStatus({
    id: sendCallsId?.id || '',
    query: { enabled: !!sendCallsId?.id },
  });

  const fillParlay = useCallback(async () => {
    if (!enabled || !address || !activeChainId) return;

    setError(null);
    setSuccess(null);
    resetSendCalls();

    try {
      if (currentChainId !== activeChainId) {
        if (!switchChainAsync) throw new Error('Chain switching not available');
        await switchChainAsync({ chainId: activeChainId });
      }

      if (!collateralToken) throw new Error('Collateral token not found');
      if (!calls.length) throw new Error('No valid calls to execute');

      toast({
        title: 'Filling Parlay Order',
        description:
          'Approve collateral and fill the parlay order. Please confirm in your wallet.',
      });

      sendCalls({ calls, chainId: activeChainId });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fill parlay';
      setError(message);
      toast({
        title: 'Fill Failed',
        description: message,
        variant: 'destructive',
      });
    }
  }, [
    enabled,
    address,
    activeChainId,
    currentChainId,
    switchChainAsync,
    collateralToken,
    calls,
    sendCalls,
    resetSendCalls,
    toast,
  ]);

  useEffect(() => {
    if (sendCallsError) {
      const message = sendCallsError.message.includes('User rejected')
        ? 'Transaction rejected by user'
        : sendCallsError.message || 'Transaction failed';
      setError(message);
      toast({
        title: 'Transaction Failed',
        description: message,
        variant: 'destructive',
      });
    }
  }, [sendCallsError, toast]);

  useEffect(() => {
    if (isCallsSuccess && callsStatus?.status === 'success') {
      const successMsg = `Parlay filled successfully! Batch ID: ${sendCallsId?.id}`;
      setSuccess(successMsg);
      setError(null);
      toast({
        title: 'Parlay Filled',
        description: 'You are now the taker on this parlay order.',
        duration: 5000,
      });
      onSuccess?.();
    }
  }, [isCallsSuccess, callsStatus, sendCallsId, toast, onSuccess]);

  useEffect(() => {
    if (callsStatusError) {
      setError('Failed to confirm transaction');
      toast({
        title: 'Transaction Failed',
        description: 'The transaction failed to confirm on the blockchain',
        variant: 'destructive',
      });
    }
  }, [callsStatusError, toast]);

  const reset = useCallback(() => {
    setError(null);
    setSuccess(null);
    resetSendCalls();
  }, [resetSendCalls]);

  return {
    fillParlay,
    isFilling: isSendCallsPending,
    error,
    success,
    reset,
    delta,
  };
}
