'use client';
import { useCallback, useMemo, useRef, useState, useContext } from 'react';
import type { useTransactionReceipt } from 'wagmi';
import {
  useWriteContract,
  useSendCalls,
  useConnectorClient,
  useAccount,
} from 'wagmi';
import type { Hash } from 'viem';
import { encodeFunctionData, parseAbi } from 'viem';
import { useRouter } from 'next/navigation';

import { useToast } from '@sapience/ui/hooks/use-toast';
import { waitForCallsStatus } from 'viem/actions';
import { handleViemError } from '~/utils/blockchain/handleViemError';
import { useChainValidation } from '~/hooks/blockchain/useChainValidation';
import { useMonitorTxStatus } from '~/hooks/blockchain/useMonitorTxStatus';
import { CreatePositionContext } from '~/lib/context/CreatePositionContext';
import { useSession } from '~/lib/context/SessionContext';
import { ethereal } from '~/lib/session/sessionKeyManager';
import { arbitrum } from 'viem/chains';

// Ethereal chain configuration
const CHAIN_ID_ETHEREAL = 5064014;
const WUSDE_ADDRESS = '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';
const WUSDE_ABI = parseAbi(['function deposit() payable']);

// Success toast messages
const SUCCESS_TITLE = 'Transaction successfully submitted.';
const SUCCESS_SUFFIX =
  'It may take a few moments for the transaction to be processed and reflected in the app.';

function formatSuccessDescription(message?: string): string {
  return message ? `${message}\n\n${SUCCESS_SUFFIX}` : SUCCESS_SUFFIX;
}

function formatSessionError(error: any): string {
  return error?.shortMessage || error?.message || 'Session transaction failed';
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

  // Session key support for gasless transactions
  const {
    isSessionActive,
    chainClients,
    sessionConfig,
    hasArbitrumSession,
    createArbitrumSessionIfNeeded,
  } = useSession();

  // Check if session can handle a specific chain
  // For Arbitrum, returns true even if session doesn't exist yet (will be created lazily)
  const canUseSessionForChain = useCallback(
    (chainId: number): boolean => {
      if (!isSessionActive || !sessionConfig) return false;
      if (Date.now() > sessionConfig.expiresAt) return false;
      if (chainId === ethereal.id && chainClients.ethereal) return true;
      // For Arbitrum, we can use session even if it doesn't exist yet (lazy creation)
      if (chainId === arbitrum.id) return true;
      return false;
    },
    [isSessionActive, sessionConfig, chainClients]
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
  const [txHash, setTxHash] = useState<Hash | undefined>(undefined);
  const { toast } = useToast();
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { address: wagmiAddress } = useAccount();
  const router = useRouter();
  const didRedirectRef = useRef(false);
  const didShowSuccessToastRef = useRef(false);
  // Get position form context - may be undefined if not within provider
  const createPositionContext = useContext(CreatePositionContext);

  // Helper to check if we're on Ethereal chain
  const isEtherealChain = (chainId: number): boolean =>
    chainId === CHAIN_ID_ETHEREAL;

  // Helper to create WUSDe wrap transaction for Ethereal chain
  const createWrapTransaction = useCallback(
    (amount: bigint) => ({
      to: WUSDE_ADDRESS as `0x${string}`,
      data: encodeFunctionData({
        abi: WUSDE_ABI,
        functionName: 'deposit',
      }),
      value: amount,
    }),
    []
  );

  const maybeRedirect = useCallback(() => {
    // Determine if we should redirect
    const shouldRedirectToProfile =
      redirectPage === 'profile' && redirectProfileAnchor;
    const shouldRedirectToMarkets = redirectPage === 'markets';

    if (!shouldRedirectToProfile && !shouldRedirectToMarkets) return;
    if (didRedirectRef.current) return; // Guard against double navigation
    if (typeof window === 'undefined') return; // SSR safety

    try {
      didRedirectRef.current = true;

      if (shouldRedirectToMarkets) {
        router.push(`/${redirectPage}`);
        // Clear position form after redirect
        if (createPositionContext) {
          createPositionContext.clearPositionForm();
          createPositionContext.clearSelections();
        }
      } else if (shouldRedirectToProfile) {
        // When session is active, redirect to smart account profile since that's where the attestation appears
        const connectedAddress =
          isSessionActive && sessionConfig?.smartAccountAddress
            ? sessionConfig.smartAccountAddress
            : wagmiAddress;
        if (!connectedAddress) return; // No address available yet
        const addressLower = String(connectedAddress).toLowerCase();
        const redirectUrl = `/${redirectPage}/${addressLower}#${redirectProfileAnchor}`;
        router.push(redirectUrl);
      }
    } catch (e) {
      console.error(e);
      // noop on navigation errors
    }
  }, [
    redirectPage,
    redirectProfileAnchor,
    wagmiAddress,
    router,
    createPositionContext,
    isSessionActive,
    sessionConfig,
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

      // Only redirect automatically if not disabled
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

  const pickFinalTransactionHash = useCallback(
    (data: any): string | undefined => {
      const receipts = data?.receipts;
      if (Array.isArray(receipts) && receipts.length > 0) {
        for (let i = receipts.length - 1; i >= 0; i--) {
          const h = receipts?.[i]?.transactionHash;
          if (typeof h === 'string' && h.length > 0) return h;
        }
      }
      if (typeof data?.transactionHash === 'string')
        return data.transactionHash;
      if (typeof data?.txHash === 'string') return data.txHash;
      return undefined;
    },
    []
  );

  // Helper to show success toast (used by sendCalls in multiple places)
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

  // Helper to execute transaction via session key (shared by writeContract and sendCalls)
  const executeViaSessionKey = useCallback(
    async (
      sessionClient: NonNullable<typeof chainClients.ethereal>,
      calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }>,
      _chainId: number
    ): Promise<Hash> => {
      const timings: Record<string, number> = {};
      const startTime = Date.now();

      // Check session expiration before attempting transaction
      if (sessionConfig) {
        const nowMs = Date.now();
        const msRemaining = sessionConfig.expiresAt - nowMs;

        if (nowMs > sessionConfig.expiresAt) {
          throw new Error(
            `Session expired ${Math.abs(msRemaining / 1000 / 60).toFixed(0)} minutes ago. Please end the current session and start a new one.`
          );
        }
      }

      // Step 1: Encode calls
      const encodeStart = Date.now();
      const encodedCalls = await sessionClient.account.encodeCalls(calls);
      timings.encodeCallsMs = Date.now() - encodeStart;

      // Notify that tx is about to be sent to bundler
      onTxSending?.();

      // Step 2: Send user operation to bundler
      // Internally this does: gas estimation → paymaster sponsorship → sign → send to bundler
      const sendStart = Date.now();
      const userOpHash = await sessionClient.sendUserOperation({
        callData: encodedCalls,
      });
      timings.sendUserOpMs = Date.now() - sendStart;

      // Notify that bundler accepted - now waiting for block inclusion
      onTxSent?.(userOpHash);

      // Step 3: Wait for bundler to include user op in a block
      const waitStart = Date.now();
      const receipt = await sessionClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      timings.waitForReceiptMs = Date.now() - waitStart;

      const txHash = receipt.receipt.transactionHash;

      // Notify that receipt was confirmed - now waiting for indexer
      onReceiptConfirmed?.();

      // Log final summary
      timings.totalMs = Date.now() - startTime;
      console.log('[SessionTx] ═══════════════════════════════════════════');
      console.log('[SessionTx] TIMING BREAKDOWN:');
      console.log(
        `[SessionTx]   1. encodeCalls:          ${String(timings.encodeCallsMs).padStart(5)}ms`
      );
      console.log(
        `[SessionTx]   2. sendUserOperation:    ${String(timings.sendUserOpMs).padStart(5)}ms  ← (paymaster + bundler submit)`
      );
      console.log(
        `[SessionTx]   3. waitForReceipt:       ${String(timings.waitForReceiptMs).padStart(5)}ms  ← (block confirmation)`
      );
      console.log(`[SessionTx]   ─────────────────────────────`);
      console.log(
        `[SessionTx]   TOTAL:                   ${String(timings.totalMs).padStart(5)}ms`
      );
      console.log('[SessionTx] ═══════════════════════════════════════════');

      return txHash;
    },
    [sessionConfig, onTxSending, onTxSent, onReceiptConfirmed]
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
        // Reset state
        setTxHash(undefined);
        resetWrite();
        didRedirectRef.current = false;
        didShowSuccessToastRef.current = false;

        // SESSION KEY PATH: If session is active and supports this chain, use gasless execution
        if (canUseSessionForChain(_chainId)) {
          // Get session client, creating Arbitrum session lazily if needed
          let sessionClient = getSessionClient(_chainId);

          if (needsArbitrumSession(_chainId)) {
            setIsSubmitting(true);
            try {
              // Use returned client directly to avoid race condition with state updates
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
            const params = args[0];
            const {
              address,
              abi,
              functionName,
              args: fnArgs,
              value,
            } = params as any;

            try {
              const calldata = encodeFunctionData({
                abi,
                functionName,
                args: fnArgs,
              });
              const calls = [
                {
                  to: address as `0x${string}`,
                  data: calldata,
                  value: value ? BigInt(value) : BigInt(0),
                },
              ];

              const txHashFromSession = await executeViaSessionKey(
                sessionClient,
                calls,
                _chainId
              );
              handleTransactionSuccess(txHashFromSession);
              return;
            } catch (sessionError: any) {
              console.error('[Session] UserOperation failed:', sessionError);
              throw new Error(
                `Session key transaction failed: ${formatSessionError(sessionError)}`
              );
            }
          }
          // If sessionClient is null after lazy creation attempt, fall through to non-session path
        }

        // Validate and switch chain if needed (only for non-session paths)
        await validateAndSwitchChain(_chainId);

        // For external wallets on Ethereal chain with value, wrap USDe first
        if (isEtherealChain(_chainId)) {
          const params = args[0];
          const { value } = params as any;

          if (value && BigInt(value) > 0n) {
            // Wrap USDe first, then execute main transaction in atomic batch
            const wrapTx = createWrapTransaction(BigInt(value));

            const mainCalldata = encodeFunctionData({
              abi: (params as any).abi,
              functionName: (params as any).functionName,
              args: (params as any).args,
            });

            const calls = [
              wrapTx,
              {
                to: (params as any).address as `0x${string}`,
                data: mainCalldata,
                value: 0n, // No value for main tx since we wrapped
              },
            ];

            const result = await sendCallsAsync({
              chainId: _chainId,
              calls,
              experimental_fallback: true,
            });

            // Type assertion needed because sendCallsAsync can return different shapes
            // depending on EIP-5792 support vs fallback mode
            const resultWithHash = result as
              | {
                  receipts?: Array<{ transactionHash?: string }>;
                  transactionHash?: string;
                  txHash?: string;
                }
              | undefined;
            const transactionHash = pickFinalTransactionHash(resultWithHash);
            handleTransactionSuccess(transactionHash as Hash | undefined);
          } else {
            // No wrapping needed
            const hash = await writeContractAsync(...args);
            handleTransactionSuccess(hash);
          }
        } else {
          // Execute the transaction normally for non-Ethereal chains
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
      createWrapTransaction,
      sendCallsAsync,
      pickFinalTransactionHash,
      canUseSessionForChain,
      getSessionClient,
      needsArbitrumSession,
      createArbitrumSessionIfNeeded,
      executeViaSessionKey,
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

        // SESSION KEY PATH: If session is active and supports this chain, use gasless execution
        if (canUseSessionForChain(_chainId)) {
          // Get session client, creating Arbitrum session lazily if needed
          let sessionClient = getSessionClient(_chainId);

          if (needsArbitrumSession(_chainId)) {
            setIsSubmitting(true);
            try {
              // Use returned client directly to avoid race condition with state updates
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
            const body = (args[0] as any) ?? {};
            const calls = Array.isArray(body?.calls) ? body.calls : [];

            if (calls.length === 0) {
              throw new Error('No calls to execute');
            }

            try {
              const formattedCalls = calls.map((call: any) => ({
                to: call.to as `0x${string}`,
                data: call.data as `0x${string}`,
                value: call.value ? BigInt(call.value) : BigInt(0),
              }));

              const txHashFromSession = await executeViaSessionKey(
                sessionClient,
                formattedCalls,
                _chainId
              );

              // Complete transaction - redirect and show success
              // Note: Don't call onTxHash here - onTxSent was already called in executeViaSessionKey
              maybeRedirect();
              showSuccessToast();
              setTxHash(txHashFromSession);
              setIsSubmitting(false);
              return;
            } catch (sessionError: any) {
              console.error('[Session] UserOperation failed:', sessionError);
              throw new Error(
                `Session key transaction failed: ${formatSessionError(sessionError)}`
              );
            }
          }
          // If sessionClient is null after lazy creation attempt, fall through to non-session path
        }

        // Validate and switch chain if needed (only for non-session paths)
        await validateAndSwitchChain(_chainId);
        // Execute the batch calls using wallet_sendCalls with fallback
        const data = await sendCallsAsync({
          ...(args[0] as any),
          experimental_fallback: true,
        });
        // Handle response - try to get tx hash from EIP-5792 or fallback
        try {
          let transactionHash: string | undefined;

          if (data?.id) {
            // EIP-5792 supported - poll for status
            const result = await waitForCallsStatus(client!, { id: data.id });
            transactionHash = pickFinalTransactionHash(result);
          } else {
            // Fallback path without aggregator id
            transactionHash = pickFinalTransactionHash(data);
          }

          if (transactionHash) {
            completeSendCallsWithHash(transactionHash as Hash);
          } else {
            completeSendCallsWithoutHash();
          }
        } catch (e) {
          console.error(e);
          // waitForCallsStatus unsupported or failed; assume success since sendCalls resolved
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
      pickFinalTransactionHash,
      canUseSessionForChain,
      getSessionClient,
      needsArbitrumSession,
      createArbitrumSessionIfNeeded,
      executeViaSessionKey,
      completeSendCallsWithHash,
      completeSendCallsWithoutHash,
      showSuccessToast,
      maybeRedirect,
      successMessage,
      disableSuccessToast,
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
