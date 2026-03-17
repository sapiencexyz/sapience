import erc20ABI from '@sapience/sdk/queries/abis/erc20abi.json';
import { useMemo, useState } from 'react';
import { zeroAddress } from 'viem';
import { useReadContract } from 'wagmi';
import { parseAmountToBigInt } from '@sapience/sdk';

import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { useCurrentAddress } from '~/hooks/blockchain/useCurrentAddress';

interface UseTokenApprovalProps {
  tokenAddress?: `0x${string}`;
  spenderAddress?: `0x${string}`;
  amount?: string;
  chainId?: number;
  decimals?: number;
  enabled?: boolean;
}

/**
 * Hook to handle token approvals
 */
export function useTokenApproval({
  tokenAddress,
  spenderAddress,
  amount,
  chainId,
  decimals = 18,
  enabled = true,
}: UseTokenApprovalProps) {
  const { currentAddress, isConnected } = useCurrentAddress();
  const [isApproving, setIsApproving] = useState(false);
  const [isApproveSuccess, setIsApproveSuccess] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // Parse amount to bigint using SDK utility
  const parsedAmount = useMemo(
    () => parseAmountToBigInt(amount, decimals),
    [amount, decimals]
  );

  // Check allowance
  const {
    data: allowance,
    isLoading: isLoadingAllowance,
    refetch: refetchAllowance,
  } = useReadContract({
    abi: erc20ABI,
    address: tokenAddress,
    functionName: 'allowance',
    args: [currentAddress as `0x${string}`, spenderAddress as `0x${string}`],
    account: currentAddress || zeroAddress,
    chainId,
    query: {
      enabled:
        enabled &&
        isConnected &&
        !!currentAddress &&
        !!tokenAddress &&
        !!spenderAddress &&
        !!chainId,
    },
  });

  // Use Sapience write contract hook
  const {
    writeContract: sapienceWriteContract,
    isPending: isWritePending,
    reset: resetWrite,
  } = useSapienceWriteContract({
    onSuccess: () => {
      setIsApproving(false);
      setIsApproveSuccess(true);
      setError(undefined);
      refetchAllowance();
    },
    onError: (error: Error) => {
      setIsApproving(false);
      setIsApproveSuccess(false);
      setError(error);
    },
    onTxHash: () => {
      // Transaction hash received, approval is in progress
      setError(undefined);
    },
    successMessage: 'Token approved.',
    fallbackErrorMessage: 'Token approval failed',
  });

  // Check if token has sufficient allowance
  const hasAllowance = useMemo(() => {
    if (!allowance || !parsedAmount) return false;
    return (allowance as bigint) >= parsedAmount;
  }, [allowance, parsedAmount]);

  // Function to approve tokens
  const approve = async () => {
    if (
      !tokenAddress ||
      !spenderAddress ||
      !chainId ||
      parsedAmount === BigInt(0)
    ) {
      const error = new Error('Missing required parameters for token approval');
      console.error('Error approving tokens:', error);
      setError(error);
      throw error;
    }

    // Reset success state and error before starting new approval
    setIsApproveSuccess(false);
    setError(undefined);
    setIsApproving(true);

    try {
      await sapienceWriteContract({
        abi: erc20ABI,
        address: tokenAddress,
        functionName: 'approve',
        args: [spenderAddress, parsedAmount],
        chainId,
      });
    } catch (error) {
      console.error('Error approving tokens:', error);
      setIsApproving(false);
      setIsApproveSuccess(false);
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      setError(errorObj);
      throw error;
    }
  };

  // Reset function to clear all states
  const reset = () => {
    setIsApproving(false);
    setIsApproveSuccess(false);
    setError(undefined);
    resetWrite();
  };

  return {
    allowance: allowance as bigint | undefined,
    hasAllowance,
    isLoadingAllowance,
    approve,
    isApproving: isApproving || isWritePending,
    isApproveSuccess,
    refetchAllowance,
    error,
    reset,
  };
}
