import erc20ABI from '@sapience/ui/abis/erc20abi.json';
import { useEffect, useMemo, useState } from 'react';
import { parseUnits, zeroAddress } from 'viem';
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

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
    account: (address || zeroAddress) as `0x${string}`,
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

  // Write contract for approval
  const {
    data: approveHash,
    writeContract: approveWrite,
    isPending: isWritePending,
    isError: isWriteError,
    error: writeError,
  } = useWriteContract();

  // Wait for transaction receipt
  const {
    isLoading: isConfirming,
    isSuccess: isApproveSuccess,
    error: txError,
  } = useWaitForTransactionReceipt({
    hash: approveHash,
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
      await approveWrite({
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

  // Reset approving state when transaction is complete
  useEffect(() => {
    if (isApproveSuccess) {
      setIsApproving(false);
      refetchAllowance();
    }
  }, [isApproveSuccess, refetchAllowance]);

  // Reset approving state if there's an error
  useEffect(() => {
    if (isWriteError && writeError) {
      setIsApproving(false);
    }
  }, [isWriteError, writeError]);

  return {
    allowance: allowance as bigint | undefined,
    hasAllowance,
    isLoadingAllowance,
    approve,
    isApproving: isApproving || isWritePending || isConfirming,
    isApproveSuccess,
    approveHash,
    refetchAllowance,
    error: writeError || txError,
  };
}
