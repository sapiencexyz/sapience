'use client';
import { useCallback, useMemo, useRef, useState, useContext } from 'react';
import type { useTransactionReceipt } from 'wagmi';
import {
  useWriteContract,
  useSendCalls,
  useConnectorClient,
  useAccount,
} from 'wagmi';
import type { Abi, EIP1193Provider, Hash, Hex } from 'viem';
import { encodeFunctionData, parseAbi } from 'viem';

import { useRouter } from 'next/navigation';

import { useToast } from '@sapience/ui/hooks/use-toast';
import { waitForCallsStatus } from 'viem/actions';
import { handleViemError } from '~/utils/blockchain/handleViemError';
import { useChainValidation } from '~/hooks/blockchain/useChainValidation';
import { useMonitorTxStatus } from '~/hooks/blockchain/useMonitorTxStatus';
import { CreatePositionContext } from '~/lib/context/CreatePositionContext';
import { useSession } from '~/lib/context/SessionContext';
import {
  ethereal,
  executeSudoTransaction,
  type OwnerSigner,
} from '~/lib/session/sessionKeyManager';
import { arbitrum } from 'viem/chains';
import { useSwitchChain } from 'wagmi';

import {
  type TransactionCall,
  type WriteContractParams,
  type ExecutionPath,
  type SessionClient,
  getExecutionPath,
  prepareCallsWithWrapping,
  encodeWriteContractToCall,
  isEtherealChain,
  formatSessionError,
  pickFinalTransactionHash,
  executeViaSessionKeyDefault,
  executeTransaction,
  CHAIN_ID_ETHEREAL,
  WUSDE_ADDRESS,
  WUSDE_ABI,
  createWrapTransaction,
} from './transactionExecutor';

// Re-export types used by consumers
export type { TransactionCall, WriteContractParams };

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
  redirectProfileAnchor?: 'positions' | 'forecasts';
  /**
   * Specifies which page to redirect to after successful transaction.
   * Defaults to 'profile' if redirectProfileAnchor is provided, otherwise no redirect.
   * When set to 'markets', redirects to '/markets' and clears the position form.
   */
  redirectPage?: 'profile' | 'markets';
  /**
   * If true, disables the success toast notification.
   */
  disableSuccessToast?: boolean;
  /**
   * If true, disables automatic redirect after transaction success.
   * Use `triggerRedirect()` returned from the hook to manually trigger redirect.
   */
  disableAutoRedirect?: boolean;
  /**
   * Called when transaction is about to be sent to the network.
   */
  onTxSending?: () => void;
  /**
   * Called when transaction hash is available (tx sent to network).
   */
  onTxSent?: (txHash: string) => void;
  /**
   * Called after on-chain receipt is confirmed.
   */
  onReceiptConfirmed?: () => void;
}

export function useSapienceWriteContract({
  onSuccess,
  onError,
  onTxHash,
  successMessage,
  fallbackErrorMessage = 'Transaction failed',
  redirectProfileAnchor,
  redirectPage = 'profile',
  disableSuccessToast = false,
  disableAutoRedirect = false,
  onTxSending,
  onTxSent,
  onReceiptConfirmed,
}: useSapienceWriteContractProps) {
  const { data: client } = useConnectorClient();
  const { address: wagmiAddress, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  // Session key support for gasless transactions
  const {
    isSessionActive,
    isUsingSession,
    isUsingSmartAccount,
    smartAccountAddress,
    chainClients,
    sessionConfig,
    hasArbitrumSession,
    createArbitrumSessionIfNeeded,
  } = useSession();

  // Check if session can handle a specific chain
  const canUseSessionForChain = useCallback(
    (chainId: number): boolean => {
      if (!isUsingSession) return false;
      if (!sessionConfig) return false;
      if (Date.now() > sessionConfig.expiresAt) return false;
      if (chainId === ethereal.id && chainClients.ethereal) return true;
      if (chainId === arbitrum.id) return true;
      return false;
    },
    [isUsingSession, sessionConfig, chainClients]
  );

  // Check if Arbitrum session needs to be created
  const needsArbitrumSession = useCallback(
    (chainId: number): boolean => {
      if (!isSessionActive || !sessionConfig) return false;
      if (chainId !== arbitrum.id) return false;
      return !hasArbitrumSession;
    },
    [isSessionActive, sessionConfig, hasArbitrumSession]
  );

  // Get the session client for a chain
  const getSessionClient = useCallback(
    (chainId: number) => {
      if (chainId === ethereal.id) return chainClients.ethereal;
      if (chainId === arbitrum.id) return chainClients.arbitrum;
      return null;
    },
    [chainClients]
  );

  // Determine execution path using pure function
  const getExecutionPathForChain = useCallback(
    (chainId: number): ExecutionPath => {
      return getExecutionPath(isUsingSmartAccount, canUseSessionForChain(chainId));
    },
    [isUsingSmartAccount, canUseSessionForChain]
  );

  // Create owner signer for smart account transactions without session
  const createOwnerSigner = useCallback(
    async (address: `0x${string}`): Promise<OwnerSigner> => {
      if (!connector) {
        throw new Error('No wallet connector available');
      }
      const provider = (await connector.getProvider()) as EIP1193Provider;
      return {
        address,
        provider,
        switchChain: async (chainId: number) => {
          try {
            await switchChainAsync({ chainId });
          } catch (error: unknown) {
            const err = error as { code?: number; message?: string };
            if (
              err?.code === 4902 ||
              err?.message?.includes('Unrecognized chain')
            ) {
              throw new Error(
                `Please add chain ${chainId} to your wallet first`
              );
            }
            throw error;
          }
        },
      };
    },
    [connector, switchChainAsync]
  );

  // Execute transaction via owner signing (smart account mode without session)
  const executeViaOwnerSigning = useCallback(
    async (calls: TransactionCall[], chainId: number): Promise<Hash> => {
      if (!wagmiAddress) {
        throw new Error('No wallet connected');
      }

      const ownerSigner = await createOwnerSigner(wagmiAddress);

      onTxSending?.();
      const txHash = await executeSudoTransaction(ownerSigner, calls, chainId);
      onTxSent?.(txHash);
      onReceiptConfirmed?.();

      return txHash;
    },
    [wagmiAddress, createOwnerSigner, onTxSending, onTxSent, onReceiptConfirmed]
  );

  // Execute via session key using the extracted pure function
  const executeViaSessionKey = useCallback(
    async (
      sessionClient: any,
      calls: TransactionCall[],
      chainId: number
    ): Promise<Hash> => {
      return executeViaSessionKeyDefault(sessionClient, calls, chainId, {
        sessionConfig,
        onTxSending,
        onTxSent,
        onReceiptConfirmed,
      });
    },
    [sessionConfig, onTxSending, onTxSent, onReceiptConfirmed]
  );

  const [txHash, setTxHash] = useState<Hash | undefined>(undefined);
  const { toast } = useToast();
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const router = useRouter();
  const didRedirectRef = useRef(false);
  const didShowSuccessToastRef = useRef(false);
  const transactionAddressRef = useRef<`0x${string}` | null>(null);
  const createPositionContext = useContext(CreatePositionContext);

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

  // Wagmi hooks
  const {
    writeContractAsync,
    isPending: isWritingContract,
    reset: resetWrite,
  } = useWriteContract();

  const {
    sendCallsAsync,
    isPending: isSendingCalls,
    reset: resetCalls,
  } = useSendCalls();

  const maybeRedirect = useCallback(() => {
    const shouldRedirectToProfile =
      redirectPage === 'profile' && redirectProfileAnchor;
    const shouldRedirectToMarkets = redirectPage === 'markets';

    if (!shouldRedirectToProfile && !shouldRedirectToMarkets) return;
    if (didRedirectRef.current) return;
    if (typeof window === 'undefined') return;

    try {
      didRedirectRef.current = true;

      if (shouldRedirectToMarkets) {
        router.push(`/${redirectPage}`);
        if (createPositionContext) {
          createPositionContext.clearPositionForm();
          createPositionContext.clearSelections();
        }
      } else if (shouldRedirectToProfile) {
        const connectedAddress =
          transactionAddressRef.current ??
          (isUsingSmartAccount && smartAccountAddress
            ? smartAccountAddress
            : wagmiAddress);
        if (!connectedAddress) return;
        const addressLower = String(connectedAddress).toLowerCase();
        const redirectUrl = `/${redirectPage}/${addressLower}#${redirectProfileAnchor}`;
        router.push(redirectUrl);
      }
    } catch (e) {
      console.error(e);
    }
  }, [
    redirectPage,
    redirectProfileAnchor,
    wagmiAddress,
    router,
    createPositionContext,
    isUsingSmartAccount,
    smartAccountAddress,
  ]);

  // Common success handler
  const handleTransactionSuccess = useCallback(
    (hash?: Hash) => {
      if (hash) {
        onTxHash?.(hash);
        setTxHash(hash);
      } else {
        onSuccess?.(undefined as any);
      }

      if (!disableAutoRedirect) {
        maybeRedirect();
      }

      if (!disableSuccessToast) {
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

      setIsSubmitting(false);
    },
    [
      onTxHash,
      setTxHash,
      onSuccess,
      maybeRedirect,
      toast,
      successMessage,
      disableSuccessToast,
      disableAutoRedirect,
    ]
  );

  // Helper to show success toast
  const showSuccessToast = useCallback(() => {
    if (disableSuccessToast || didShowSuccessToastRef.current) return;
    try {
      toast({
        title: SUCCESS_TITLE,
        description: formatSuccessDescription(successMessage),
        duration: 5000,
      });
      didShowSuccessToastRef.current = true;
    } catch {
      // Silently ignore toast errors
    }
  }, [disableSuccessToast, toast, successMessage]);

  // Helper to complete sendCalls with a tx hash
  const completeSendCallsWithHash = useCallback(
    (transactionHash: Hash) => {
      maybeRedirect();
      showSuccessToast();
      onTxHash?.(transactionHash);
      setTxHash(transactionHash);
      setIsSubmitting(false);
    },
    [maybeRedirect, showSuccessToast, onTxHash]
  );

  // Helper to complete sendCalls without a tx hash
  const completeSendCallsWithoutHash = useCallback(() => {
    maybeRedirect();
    showSuccessToast();
    onSuccess?.(undefined as any);
    setIsSubmitting(false);
  }, [maybeRedirect, showSuccessToast, onSuccess]);

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

        const executionPath = getExecutionPathForChain(_chainId);

        // Capture the address at transaction submission time
        transactionAddressRef.current =
          executionPath === 'eoa'
            ? (wagmiAddress ?? null)
            : (smartAccountAddress ?? wagmiAddress ?? null);

        // SESSION KEY PATH
        if (executionPath === 'session') {
          let sessionClient = getSessionClient(_chainId);

          if (needsArbitrumSession(_chainId)) {
            setIsSubmitting(true);
            try {
              sessionClient = await createArbitrumSessionIfNeeded();
            } catch (sessionCreateError) {
              console.error(
                '[Session] Failed to create Arbitrum session:',
                sessionCreateError
              );
              setIsSubmitting(false);
              throw new Error(
                'Please approve the Arbitrum session to continue'
              );
            }
          }

          if (sessionClient) {
            setIsSubmitting(true);
            const params = args[0] as WriteContractParams;
            const baseCalls: TransactionCall[] = [
              encodeWriteContractToCall(params),
            ];
            const calls = prepareCallsWithWrapping(baseCalls, _chainId);

            try {
              await executeViaSessionKey(sessionClient, calls, _chainId);
              handleTransactionSuccess();
              return;
            } catch (sessionError: unknown) {
              console.error('[Session] UserOperation failed:', sessionError);
              throw new Error(
                `Session key transaction failed: ${formatSessionError(sessionError)}`
              );
            }
          }
          // Fall through to owner path if sessionClient is null
        }

        // OWNER SIGNING PATH
        if (executionPath === 'owner' || (executionPath === 'session' && !getSessionClient(_chainId))) {
          setIsSubmitting(true);
          const params = args[0] as WriteContractParams;
          const baseCalls: TransactionCall[] = [
            encodeWriteContractToCall(params),
          ];
          const calls = prepareCallsWithWrapping(baseCalls, _chainId);

          try {
            const txHashFromOwner = await executeViaOwnerSigning(
              calls,
              _chainId
            );
            handleTransactionSuccess(txHashFromOwner);
            return;
          } catch (ownerError: unknown) {
            console.error('[Owner] Transaction failed:', ownerError);
            throw new Error(
              `Smart account transaction failed: ${formatSessionError(ownerError)}`
            );
          }
        }

        // EOA PATH
        await validateAndSwitchChain(_chainId);

        if (isEtherealChain(_chainId)) {
          const params = args[0] as WriteContractParams;
          const { value } = params;

          if (value && BigInt(value) > 0n) {
            const baseCalls: TransactionCall[] = [
              encodeWriteContractToCall(params),
            ];
            const calls = prepareCallsWithWrapping(baseCalls, _chainId);

            const result = await sendCallsAsync({
              chainId: _chainId,
              calls,
              experimental_fallback: true,
            });

            const transactionHash = pickFinalTransactionHash(result as any);
            handleTransactionSuccess(transactionHash as Hash | undefined);
          } else {
            const hash = await writeContractAsync(...args);
            handleTransactionSuccess(hash);
          }
        } else {
          const hash = await writeContractAsync(...args);
          handleTransactionSuccess(hash);
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
      toast,
      fallbackErrorMessage,
      onError,
      handleTransactionSuccess,
      prepareCallsWithWrapping,
      sendCallsAsync,
      getExecutionPathForChain,
      getSessionClient,
      needsArbitrumSession,
      createArbitrumSessionIfNeeded,
      executeViaSessionKey,
      executeViaOwnerSigning,
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

        const executionPath = getExecutionPathForChain(_chainId);

        transactionAddressRef.current =
          executionPath === 'eoa'
            ? (wagmiAddress ?? null)
            : (smartAccountAddress ?? wagmiAddress ?? null);

        // SESSION KEY PATH
        if (executionPath === 'session') {
          let sessionClient = getSessionClient(_chainId);

          if (needsArbitrumSession(_chainId)) {
            setIsSubmitting(true);
            try {
              sessionClient = await createArbitrumSessionIfNeeded();
            } catch (sessionCreateError) {
              console.error(
                '[Session] Failed to create Arbitrum session:',
                sessionCreateError
              );
              setIsSubmitting(false);
              throw new Error(
                'Please approve the Arbitrum session to continue'
              );
            }
          }

          if (sessionClient) {
            setIsSubmitting(true);
            const body = (args[0] ?? {}) as SendCallsParams;
            const calls: SendCall[] = Array.isArray(body?.calls)
              ? body.calls
              : [];

            if (calls.length === 0) {
              throw new Error('No calls to execute');
            }

            try {
              const baseCalls: TransactionCall[] = calls.map(
                (call: SendCall) => ({
                  to: call.to,
                  data: call.data ?? ('0x' as Hex),
                  value: call.value ? BigInt(call.value) : 0n,
                })
              );
              const formattedCalls = prepareCallsWithWrapping(
                baseCalls,
                _chainId
              );

              console.log(
                '[useSapienceWriteContract] Executing via session key...'
              );
              const userOpHash = await executeViaSessionKey(
                sessionClient,
                formattedCalls,
                _chainId
              );
              console.log(
                '[useSapienceWriteContract] Session key execution complete, userOpHash:',
                userOpHash
              );

              completeSendCallsWithoutHash();
              return;
            } catch (sessionError: unknown) {
              console.error('[Session] UserOperation failed:', sessionError);
              throw new Error(
                `Session key transaction failed: ${formatSessionError(sessionError)}`
              );
            }
          }
          // Fall through to owner path if sessionClient is null
        }

        // OWNER SIGNING PATH
        if (executionPath === 'owner' || (executionPath === 'session' && !getSessionClient(_chainId))) {
          setIsSubmitting(true);
          const body = (args[0] ?? {}) as SendCallsParams;
          const calls: SendCall[] = Array.isArray(body?.calls)
            ? body.calls
            : [];

          if (calls.length === 0) {
            throw new Error('No calls to execute');
          }

          try {
            const baseCalls: TransactionCall[] = calls.map(
              (call: SendCall) => ({
                to: call.to,
                data: call.data ?? ('0x' as Hex),
                value: call.value ? BigInt(call.value) : 0n,
              })
            );
            const formattedCalls = prepareCallsWithWrapping(
              baseCalls,
              _chainId
            );

            const txHashFromOwner = await executeViaOwnerSigning(
              formattedCalls,
              _chainId
            );

            completeSendCallsWithHash(txHashFromOwner);
            return;
          } catch (ownerError: unknown) {
            console.error('[Owner] Transaction failed:', ownerError);
            throw new Error(
              `Smart account transaction failed: ${formatSessionError(ownerError)}`
            );
          }
        }

        // EOA PATH
        await validateAndSwitchChain(_chainId);
        const data = await sendCallsAsync({
          ...args[0],
          experimental_fallback: true,
        });
        try {
          let transactionHash: string | undefined;

          if (data?.id) {
            const result = await waitForCallsStatus(client!, { id: data.id });
            transactionHash = pickFinalTransactionHash(result);
          } else {
            transactionHash = pickFinalTransactionHash(data);
          }

          if (transactionHash) {
            completeSendCallsWithHash(transactionHash as Hash);
          } else {
            completeSendCallsWithoutHash();
          }
        } catch (e) {
          console.error(e);
          completeSendCallsWithoutHash();
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
      toast,
      fallbackErrorMessage,
      onError,
      getExecutionPathForChain,
      getSessionClient,
      needsArbitrumSession,
      createArbitrumSessionIfNeeded,
      executeViaSessionKey,
      executeViaOwnerSigning,
      prepareCallsWithWrapping,
      completeSendCallsWithHash,
      completeSendCallsWithoutHash,
    ]
  );

  const handleTxSuccess = useCallback(
    (receipt: ReturnType<typeof useTransactionReceipt>['data']) => {
      if (!txHash) return;
      showSuccessToast();
      onSuccess?.(receipt);
      setTxHash(undefined);
      setIsSubmitting(false);
      didShowSuccessToastRef.current = false;
    },
    [txHash, showSuccessToast, onSuccess]
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
      triggerRedirect: maybeRedirect,
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
      maybeRedirect,
    ]
  );
}
