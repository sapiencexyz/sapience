import { useToast } from '@sapience/ui/hooks/use-toast';
import { useCallback, useEffect, useState } from 'react';
import { type Abi, type Address, parseUnits } from 'viem';
import {
  useAccount,
  useSendCalls,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { useTokenApproval } from './useTokenApproval';

export interface ConsolidatedCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
}

export interface ConsolidatedFormSubmissionParams {
  targetChainId: number;
  calls: ConsolidatedCall[];
  collateralTokenAddress?: Address;
  collateralAmount?: string;
  collateralTokenSymbol?: string;
  spenderAddress?: Address;
  enabled?: boolean;
}

export interface ConsolidatedFormSubmissionResult {
  submitForm: () => Promise<void>;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  txHash: `0x${string}` | undefined;
  isApproving: boolean;
  hasAllowance: boolean;
  needsApproval: boolean;
  reset: () => void;
}

/**
 * Consolidated form submission hook that handles:
 * 1. Chain switching
 * 2. Token approvals
 * 3. Grouped contract calls using sendCalls with experimental fallback
 */
export function useConsolidatedFormSubmission({
  targetChainId,
  calls,
  collateralTokenAddress,
  collateralAmount,
  collateralTokenSymbol,
  spenderAddress,
  enabled = true,
}: ConsolidatedFormSubmissionParams): ConsolidatedFormSubmissionResult {
  const { toast } = useToast();
  const { chainId: currentChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [processingTx, setProcessingTx] = useState(false);

  // Token approval hook
  const {
    hasAllowance,
    isApproving,
    isApproveSuccess,
    approve,
    error: approvalError,
  } = useTokenApproval({
    tokenAddress: collateralTokenAddress,
    spenderAddress,
    amount: collateralAmount || '0',
    chainId: targetChainId,
    enabled:
      enabled &&
      !!collateralTokenAddress &&
      !!spenderAddress &&
      !!collateralAmount &&
      parseUnits(collateralAmount, 18) > BigInt(0),
  });

  // Check if approval is needed
  const needsApproval =
    enabled &&
    !hasAllowance &&
    collateralTokenAddress !== undefined &&
    spenderAddress !== undefined &&
    collateralAmount !== undefined &&
    parseUnits(collateralAmount, 18) > BigInt(0);

  // sendCalls hook for batched transactions
  const {
    sendCallsAsync,
    isPending: isSendCallsPending,
    data: sendCallsData,
    error: sendCallsError,
  } = useSendCalls({
    mutation: {
      onSuccess: (data) => {
        setTxHash(data);
        toast({
          title: 'Transaction Submitted',
          description: 'Your transaction has been submitted.',
        });
      },
      onError: (err) => {
        console.error('sendCalls error:', err);
        setError(err);
        setProcessingTx(false);
      },
    },
  });

  // Fallback writeContract hook for individual calls
  const {
    writeContractAsync,
    isPending: isWritePending,
    data: writeData,
    error: writeError,
  } = useWriteContract();

  // Watch for transaction completion
  const {
    isLoading: isConfirming,
    isSuccess,
    error: txError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: targetChainId,
  });

  // Set error if any occur during the process
  useEffect(() => {
    if (sendCallsError) setError(sendCallsError);
    if (writeError) setError(writeError);
    if (txError) setError(txError);
    if (approvalError) setError(approvalError);
  }, [sendCallsError, writeError, txError, approvalError]);

  // Function to execute calls using sendCalls with fallback
  const executeCalls = useCallback(async (): Promise<void> => {
    if (!enabled || calls.length === 0) {
      throw new Error('No calls to execute');
    }

    setError(null);

    try {
      // Try sendCalls first (batched)
      if (calls.length > 1) {
        try {
          const callsData = calls.map((call) => ({
            to: call.address,
            data: call.abi,
            value: call.value || BigInt(0),
          }));

          const hash = await sendCallsAsync({
            calls: callsData,
            capabilities: {
              paymasterService: {
                url: 'https://paymaster.base.org',
              },
            },
          });

          setTxHash(hash);
          return;
        } catch (sendCallsErr) {
          console.warn('sendCalls failed, falling back to individual calls:', sendCallsErr);
        }
      }

      // Fallback to individual calls
      let lastTxHash: `0x${string}` | undefined;
      
      for (const call of calls) {
        const hash = await writeContractAsync({
          address: call.address,
          abi: call.abi,
          functionName: call.functionName,
          args: call.args,
          value: call.value,
          chainId: targetChainId,
        });
        
        lastTxHash = hash;
        
        // For multiple calls, add a small delay between transactions
        if (calls.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setTxHash(lastTxHash);
    } catch (err) {
      console.error('Error executing calls:', err);
      throw err;
    }
  }, [enabled, calls, sendCallsAsync, writeContractAsync, targetChainId]);

  // Handle approval success
  useEffect(() => {
    const handleApprovalSuccess = async () => {
      if (!isApproveSuccess || !processingTx) return;

      toast({
        title: 'Token Approved',
        description: 'Proceeding with transaction...',
      });

      try {
        await executeCalls();
      } catch (err) {
        setProcessingTx(false);
        console.error('Error executing calls after approval:', err);
        setError(
          err instanceof Error
            ? err
            : new Error('Failed to execute transaction after approval')
        );
        toast({
          title: 'Error',
          description: 'Failed to execute transaction after approval. Please try again.',
          variant: 'destructive',
        });
      }
    };

    handleApprovalSuccess();
  }, [isApproveSuccess, processingTx, executeCalls, toast]);

  // Main submission function
  const submitForm = useCallback(async (): Promise<void> => {
    if (!enabled) {
      setError(new Error('Form submission is disabled'));
      return;
    }

    setProcessingTx(true);
    setError(null);

    try {
      // Step 1: Check and switch chain if needed
      if (currentChainId !== targetChainId) {
        toast({
          title: 'Network Switch Required',
          description: 'Please switch to the correct network.',
        });

        try {
          await switchChainAsync({ chainId: targetChainId });
        } catch (switchErr) {
          setProcessingTx(false);
          const message =
            switchErr instanceof Error && switchErr.message.includes('User rejected')
              ? 'Network switch rejected by user.'
              : 'Failed to switch network. Please try again.';
          
          setError(new Error(message));
          toast({
            title: 'Network Switch Failed',
            description: message,
            variant: 'destructive',
          });
          return;
        }
      }

      // Step 2: Handle approval if needed
      if (needsApproval) {
        toast({
          title: 'Approval Required',
          description: `Approving ${collateralAmount} ${collateralTokenSymbol || 'token(s)'}...`,
        });
        
        await approve();
        // executeCalls will be called in the approval success effect
      } else {
        // Step 3: Execute calls directly
        await executeCalls();
      }
    } catch (err) {
      setProcessingTx(false);
      console.error('Error in form submission:', err);
      
      if (!error) {
        setError(
          err instanceof Error ? err : new Error('An unexpected error occurred')
        );
      }
    }
  }, [
    enabled,
    currentChainId,
    targetChainId,
    needsApproval,
    collateralAmount,
    collateralTokenSymbol,
    switchChainAsync,
    approve,
    executeCalls,
    toast,
    error,
  ]);

  // Reset processing state on final success or error
  useEffect(() => {
    if ((isSuccess || error) && processingTx) {
      setProcessingTx(false);
    }
  }, [isSuccess, error, processingTx]);

  // Reset function
  const reset = useCallback(() => {
    setTxHash(undefined);
    setError(null);
    setProcessingTx(false);
  }, []);

  const isLoading =
    isSendCallsPending || isWritePending || isConfirming || processingTx || isApproving;
  const isError = !!error;

  return {
    submitForm,
    isLoading,
    isSuccess,
    isError,
    error,
    txHash,
    isApproving,
    hasAllowance,
    needsApproval,
    reset,
  };
}