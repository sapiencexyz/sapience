import { useCallback, useMemo, useState } from 'react';
import type { useTransaction } from 'wagmi';
import { useWriteContract, useSendCalls, useConnectorClient } from 'wagmi';
import type { Hash } from 'viem';

import { useToast } from '@sapience/ui/hooks/use-toast';
import { waitForCallsStatus } from 'viem/actions';
import { handleViemError } from '~/utils/blockchain/handleViemError';
import { useChainValidation } from '~/hooks/blockchain/useChainValidation';
import { useMonitorTxStatus } from '~/hooks/blockchain/useMonitorTxStatus';

interface useSapienceWriteContractProps {
  onSuccess?: (receipt: ReturnType<typeof useTransaction>['data']) => void;
  onError?: (error: Error) => void;
  onTxHash?: (txHash: Hash) => void;
  successMessage?: string;
  fallbackErrorMessage?: string;
}

export function useSapienceWriteContract({
  onSuccess,
  onError,
  onTxHash,
  successMessage,
  fallbackErrorMessage = 'Transaction failed',
}: useSapienceWriteContractProps) {
  const { data: client } = useConnectorClient();
  const [txHash, setTxHash] = useState<Hash | undefined>(undefined);
  const { toast } = useToast();
  const [chainId, setChainId] = useState<number | undefined>(undefined);

  // Chain validation
  const { validateAndSwitchChain } = useChainValidation({
    onError: (errorMessage) => {
      toast({
        title: 'Chain Validation Failed',
        description: errorMessage,
        duration: 5000,
        variant: 'destructive',
      });
    },
  });

  // Wagmi write contract hook (async usage; we handle promise resolution ourselves)
  const {
    writeContractAsync,
    isPending: isWritingContract,
    reset: resetWrite,
  } = useWriteContract();

  // Wagmi send calls hook (async usage; we handle promise resolution ourselves)
  const {
    sendCallsAsync,
    isPending: isSendingCalls,
    reset: resetCalls,
  } = useSendCalls();

  // Custom write contract function that handles chain validation
  const sapiensWriteContract = useCallback(
    async (...args: Parameters<typeof writeContractAsync>) => {
      const _chainId = args[0].chainId;
      if (!_chainId) {
        throw new Error('Chain ID is required');
      }
      setChainId(_chainId);

      try {
        // Reset state
        setTxHash(undefined);
        resetWrite();

        // Validate and switch chain if needed
        await validateAndSwitchChain(_chainId);

        // Execute the transaction and set hash when resolved
        const hash = await writeContractAsync(...args);
        onTxHash?.(hash);
        setTxHash(hash);
      } catch (error) {
        toast({
          title: 'Transaction Failed',
          description: handleViemError(error, fallbackErrorMessage),
          duration: 5000,
          variant: 'destructive',
        });
        onError?.(error as Error);
      }
    },
    [
      resetWrite,
      validateAndSwitchChain,
      writeContractAsync,
      toast,
      fallbackErrorMessage,
      onError,
      onTxHash,
    ]
  );

  // Custom send calls function that handles chain validation
  const sapiensSendCalls = useCallback(
    async (...args: Parameters<typeof sendCallsAsync>) => {
      const _chainId = args[0].chainId;
      if (!_chainId) {
        throw new Error('Chain ID is required');
      }

      setChainId(_chainId);
      try {
        // Reset state
        setTxHash(undefined);
        resetCalls();

        // Validate and switch chain if needed
        await validateAndSwitchChain(_chainId);

        // Execute the batch calls and wait for receipts to obtain a hash
        const data = await sendCallsAsync(args[0]);
        const result = await waitForCallsStatus(client!, { id: data.id });
        const transactionHash = result?.receipts?.[0]?.transactionHash;
        if (transactionHash) {
          onTxHash?.(transactionHash);
          setTxHash(transactionHash);
        }
      } catch (error) {
        toast({
          title: 'Transaction Failed',
          description: handleViemError(error, fallbackErrorMessage),
          duration: 5000,
          variant: 'destructive',
        });
        onError?.(error as Error);
      }
    },
    [
      resetCalls,
      validateAndSwitchChain,
      sendCallsAsync,
      client,
      toast,
      fallbackErrorMessage,
      onError,
      onTxHash,
    ]
  );

  const handleTxSuccess = useCallback(
    (receipt: ReturnType<typeof useTransaction>['data']) => {
      if (!txHash) return;

      toast({
        title: 'Success',
        description: successMessage,
        duration: 5000,
      });

      onSuccess?.(receipt);
      setTxHash(undefined);
    },
    [txHash, toast, successMessage, onSuccess]
  );

  const handleTxError = useCallback(
    (error: Error) => {
      if (!txHash) return;

      toast({
        title: 'Transaction Failed',
        description: handleViemError(error, fallbackErrorMessage),
        duration: 5000,
        variant: 'destructive',
      });

      onError?.(error);
      setTxHash(undefined);
    },
    [txHash, toast, fallbackErrorMessage, onError]
  );

  // Transaction monitoring via useMonitorTxStatus with stable callbacks
  const { isPending: txPending } = useMonitorTxStatus({
    hash: txHash,
    chainId,
    onSuccess: handleTxSuccess,
    onError: handleTxError,
  });

  const isMining = Boolean(txHash) && Boolean(txPending);

  return useMemo(
    () => ({
      writeContract: sapiensWriteContract,
      sendCalls: sapiensSendCalls,
      isPending: isWritingContract || isSendingCalls || isMining,
      reset: resetWrite,
      resetCalls,
    }),
    [
      sapiensWriteContract,
      sapiensSendCalls,
      isWritingContract,
      isSendingCalls,
      isMining,
      resetWrite,
      resetCalls,
    ]
  );
}
