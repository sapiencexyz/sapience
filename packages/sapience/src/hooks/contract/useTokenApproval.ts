import erc20ABI from '@sapience/ui/abis/erc20abi.json';
import { useMemo, useState } from 'react';
import { parseUnits, zeroAddress } from 'viem';
import {
  useAccount,
  useReadContract,
} from 'wagmi';

import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

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
  const { address, isConnected } = useAccount();
  const [isApproving, setIsApproving] = useState(false);

  // Parse amount to bigint
  const parsedAmount = useMemo(() => {
    if (!amount) return BigInt(0);
    try {
      return parseUnits(amount, decimals);
    } catch (error) {
      console.error('Error parsing amount:', error);
      return BigInt(0);
    }
  }, [amount, decimals]);

  // Check allowance
  const {
    data: allowance,
    isLoading: isLoadingAllowance,
    refetch: refetchAllowance,
  } = useReadContract({
    abi: erc20ABI,
    address: tokenAddress,
    functionName: 'allowance',
    args: [address as `0x${string}`, spenderAddress as `0x${string}`],
    account: address || zeroAddress,
    chainId,
    query: {
      enabled:
        enabled &&
        isConnected &&
        !!address &&
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
      refetchAllowance();
    },
    onError: () => {
      setIsApproving(false);
    },
    onTxHash: () => {
      // Transaction hash received, approval is in progress
    },
    successMessage: 'Token approval successful',
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
      console.error('Missing required parameters for token approval');
      return;
    }

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
      throw error;
    }
  };

  return {
    allowance: allowance as bigint | undefined,
    hasAllowance,
    isLoadingAllowance,
    approve,
    isApproving: isApproving || isWritePending,
    isApproveSuccess: false, // This is now handled by useSapienceWriteContract
    refetchAllowance,
    error: undefined, // This is now handled by useSapienceWriteContract
    reset: resetWrite,
  };
}
