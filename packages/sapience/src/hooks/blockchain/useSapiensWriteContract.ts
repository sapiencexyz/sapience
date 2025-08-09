import { useCallback, useState } from 'react';
import type { useTransaction } from 'wagmi';
import { useWriteContract, useSendCalls } from 'wagmi';
import type { Hash } from 'viem';

import { useToast } from '@sapience/ui/hooks/use-toast';
import { handleViemError } from '~/utils/blockchain/handleViemError';
import { useMonitorTxStatus } from '~/hooks/blockchain/useMonitorTxStatus';
import { useChainValidation } from '~/hooks/blockchain/useChainValidation';

interface UseSapiensWriteContractProps {
  onSuccess?: (receipt: ReturnType<typeof useTransaction>['data']) => void;
  onError?: (error: Error) => void;
  onLoading?: (isLoading: boolean) => void;
  successMessage?: string;
  fallbackErrorMessage?: string;
}

export function useSapiensWriteContract({
  onSuccess,
  onError,
  onLoading,
  successMessage = 'Transaction completed successfully',
  fallbackErrorMessage = 'Transaction failed',
}: UseSapiensWriteContractProps) {
  const [txHash, setTxHash] = useState<Hash | undefined>(undefined);
  const { toast } = useToast();

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

  // Wagmi write contract hook
  const {
    writeContract,
    isPending: isWritingContract,
    reset,
  } = useWriteContract({
    mutation: {
      onSuccess: setTxHash,
      onError: (error) => {
        toast({
          title: 'Transaction Failed',
          description: handleViemError(error, fallbackErrorMessage),
          duration: 5000,
          variant: 'destructive',
        });
        onError?.(error);
      },
    },
  });

  // Wagmi send calls hook
  const {
    sendCalls,
    isPending: isSendingCalls,
    reset: resetCalls,
  } = useSendCalls({
    mutation: {
      onSuccess: (data) => {
        debugger;
        setTxHash(data.capabilities?.transactionHash);
      },
      onError: (error) => {
        toast({
          title: 'Transaction Failed',
          description: handleViemError(error, fallbackErrorMessage),
          duration: 5000,
          variant: 'destructive',
        });
        onError?.(error);
      },
    },
  });

  // Transaction monitoring
  // const { isPending: isMining } = useMonitorTxStatus({
  //   hash: txHash,
  //   chainId,
  //   onSuccess: (receipt) => {
  //     toast({
  //       title: 'Success',
  //       description: successMessage,
  //       duration: 5000,
  //     });
  //     onSuccess?.(receipt);
  //   },
  //   onError: (error) => {
  //     toast({
  //       title: 'Transaction Failed',
  //       description: handleViemError(error, fallbackErrorMessage),
  //       duration: 5000,
  //       variant: 'destructive',
  //     });
  //     onError?.(error);
  //   },
  //   onLoading,
  // });

  // Custom write contract function that handles chain validation
  const sapiensWriteContract = useCallback(
    async (...args: Parameters<typeof writeContract>) => {
      const _chainId = args[0].chainId;
      if (!_chainId) {
        throw new Error('Chain ID is required');
      }
      try {
        // Reset state
        setTxHash(undefined);
        reset();

        // Validate and switch chain if needed
        await validateAndSwitchChain(_chainId);

        // Execute the transaction
        writeContract(...args);
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
      reset,
      validateAndSwitchChain,
      writeContract,
      toast,
      fallbackErrorMessage,
      onError,
    ]
  );

  // Custom send calls function that handles chain validation
  const sapiensSendCalls = useCallback(
    async (...args: Parameters<typeof sendCalls>) => {
      const _chainId = args[0].chainId;
      if (!_chainId) {
        throw new Error('Chain ID is required');
      }
      try {
        // Reset state
        setTxHash(undefined);
        resetCalls();

        // Validate and switch chain if needed
        await validateAndSwitchChain(_chainId);

        // Execute the batch calls
        sendCalls(args[0]);
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
      sendCalls,
      toast,
      fallbackErrorMessage,
      onError,
    ]
  );

  return {
    writeContract: sapiensWriteContract,
    sendCalls: sapiensSendCalls,
    txHash,
    isPending: isWritingContract || isSendingCalls, //|| isMining,
    reset,
    resetCalls,
  };
}
