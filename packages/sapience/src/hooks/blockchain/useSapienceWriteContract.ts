'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { useTransactionReceipt } from 'wagmi';
import {
  useWriteContract,
  useSendCalls,
  useConnectorClient,
  useAccount,
} from 'wagmi';
import type { Hash } from 'viem';
import { encodeFunctionData } from 'viem';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';

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
  redirectProfileAnchor?: 'trades' | 'parlays' | 'lp' | 'forecasts';
}

export function useSapienceWriteContract({
  onSuccess,
  onError,
  onTxHash,
  successMessage,
  fallbackErrorMessage = 'Transaction failed',
  redirectProfileAnchor,
}: useSapienceWriteContractProps) {
  const { data: client } = useConnectorClient();
  const [txHash, setTxHash] = useState<Hash | undefined>(undefined);
  const { toast } = useToast();
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { wallets } = useWallets();
  const { user, login } = usePrivy();
  const { address: wagmiAddress } = useAccount();
  const router = useRouter();
  const didRedirectRef = useRef(false);
  const didShowSuccessToastRef = useRef(false);
  const embeddedWallet = useMemo(() => {
    const match = wallets?.find(
      (wallet) => (wallet as any)?.walletClientType === 'privy'
    );
    return match;
  }, [wallets]);
  const isEmbeddedWallet = Boolean(embeddedWallet);
  const ensureEmbeddedAuth = useCallback(async () => {
    if (!isEmbeddedWallet) return true;
    if (user?.wallet?.id) return true;
    try {
      if (!login) return false;
      await Promise.resolve(login());
      return Boolean(user?.wallet?.id);
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [isEmbeddedWallet, login, user?.wallet?.id]);

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

  const maybeRedirectToProfile = useCallback(() => {
    if (!redirectProfileAnchor) return; // Opt-in only
    if (didRedirectRef.current) return; // Guard against double navigation
    if (typeof window === 'undefined') return; // SSR safety

    try {
      const connectedAddress = wagmiAddress || (wallets?.[0] as any)?.address;
      if (!connectedAddress) return; // No address available yet
      const addressLower = String(connectedAddress).toLowerCase();
      didRedirectRef.current = true;
      router.push(`/profile/${addressLower}#${redirectProfileAnchor}`);
    } catch (e) {
      console.error(e);
      // noop on navigation errors
    }
  }, [redirectProfileAnchor, wallets, wagmiAddress, router]);

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
        didRedirectRef.current = false;
        didShowSuccessToastRef.current = false;

        // Validate and switch chain if needed
        await validateAndSwitchChain(_chainId);

        // If using an embedded wallet, route via backend sponsorship endpoint as a single-call batch
        if (isEmbeddedWallet) {
          setIsSubmitting(true);
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
          const ok = await ensureEmbeddedAuth();
          const walletId = user?.wallet?.id;
          if (!ok || !walletId) {
            throw new Error('Authentication required. Please try again.');
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
            // Redirect as soon as a tx hash is known
            maybeRedirectToProfile();
            // Show success toast after navigation so it appears on profile
            try {
              toast({
                title: successTitle,
                description: formatSuccessDescription(successMessage),
                duration: 5000,
              });
              didShowSuccessToastRef.current = true;
            } catch (e) {
              console.error(e);
            }
            onTxHash?.(maybeHash as Hash);
            setTxHash(maybeHash as Hash);
            setIsSubmitting(false);
          } else {
            // No hash available; redirect before showing success toast
            maybeRedirectToProfile();
            toast({
              title: successTitle,
              description: formatSuccessDescription(successMessage),
              duration: 5000,
            });
            onSuccess?.(undefined as any);
            didShowSuccessToastRef.current = true;
            setIsSubmitting(false);
          }
        } else {
          // Execute the transaction and set hash when resolved
          const hash = await writeContractAsync(...args);
          // Redirect as soon as a tx hash is known
          maybeRedirectToProfile();
          // Show success toast after navigation so it appears on profile
          try {
            toast({
              title: successTitle,
              description: formatSuccessDescription(successMessage),
              duration: 5000,
            });
            didShowSuccessToastRef.current = true;
          } catch (e) {
            console.error(e);
          }
          onTxHash?.(hash);
          setTxHash(hash);
        }
      } catch (error) {
        setIsSubmitting(false);
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
      maybeRedirectToProfile,
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
        didRedirectRef.current = false;
        didShowSuccessToastRef.current = false;

        // Validate and switch chain if needed
        await validateAndSwitchChain(_chainId);
        // Execute the batch calls
        const data = isEmbeddedWallet
          ? // Route via backend sponsorship endpoint for embedded wallets
            await (async () => {
              setIsSubmitting(true);
              const body = (args[0] as any) ?? {};
              const calls = Array.isArray(body?.calls) ? body.calls : [];
              let lastResult: any = undefined;
              const ok = await ensureEmbeddedAuth();
              const walletId = user?.wallet?.id;
              if (!ok || !walletId) {
                throw new Error('Authentication required. Please try again.');
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
              setIsSubmitting(false);
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
              // Redirect as soon as a tx hash is known
              maybeRedirectToProfile();
              // Show success toast after navigation so it appears on profile
              try {
                toast({
                  title: successTitle,
                  description: formatSuccessDescription(successMessage),
                  duration: 5000,
                });
                didShowSuccessToastRef.current = true;
              } catch (e) {
                console.error(e);
              }
              onTxHash?.(transactionHash);
              setTxHash(transactionHash);
              setIsSubmitting(false);
            } else {
              // No tx hash available from aggregator; consider operation successful.
              // Redirect before showing success toast
              maybeRedirectToProfile();
              toast({
                title: successTitle,
                description: formatSuccessDescription(successMessage),
                duration: 5000,
              });
              onSuccess?.(undefined as any);
              didShowSuccessToastRef.current = true;
            }
          } else {
            // Embedded path or fallback path without aggregator id.
            const transactionHash =
              data?.receipts?.[0]?.transactionHash ||
              data?.transactionHash ||
              data?.txHash;
            if (transactionHash) {
              // Redirect as soon as a tx hash is known
              maybeRedirectToProfile();
              // Show success toast after navigation so it appears on profile
              try {
                toast({
                  title: successTitle,
                  description: formatSuccessDescription(successMessage),
                  duration: 5000,
                });
                didShowSuccessToastRef.current = true;
              } catch (e) {
                console.error(e);
              }
              onTxHash?.(transactionHash);
              setTxHash(transactionHash);
              setIsSubmitting(false);
              return;
            }
            // Fallback path without aggregator id.
            // Redirect before showing success toast
            maybeRedirectToProfile();
            toast({
              title: successTitle,
              description: formatSuccessDescription(successMessage),
              duration: 5000,
            });
            onSuccess?.(undefined as any);
            didShowSuccessToastRef.current = true;
            setIsSubmitting(false);
          }
        } catch (e) {
          console.error(e);
          // `wallet_getCallsStatus` unsupported or failed; assume success since `sendCalls` resolved.
          // Redirect before showing success toast
          maybeRedirectToProfile();
          toast({
            title: successTitle,
            description: formatSuccessDescription(successMessage),
            duration: 5000,
          });
          onSuccess?.(undefined as any);
          didShowSuccessToastRef.current = true;
          setIsSubmitting(false);
        }
      } catch (error) {
        setIsSubmitting(false);
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
      maybeRedirectToProfile,
    ]
  );

  const handleTxSuccess = useCallback(
    (receipt: ReturnType<typeof useTransactionReceipt>['data']) => {
      if (!txHash) return;
      // Avoid duplicate success toast if already shown after redirect
      if (!didShowSuccessToastRef.current) {
        toast({
          title: successTitle,
          description: formatSuccessDescription(successMessage),
          duration: 5000,
        });
      }
      onSuccess?.(receipt);
      setTxHash(undefined);
      setIsSubmitting(false);
      didShowSuccessToastRef.current = false;
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
      setIsSubmitting(false);
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
      isPending:
        isWritingContract || isSendingCalls || isMining || isSubmitting,
      reset: resetWrite,
      resetCalls,
    }),
    [
      sapienceWriteContract,
      sapienceSendCalls,
      isWritingContract,
      isSendingCalls,
      isMining,
      isSubmitting,
      resetWrite,
      resetCalls,
    ]
  );
}
