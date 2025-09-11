import { useCallback, useMemo, useState } from 'react';
import type { useTransactionReceipt } from 'wagmi';
import { useWriteContract, useSendCalls, useConnectorClient } from 'wagmi';
import type { Hash } from 'viem';
import { encodeFunctionData } from 'viem';
import { useWallets, usePrivy } from '@privy-io/react-auth';

import { useToast } from '@sapience/ui/hooks/use-toast';
import { waitForCallsStatus } from 'viem/actions';
import { handleViemError } from '~/utils/blockchain/handleViemError';
import { useChainValidation } from '~/hooks/blockchain/useChainValidation';
import { useMonitorTxStatus } from '~/hooks/blockchain/useMonitorTxStatus';

interface useSapienceWriteContractProps {
  onSuccess?: (
    receipt: ReturnType<typeof useTransactionReceipt>['data']
  ) => void;
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
  const { wallets } = useWallets();
  const { user } = usePrivy();
  const embeddedWallet = useMemo(() => {
    const match = wallets?.find(
      (wallet) => (wallet as any)?.walletClientType === 'privy'
    );
    return match;
  }, [wallets]);
  const isEmbeddedWallet = Boolean(embeddedWallet);

  // Unified success toast formatting
  const successTitle = 'Transaction successfully submitted.';
  const successSuffixNote =
    'It may take a few moments for the transaction to be processed and reflected in the app.';
  const formatSuccessDescription = (message?: string) =>
    message && message.length > 0
      ? `${message}\n\n${successSuffixNote}`
      : successSuffixNote;

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
  const sapienceWriteContract = useCallback(
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

        // If using an embedded wallet, route via backend sponsorship endpoint as a single-call batch
        if (isEmbeddedWallet) {
          const params = args[0];
          const {
            address,
            abi,
            functionName,
            args: fnArgs,
            value,
          } = params as any;
          const calldata = encodeFunctionData({
            abi,
            functionName,
            args: fnArgs,
          });
          const walletId = user?.wallet?.id;
          if (!walletId) {
            throw new Error(
              'Embedded walletId not found for sponsorship. Please relogin.'
            );
          }
          const response = await fetch('/api/privy/send-calls', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              walletId,
              chainId: Number(_chainId),
              to: address,
              data: calldata,
              value: value ?? '0x0',
              sponsor: true,
            }),
          });
          if (!response.ok) {
            const errText = await response.text();
            // Minimal debug info to help diagnose missing fields during development
            if (
              typeof console !== 'undefined' &&
              typeof console.warn === 'function'
            ) {
              console.warn('[Privy send-calls] request body', {
                walletId,
                chainId: _chainId,
                to: address,
                hasData: Boolean(calldata),
              });
            }
            throw new Error(errText || 'Sponsored transaction request failed');
          }
          const data = await response.json();
          const maybeHash: string | undefined =
            data?.receipts?.[0]?.transactionHash ||
            data?.transactionHash ||
            data?.txHash;
          if (maybeHash) {
            onTxHash?.(maybeHash as Hash);
            setTxHash(maybeHash as Hash);
          } else {
            toast({
              title: successTitle,
              description: formatSuccessDescription(successMessage),
              duration: 5000,
            });
            onSuccess?.(undefined as any);
          }
        } else {
          // Execute the transaction and set hash when resolved
          const hash = await writeContractAsync(...args);
          onTxHash?.(hash);
          setTxHash(hash);
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
      resetWrite,
      validateAndSwitchChain,
      writeContractAsync,
      isEmbeddedWallet,
      embeddedWallet,
      toast,
      fallbackErrorMessage,
      onError,
      onTxHash,
      user,
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
        // Reset state
        setTxHash(undefined);
        resetCalls();

        // Validate and switch chain if needed
        await validateAndSwitchChain(_chainId);
        // Execute the batch calls
        const data = isEmbeddedWallet
          ? // Route via backend sponsorship endpoint for embedded wallets
            await (async () => {
              const body = (args[0] as any) ?? {};
              const calls = Array.isArray(body?.calls) ? body.calls : [];
              let lastResult: any = undefined;
              const walletId = user?.wallet?.id;
              if (!walletId) {
                throw new Error(
                  'Embedded walletId not found for sponsorship. Please relogin.'
                );
              }
              // Execute each call sequentially as individual sponsored txs
              for (const call of calls) {
                const response = await fetch('/api/privy/send-calls', {
                  method: 'POST',
                  headers: {
                    'content-type': 'application/json',
                  },
                  credentials: 'include',
                  body: JSON.stringify({
                    walletId,
                    chainId: Number(_chainId),
                    to: call.to,
                    data: call.data,
                    value: call.value ?? '0x0',
                    sponsor: true,
                  }),
                });
                if (!response.ok) {
                  const errText = await response.text();
                  if (
                    typeof console !== 'undefined' &&
                    typeof console.warn === 'function'
                  ) {
                    console.warn('[Privy send-calls batch] request body', {
                      walletId,
                      chainId: _chainId,
                      to: call.to,
                      hasData: Boolean(call.data),
                    });
                  }
                  throw new Error(
                    errText || 'Sponsored transaction request failed'
                  );
                }
                lastResult = await response.json();
              }
              return lastResult;
            })()
          : // Use wallet_sendCalls with fallback for non-embedded wallets
            await sendCallsAsync({
              ...(args[0] as any),
              experimental_fallback: true,
            });
        // If the wallet supports EIP-5792, we can poll for calls status using the returned id.
        // If it does not (fallback path), `waitForCallsStatus` may throw or `id` may be unusable.
        try {
          if (!isEmbeddedWallet && data?.id) {
            const result = await waitForCallsStatus(client!, { id: data.id });
            const transactionHash = result?.receipts?.[0]?.transactionHash;
            if (transactionHash) {
              onTxHash?.(transactionHash);
              setTxHash(transactionHash);
            } else {
              // No tx hash available from aggregator; consider operation successful.
              toast({
                title: successTitle,
                description: formatSuccessDescription(successMessage),
                duration: 5000,
              });
              onSuccess?.(undefined as any);
            }
          } else {
            // Embedded path or fallback path without aggregator id.
            const transactionHash =
              data?.receipts?.[0]?.transactionHash ||
              data?.transactionHash ||
              data?.txHash;
            if (transactionHash) {
              onTxHash?.(transactionHash);
              setTxHash(transactionHash);
              return;
            }
            // Fallback path without aggregator id.
            toast({
              title: successTitle,
              description: formatSuccessDescription(successMessage),
              duration: 5000,
            });
            onSuccess?.(undefined as any);
          }
        } catch {
          // `wallet_getCallsStatus` unsupported or failed; assume success since `sendCalls` resolved.
          toast({
            title: successTitle,
            description: formatSuccessDescription(successMessage),
            duration: 5000,
          });
          onSuccess?.(undefined as any);
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
      embeddedWallet,
      toast,
      fallbackErrorMessage,
      onError,
      onTxHash,
      isEmbeddedWallet,
      user,
    ]
  );

  const handleTxSuccess = useCallback(
    (receipt: ReturnType<typeof useTransactionReceipt>['data']) => {
      if (!txHash) return;

      toast({
        title: successTitle,
        description: formatSuccessDescription(successMessage),
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
