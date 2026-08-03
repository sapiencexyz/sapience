'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { useTransactionReceipt } from 'wagmi';
import {
  useWriteContract,
  useSendCalls,
  useConnectorClient,
  useAccount,
} from 'wagmi';
import type { Hash, Hex } from 'viem';

import { resolveEoaBatchResult } from './transactionExecutor';
import { useToast } from '~/hooks/use-toast';

import { handleViemError } from '~/lib/utils/handleViemError';
import { useChainValidation } from '~/hooks/blockchain/useChainValidation';
import { useMonitorTxStatus } from '~/hooks/blockchain/useMonitorTxStatus';

// Type for individual call in send calls (simplified from wagmi's complex generic type)
interface SendCall {
  to: `0x${string}`;
  data?: Hex;
  value?: bigint;
}

// Simplified type for send calls parameters (wagmi's type has complex generics we don't need)
interface SendCallsParams {
  chainId?: number;
  calls?: SendCall[];
}

// Success toast messages
const SUCCESS_TITLE = 'Transaction successfully submitted.';
const SUCCESS_SUFFIX =
  'It may take a few moments for the transaction to be processed and reflected in the app.';

function formatSuccessDescription(message?: string): string {
  return message ? `${message}\n\n${SUCCESS_SUFFIX}` : SUCCESS_SUFFIX;
}

interface useSapienceWriteContractProps {
  onSuccess?: (
    receipt: ReturnType<typeof useTransactionReceipt>['data']
  ) => void;
  onError?: (error: Error) => void;
  onTxHash?: (txHash: Hash) => void;
  successMessage?: string;
  fallbackErrorMessage?: string;
  /**
   * If true, disables the success toast notification.
   */
  disableSuccessToast?: boolean;
}

export function useSapienceWriteContract({
  onSuccess,
  onError,
  onTxHash,
  successMessage,
  fallbackErrorMessage = 'Transaction failed',
  disableSuccessToast = false,
}: useSapienceWriteContractProps) {
  const { data: client } = useConnectorClient();
  const { address: wagmiAddress } = useAccount();

  const [txHash, setTxHash] = useState<Hash | undefined>(undefined);
  const { toast } = useToast();
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const didShowSuccessToastRef = useRef(false);

  // Unified completion handler for both transaction paths
  const completeTransaction = useCallback(
    (hash?: Hash) => {
      if (hash) {
        onTxHash?.(hash);
        setTxHash(hash);
      } else {
        onSuccess?.(undefined);
      }

      if (!disableSuccessToast && !didShowSuccessToastRef.current) {
        try {
          toast({
            title: SUCCESS_TITLE,
            description: formatSuccessDescription(successMessage),
            duration: 5000,
          });
          didShowSuccessToastRef.current = true;
        } catch (e) {
          console.error(e);
        }
      }
    },
    [onTxHash, onSuccess, toast, successMessage, disableSuccessToast]
  );

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

  const handleCatchError = useCallback(
    (error: unknown) => {
      toast({
        title: 'Transaction Failed',
        description: handleViemError(error, fallbackErrorMessage),
        duration: 5000,
        variant: 'destructive',
      });
      onError?.(error as Error);
    },
    [toast, fallbackErrorMessage, onError]
  );

  // Custom write contract function that handles chain validation
  const sapienceWriteContract = useCallback(
    async (...args: Parameters<typeof writeContractAsync>) => {
      const _chainId = args[0].chainId;
      if (!_chainId) {
        throw new Error('Chain ID is required');
      }
      setChainId(_chainId);

      try {
        setTxHash(undefined);
        resetWrite();
        didShowSuccessToastRef.current = false;

        if (!wagmiAddress) {
          throw new Error('No wallet connected');
        }

        await validateAndSwitchChain(_chainId);
        const hash = await writeContractAsync(...args);

        completeTransaction(hash);
      } catch (error) {
        handleCatchError(error);
      }
    },
    [
      resetWrite,
      validateAndSwitchChain,
      writeContractAsync,
      completeTransaction,
      handleCatchError,
      wagmiAddress,
    ]
  );

  // Custom send calls function that handles chain validation
  const sapienceSendCalls = useCallback(
    async (...args: Parameters<typeof sendCallsAsync>) => {
      const _chainId = args[0].chainId;
      if (!_chainId) {
        throw new Error('Chain ID is required');
      }

      setChainId(_chainId);

      try {
        setTxHash(undefined);
        resetCalls();
        didShowSuccessToastRef.current = false;

        if (!wagmiAddress) {
          throw new Error('No wallet connected');
        }

        const body = (args[0] ?? {}) as SendCallsParams;
        const rawCalls: SendCall[] = Array.isArray(body?.calls)
          ? body.calls
          : [];
        if (rawCalls.length === 0) {
          throw new Error('No calls to execute');
        }

        await validateAndSwitchChain(_chainId);
        const result = await sendCallsAsync(...args);

        // EIP-5792 returns a batch id; poll it for the settled transaction hash
        const finalHash = (await resolveEoaBatchResult(result, client)) as
          | Hash
          | undefined;
        completeTransaction(finalHash);
      } catch (error) {
        handleCatchError(error);
      }
    },
    [
      resetCalls,
      validateAndSwitchChain,
      sendCallsAsync,
      client,
      completeTransaction,
      handleCatchError,
      wagmiAddress,
    ]
  );

  const handleTxSuccess = useCallback(
    (receipt: ReturnType<typeof useTransactionReceipt>['data']) => {
      if (!txHash) return;
      onSuccess?.(receipt);
      setTxHash(undefined);
      didShowSuccessToastRef.current = false;
    },
    [txHash, onSuccess]
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
      writeContract: sapienceWriteContract,
      sendCalls: sapienceSendCalls,
      isPending: isWritingContract || isSendingCalls || isMining,
      reset: resetWrite,
      resetCalls,
    }),
    [
      sapienceWriteContract,
      sapienceSendCalls,
      isWritingContract,
      isSendingCalls,
      isMining,
      resetWrite,
      resetCalls,
    ]
  );
}
