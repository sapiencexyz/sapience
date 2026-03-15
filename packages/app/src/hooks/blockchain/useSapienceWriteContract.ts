'use client';
import { useCallback, useMemo, useRef, useState, useContext } from 'react';
import type { useTransactionReceipt } from 'wagmi';
import {
  useWriteContract,
  useSendCalls,
  useConnectorClient,
  useAccount,
} from 'wagmi';
import type { EIP1193Provider, Hash, Hex } from 'viem';
import { useRouter } from 'next/navigation';

import { useToast } from '@sapience/ui/hooks/use-toast';

import { arbitrum } from 'viem/chains';
import { useSwitchChain } from 'wagmi';

import {
  getExecutionPath,
  encodeWriteContractToCall,
  resolveEoaBatchResult,
  executeTransaction,
  executeViaSessionKeyDefault,
  type TransactionCall,
  type WriteContractParams,
  type SessionClient,
} from './transactionExecutor';
import {
  handleViemError,
  isSessionPolicyError,
} from '~/utils/blockchain/handleViemError';
import { useChainValidation } from '~/hooks/blockchain/useChainValidation';
import { useMonitorTxStatus } from '~/hooks/blockchain/useMonitorTxStatus';
import { CreatePositionContext } from '~/lib/context/CreatePositionContext';
import { useSession } from '~/lib/context/SessionContext';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  ethereal,
  executeSudoTransaction,
  type OwnerSigner,
} from '~/lib/session/sessionKeyManager';

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
  /**
   * Force owner signing path even when a session key is active.
   * Use this for calls to contracts not in the session key's CallPolicy
   * (e.g. dynamic position token approvals).
   */
  forceOwnerPath?: boolean;
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
  forceOwnerPath = false,
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
    endSession,
  } = useSession();

  // Check if session can handle a specific chain
  // Returns true ONLY if user is in smart-account mode AND session is active
  // For Arbitrum, returns true even if session doesn't exist yet (will be created lazily)
  const canUseSessionForChain = useCallback(
    (chainId: number): boolean => {
      // CRITICAL: Only use session if user is in smart-account mode AND session is active
      if (!isUsingSession) return false;
      if (!sessionConfig) return false;
      if (Date.now() > sessionConfig.expiresAt) return false;
      if (
        (chainId === ethereal.id || chainId === DEFAULT_CHAIN_ID) &&
        chainClients.ethereal
      )
        return true;
      // For Arbitrum, we can use session even if it doesn't exist yet (lazy creation)
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
      if (chainId === ethereal.id || chainId === DEFAULT_CHAIN_ID)
        return chainClients.ethereal;
      if (chainId === arbitrum.id) return chainClients.arbitrum;
      return null;
    },
    [chainClients]
  );

  // Determine execution path for a given chain
  const getExecutionPathForChain = useCallback(
    (chainId: number) => {
      if (forceOwnerPath && isUsingSmartAccount) return 'owner' as const;
      return getExecutionPath(
        isUsingSmartAccount,
        canUseSessionForChain(chainId)
      );
    },
    [isUsingSmartAccount, canUseSessionForChain, forceOwnerPath]
  );

  // Create chain switcher for owner signer
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
  const [txHash, setTxHash] = useState<Hash | undefined>(undefined);
  const { toast } = useToast();
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const router = useRouter();
  const didRedirectRef = useRef(false);
  const didShowSuccessToastRef = useRef(false);
  // Capture the address that submitted the transaction to avoid race conditions
  // if user toggles account mode while transaction is in-flight
  const transactionAddressRef = useRef<`0x${string}` | null>(null);
  // Get position form context - may be undefined if not within provider
  const createPositionContext = useContext(CreatePositionContext);

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
        // Use the address captured at transaction submission time to avoid race conditions
        // if user toggles account mode while transaction is in-flight
        const connectedAddress =
          transactionAddressRef.current ??
          (isUsingSmartAccount && smartAccountAddress
            ? smartAccountAddress
            : wagmiAddress);
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
    isUsingSmartAccount,
    smartAccountAddress,
  ]);

  // Unified completion handler for all transaction paths
  const completeTransaction = useCallback(
    (hash?: Hash) => {
      if (hash) {
        onTxHash?.(hash);
        setTxHash(hash);
      } else {
        onSuccess?.(undefined);
      }

      if (!disableAutoRedirect) {
        maybeRedirect();
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

      setIsSubmitting(false);
    },
    [
      onTxHash,
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

  // Helper to execute transaction via session key (shared by writeContract and sendCalls)
  const executeViaSessionKey = useCallback(
    async (
      sessionClient: SessionClient,
      calls: TransactionCall[],
      _chainId: number
    ): Promise<Hash> => {
      const startTime = Date.now();
      const hash = await executeViaSessionKeyDefault(
        sessionClient,
        calls,
        _chainId,
        {
          sessionConfig,
          onTxSending,
          onTxSent,
          onReceiptConfirmed,
        }
      );
      console.log(
        `[SessionTx] Total: ${Date.now() - startTime}ms (skipping on-chain wait)`
      );
      return hash;
    },
    [sessionConfig, onTxSending, onTxSent, onReceiptConfirmed]
  );

  // Wrapper for Arbitrum session creation that provides user-friendly error messages
  const wrapArbitrumSessionCreation = useCallback(async () => {
    try {
      return await createArbitrumSessionIfNeeded();
    } catch (e) {
      console.error('[Session] Failed to create Arbitrum session:', e);
      throw new Error('Please approve the Arbitrum session to continue');
    }
  }, [createArbitrumSessionIfNeeded]);

  /** Handle catch errors from writeContract / sendCalls — detects stale session keys */
  const handleCatchError = useCallback(
    (error: unknown, label: string) => {
      setIsSubmitting(false);
      if (isSessionPolicyError(error)) {
        console.warn(
          `[${label}] Session key policy mismatch — clearing stale session`,
          error
        );
        endSession();
        toast({
          title: 'Session Expired',
          description: 'Please start a new session.',
          duration: 8000,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Transaction Failed',
          description: handleViemError(error, fallbackErrorMessage),
          duration: 5000,
          variant: 'destructive',
        });
      }
      onError?.(error as Error);
    },
    [endSession, toast, fallbackErrorMessage, onError]
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

        // Determine execution path based on account mode and session state
        const executionPath = getExecutionPathForChain(_chainId);

        // Capture the address at transaction submission time to avoid race conditions
        // if user toggles account mode while transaction is in-flight
        transactionAddressRef.current =
          executionPath === 'eoa'
            ? (wagmiAddress ?? null)
            : (smartAccountAddress ?? wagmiAddress ?? null);

        if (executionPath !== 'eoa') setIsSubmitting(true);

        const params = args[0] as WriteContractParams;
        const calls = [encodeWriteContractToCall(params)];

        const result = await executeTransaction(
          calls,
          _chainId,
          executionPath,
          {
            sessionClient: getSessionClient(_chainId),
            sessionConfig,
            needsArbitrumSession: needsArbitrumSession(_chainId),
            createArbitrumSessionIfNeeded: wrapArbitrumSessionCreation,
            executeViaSessionKey,
            executeViaOwnerSigning,
            writeContractAsync,
            sendCallsAsync,
            validateAndSwitchChain,
          },
          'writeContract',
          args[0]
        );

        completeTransaction(result.hash);
      } catch (error) {
        handleCatchError(error, 'WriteContract');
      }
    },
    [
      resetWrite,
      validateAndSwitchChain,
      writeContractAsync,
      sendCallsAsync,
      toast,
      fallbackErrorMessage,
      onError,
      endSession,
      completeTransaction,
      getExecutionPathForChain,
      getSessionClient,
      needsArbitrumSession,
      wrapArbitrumSessionCreation,
      executeViaSessionKey,
      executeViaOwnerSigning,
      wagmiAddress,
      smartAccountAddress,
      sessionConfig,
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

        // Determine execution path based on account mode and session state
        const executionPath = getExecutionPathForChain(_chainId);

        // Capture the address at transaction submission time to avoid race conditions
        // if user toggles account mode while transaction is in-flight
        transactionAddressRef.current =
          executionPath === 'eoa'
            ? (wagmiAddress ?? null)
            : (smartAccountAddress ?? wagmiAddress ?? null);

        if (executionPath !== 'eoa') setIsSubmitting(true);

        // Convert SendCall[] to TransactionCall[]
        const body = (args[0] ?? {}) as SendCallsParams;
        const rawCalls: SendCall[] = Array.isArray(body?.calls)
          ? body.calls
          : [];
        if (rawCalls.length === 0) {
          throw new Error('No calls to execute');
        }
        const calls: TransactionCall[] = rawCalls.map((call: SendCall) => ({
          to: call.to,
          data: call.data ?? ('0x' as Hex),
          value: call.value ? BigInt(call.value) : 0n,
        }));

        const result = await executeTransaction(
          calls,
          _chainId,
          executionPath,
          {
            sessionClient: getSessionClient(_chainId),
            sessionConfig,
            needsArbitrumSession: needsArbitrumSession(_chainId),
            createArbitrumSessionIfNeeded: wrapArbitrumSessionCreation,
            executeViaSessionKey,
            executeViaOwnerSigning,
            sendCallsAsync,
            validateAndSwitchChain,
          },
          'sendCalls',
          args[0]
        );

        // Resolve hash for EOA batch results (EIP-5792 polling)
        let finalHash = result.hash;
        if (result.path === 'eoa' && result.data && !finalHash) {
          finalHash = (await resolveEoaBatchResult(result.data, client)) as
            | Hash
            | undefined;
        }
        completeTransaction(finalHash);
      } catch (error) {
        handleCatchError(error, 'SendCalls');
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
      endSession,
      getExecutionPathForChain,
      getSessionClient,
      needsArbitrumSession,
      wrapArbitrumSessionCreation,
      executeViaSessionKey,
      executeViaOwnerSigning,
      completeTransaction,
      wagmiAddress,
      smartAccountAddress,
      sessionConfig,
    ]
  );

  const handleTxSuccess = useCallback(
    (receipt: ReturnType<typeof useTransactionReceipt>['data']) => {
      if (!txHash) return;
      onSuccess?.(receipt);
      setTxHash(undefined);
      setIsSubmitting(false);
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
