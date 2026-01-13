'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useContext,
} from 'react';
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
import { getPublicClientForChainId } from '~/lib/utils/util';
import { CreatePositionContext } from '~/lib/context/CreatePositionContext';
import { useSession } from '~/lib/context/SessionContext';
import { ethereal } from '~/lib/session/sessionKeyManager';
import { arbitrum } from 'viem/chains';

// Ethereal chain configuration
const CHAIN_ID_ETHEREAL = 5064014;
const WUSDE_ADDRESS = '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';
const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function balanceOf(address account) view returns (uint256)',
]);

interface ShareIntentOg {
  imagePath: string;
  params?: Record<string, string | number | boolean | null | undefined>;
}

interface ShareIntentPartial {
  positionId?: string | number;
  og?: ShareIntentOg;
  betslip?: {
    legs: Array<{ question: string; choice: 'Yes' | 'No' }>;
    wager: string;
    payout?: string;
    symbol: string;
    lastNftId?: string; // Last NFT ID before this parlay was submitted
  };
  // Additional optional hints can be added over time
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
   * When set to 'markets', redirects to '/markets' and clears the betslip.
   */
  redirectPage?: 'profile' | 'markets';
  /**
   * Optional share intent hints. When provided, a durable record will be written
   * to sessionStorage as soon as a tx hash is known (or immediately if not available),
   * before redirecting to the profile page. This enables the profile page to
   * automatically open a share dialog with the correct OG image.
   */
  shareIntent?: ShareIntentPartial;
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
  redirectProfileAnchor,
  redirectPage = 'profile',
  shareIntent,
  disableSuccessToast = false,
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
  // Store share intent in state so it can be updated dynamically
  const [currentShareIntent, setCurrentShareIntent] = useState<
    ShareIntentPartial | undefined
  >(shareIntent);
  // Use a ref to store the latest intent for synchronous access in writeShareIntent
  // This ensures we always have the freshest data even if state hasn't updated yet
  const currentShareIntentRef = useRef<ShareIntentPartial | undefined>(
    shareIntent
  );

  // Sync shareIntent prop to state when it changes (but allow dynamic updates via updateShareIntent)
  // Use a ref to track the previous value to avoid infinite loops
  const prevShareIntentRef = useRef<ShareIntentPartial | undefined>(
    shareIntent
  );
  useEffect(() => {
    // Only update if shareIntent actually changed (deep comparison)
    const prevStr = JSON.stringify(prevShareIntentRef.current);
    const newStr = JSON.stringify(shareIntent);
    if (prevStr !== newStr && shareIntent !== undefined) {
      prevShareIntentRef.current = shareIntent;
      setCurrentShareIntent(shareIntent);
      currentShareIntentRef.current = shareIntent;
    }
  }, [shareIntent]);
  const { address: wagmiAddress } = useAccount();
  const router = useRouter();
  const didRedirectRef = useRef(false);
  const didShowSuccessToastRef = useRef(false);
  // Get betslip context - may be undefined if not within provider
  const createPositionContext = useContext(CreatePositionContext);

  // Helper to check if we're on Ethereal chain
  const isEtherealChain = (chainId: number): boolean =>
    chainId === CHAIN_ID_ETHEREAL;

  // Helper to create WUSDe wrap transaction for Ethereal chain
  const createWrapTransaction = useCallback((amount: bigint) => {
    return {
      to: WUSDE_ADDRESS as `0x${string}`,
      data: encodeFunctionData({
        abi: WUSDE_ABI,
        functionName: 'deposit',
      }),
      value: amount,
    };
  }, []);

  // Helper to create WUSDe unwrap transaction for Ethereal chain
  const createUnwrapTransaction = useCallback((amount: bigint) => {
    return {
      to: WUSDE_ADDRESS as `0x${string}`,
      data: encodeFunctionData({
        abi: WUSDE_ABI,
        functionName: 'withdraw',
        args: [amount],
      }),
      value: 0n,
    };
  }, []);

  // Helper to get user's WUSDe balance
  const getUserWUSDEBalance = useCallback(async () => {
    if (!wagmiAddress || !chainId || !isEtherealChain(chainId)) {
      return 0n;
    }

    try {
      const publicClient = getPublicClientForChainId(chainId);
      const balance = await publicClient.readContract({
        address: WUSDE_ADDRESS as `0x${string}`,
        abi: WUSDE_ABI,
        functionName: 'balanceOf',
        args: [wagmiAddress],
      });
      return balance as bigint;
    } catch (error) {
      console.error('Failed to get WUSDe balance:', error);
      return 0n;
    }
  }, [wagmiAddress, chainId, isEtherealChain]);

  // Update share intent dynamically (e.g., to get fresh lastNftId before submission)
  const updateShareIntent = useCallback((newIntent: ShareIntentPartial) => {
    setCurrentShareIntent((prev) => {
      const updated = {
        ...prev,
        ...newIntent,
        // Merge betslip data if both exist
        betslip: newIntent.betslip
          ? { ...prev?.betslip, ...newIntent.betslip }
          : prev?.betslip,
      };
      // Update ref synchronously so writeShareIntent can read fresh data immediately
      currentShareIntentRef.current = updated;
      return updated;
    });
  }, []);

  // Write durable share intent to sessionStorage
  const writeShareIntent = useCallback(
    (maybeHash?: string) => {
      try {
        if (typeof window === 'undefined') return;
        // Write intent if redirecting to profile (with anchor) or to markets
        const shouldWriteForProfile =
          redirectPage === 'profile' && redirectProfileAnchor;
        const shouldWriteForMarkets = redirectPage === 'markets';
        if (!shouldWriteForProfile && !shouldWriteForMarkets) return;
        // Use ref for synchronous access to latest intent (avoids stale state from async updates)
        // Fall back to state if ref is not set
        console.log(
          'currentShareIntentRef.current, currentShareIntent, writing:',
          currentShareIntentRef.current,
          currentShareIntent,
          currentShareIntentRef.current ? 'first' : 'second'
        );
        const latestIntent =
          currentShareIntentRef.current ?? currentShareIntent;
        if (latestIntent === undefined) return; // only write when caller explicitly opts-in

        const connectedAddress = (wagmiAddress || '').toString().toLowerCase();
        if (!connectedAddress) return;

        // Determine anchor: use redirectProfileAnchor for profile, 'positions' for markets
        const anchor =
          redirectPage === 'markets' ? 'positions' : redirectProfileAnchor;

        const intent = {
          address: connectedAddress,
          anchor: anchor,
          clientTimestamp: Date.now(),
          txHash: maybeHash || undefined,
          // Spread all latestIntent properties to allow custom data (uses ref for fresh data)
          ...latestIntent,
        } as Record<string, any>;

        window.sessionStorage.setItem(
          'sapience:share-intent',
          JSON.stringify(intent)
        );
        console.log(
          '[useSapienceWriteContract] Share intent written to sessionStorage',
          {
            address: connectedAddress,
            anchor,
            clientTimestamp: intent.clientTimestamp,
            txHash: intent.txHash,
            lastNftId: intent.lastNftId,
            betslipLastNftId: intent.betslip?.lastNftId,
            hasBetslip: !!intent.betslip,
            betslipLegsCount: intent.betslip?.legs?.length || 0,
            hasOg: !!intent.og,
          }
        );
      } catch (e) {
        // best-effort only
        console.error(e);
      }
    },
    [redirectPage, redirectProfileAnchor, currentShareIntent, wagmiAddress]
  );

  // Helper to detect if this is a withdrawal operation that should trigger unwrapping
  const shouldAutoUnwrap = useCallback(
    (functionName: string) => {
      if (!chainId || !isEtherealChain(chainId)) {
        return false;
      }

      // Common withdrawal/redeem function names that should trigger unwrapping
      const withdrawalFunctions = [
        'withdraw',
        'redeem',
        'redeemCollateral',
        'exitPosition',
        'closeTrade',
        'removeLP',
        'removeLiquidity',
        'unstake',
        'claimRewards',
        // Additional patterns found in codebase
        'settlePosition', // Settling/closing positions
        'decreaseLiquidity', // Reducing LP positions
        'cancelWithdrawal', // Canceling withdrawals (funds return to user)
        'cancelDeposit', // Canceling deposits (funds return to user)
        'burn', // Burning prediction NFTs for payout
        'processWithdrawals', // Processing withdrawal queue
      ];

      // Special case: modifyTraderPosition with size 0 is a full close
      // (we can't detect this here without args, but it's worth noting)

      return withdrawalFunctions.some((fn) =>
        functionName.toLowerCase().includes(fn.toLowerCase())
      );
    },
    [chainId, isEtherealChain]
  );

  // Helper to execute auto-unwrap after main transaction
  const executeAutoUnwrap = useCallback(
    async (balanceBefore: bigint) => {
      // Get the current balance after transaction
      const balanceAfter = await getUserWUSDEBalance();

      // Calculate how much WUSDe was received
      const received =
        balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0n;

      if (received <= 0n) {
        return null; // No new WUSDe to unwrap
      }

      // Only unwrap the amount received from this transaction
      const unwrapTx = createUnwrapTransaction(received);
      return unwrapTx;
    },
    [getUserWUSDEBalance, createUnwrapTransaction]
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
        // Note: betslip clearing is now done AFTER shareIntent is written
        // This ensures betslip data is available for image generation
        router.push(`/${redirectPage}`);
        // Clear betslip after redirect (shareIntent already written)
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
        writeShareIntent(hash);
        onTxHash?.(hash);
        setTxHash(hash);
      } else {
        writeShareIntent(undefined);
        onSuccess?.(undefined as any);
      }

      maybeRedirect();

      if (!disableSuccessToast) {
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
      }

      setIsSubmitting(false);
    },
    [
      writeShareIntent,
      onTxHash,
      setTxHash,
      onSuccess,
      maybeRedirect,
      toast,
      successMessage,
      disableSuccessToast,
    ]
  );

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

  // Execute unwrap for non-embedded wallets
  const executeNonEmbeddedUnwrap = useCallback(
    (chainId: number, balanceBefore: bigint) => {
      setTimeout(async () => {
        try {
          const unwrapTx = await executeAutoUnwrap(balanceBefore);
          if (unwrapTx) {
            await sendCallsAsync({
              chainId,
              calls: [unwrapTx],
              experimental_fallback: true,
            });
          }
        } catch (error) {
          console.error('Auto-unwrap failed:', error);
        }
      }, 2000);
    },
    [executeAutoUnwrap, sendCallsAsync]
  );

  const pickFinalTransactionHash = useCallback((data: any) => {
    const receipts = data?.receipts;
    if (Array.isArray(receipts) && receipts.length > 0) {
      for (let i = receipts.length - 1; i >= 0; i--) {
        const h = receipts?.[i]?.transactionHash;
        if (typeof h === 'string' && h.length > 0) return h;
      }
    }
    const txHash =
      (typeof data?.transactionHash === 'string' && data.transactionHash) ||
      (typeof data?.txHash === 'string' && data.txHash) ||
      undefined;
    return txHash;
  }, []);

  // Helper to execute transaction via session key (shared by writeContract and sendCalls)
  const executeViaSessionKey = useCallback(
    async (
      sessionClient: NonNullable<typeof chainClients.ethereal>,
      calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }>,
      _chainId: number
    ): Promise<Hash> => {
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

      const encodedCalls = await sessionClient.account.encodeCalls(calls);

      const userOpHash = await sessionClient.sendUserOperation({
        callData: encodedCalls,
      });

      const receipt = await sessionClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });

      return receipt.receipt.transactionHash;
    },
    [sessionConfig]
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
            console.debug(
              '[Session] Creating Arbitrum session lazily before transaction...'
            );
            setIsSubmitting(true);
            try {
              // Use returned client directly to avoid race condition with state updates
              sessionClient = await createArbitrumSessionIfNeeded();
              console.debug('[Session] Arbitrum session created successfully');
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

            console.debug('[Session] Target contract:', address);
            console.debug('[Session] Function:', functionName);

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
              console.error('[Session] Error details:', {
                message: sessionError?.message,
                cause: sessionError?.cause,
                details: sessionError?.details,
                shortMessage: sessionError?.shortMessage,
              });
              const errorMessage =
                sessionError?.shortMessage ||
                sessionError?.message ||
                'Session transaction failed';
              throw new Error(
                `Session key transaction failed: ${errorMessage}`
              );
            }
          }
          // If sessionClient is null after lazy creation attempt, fall through to non-session path
        }

        // Validate and switch chain if needed (only for non-session paths)
        await validateAndSwitchChain(_chainId);

        // For external wallets, use sendCalls if on Ethereal and wrapping is needed
        if (isEtherealChain(_chainId)) {
          const params = args[0];
          const { value } = params as any;

          if (value && BigInt(value) > 0n) {
            // Check if we need unwrapping for this operation
            const needsUnwrap = shouldAutoUnwrap((params as any).functionName);

            // Get balance before transaction if unwrapping might be needed
            let balanceBeforeTransaction = 0n;
            if (needsUnwrap) {
              balanceBeforeTransaction = await getUserWUSDEBalance();
            }

            // Check existing WUSDe balance and only wrap the difference
            const requiredAmount = BigInt(value);
            const currentBalance = needsUnwrap
              ? balanceBeforeTransaction
              : await getUserWUSDEBalance();
            const amountToWrap =
              requiredAmount > currentBalance
                ? requiredAmount - currentBalance
                : 0n;

            if (amountToWrap > 0n) {
              // Need to wrap USDe first, then execute main transaction
              const wrapTx = createWrapTransaction(amountToWrap);

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

              // Execute auto-unwrap if this is a withdrawal operation
              if (needsUnwrap) {
                executeNonEmbeddedUnwrap(_chainId, balanceBeforeTransaction);
              }
            } else {
              // No wrapping needed, user has sufficient WUSDe balance
              const hash = await writeContractAsync(...args);
              handleTransactionSuccess(hash);

              // Execute auto-unwrap if this is a withdrawal operation
              if (needsUnwrap) {
                executeNonEmbeddedUnwrap(_chainId, balanceBeforeTransaction);
              }
            }
          } else {
            // No wrapping needed, check if unwrapping is needed
            const needsUnwrap = shouldAutoUnwrap((args[0] as any).functionName);

            // Get balance before transaction if unwrapping might be needed
            let balanceBeforeTransaction = 0n;
            if (needsUnwrap) {
              balanceBeforeTransaction = await getUserWUSDEBalance();
            }

            // Execute main transaction
            const hash = await writeContractAsync(...args);
            handleTransactionSuccess(hash);

            // Execute auto-unwrap if this is a withdrawal operation
            if (needsUnwrap) {
              executeNonEmbeddedUnwrap(_chainId, balanceBeforeTransaction);
            }
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
      shouldAutoUnwrap,
      executeNonEmbeddedUnwrap,
      handleTransactionSuccess,
      createWrapTransaction,
      getUserWUSDEBalance,
      isEtherealChain,
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
            console.debug(
              '[Session] Creating Arbitrum session lazily before batch transaction...'
            );
            setIsSubmitting(true);
            try {
              // Use returned client directly to avoid race condition with state updates
              sessionClient = await createArbitrumSessionIfNeeded();
              console.debug('[Session] Arbitrum session created successfully');
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

            console.debug(
              '[Session] Batch transaction with',
              calls.length,
              'calls'
            );

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

              // Write share intent and redirect
              writeShareIntent(txHashFromSession);
              maybeRedirect();

              if (!disableSuccessToast) {
                toast({
                  title: successTitle,
                  description: formatSuccessDescription(successMessage),
                  duration: 5000,
                });
                didShowSuccessToastRef.current = true;
              }

              onTxHash?.(txHashFromSession);
              setTxHash(txHashFromSession);
              setIsSubmitting(false);
              return;
            } catch (sessionError: any) {
              console.error('[Session] UserOperation failed:', sessionError);
              console.error('[Session] Error details:', {
                message: sessionError?.message,
                cause: sessionError?.cause,
                details: sessionError?.details,
                shortMessage: sessionError?.shortMessage,
              });
              const errorMessage =
                sessionError?.shortMessage ||
                sessionError?.message ||
                'Session transaction failed';
              throw new Error(
                `Session key transaction failed: ${errorMessage}`
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
        // If the wallet supports EIP-5792, we can poll for calls status using the returned id.
        // If it does not (fallback path), `waitForCallsStatus` may throw or `id` may be unusable.
        try {
          if (data?.id) {
            const result = await waitForCallsStatus(client!, { id: data.id });
            const transactionHash = pickFinalTransactionHash(result);
            if (transactionHash) {
              // Persist share intent before redirect
              writeShareIntent(transactionHash);
              // Redirect as soon as a tx hash is known
              maybeRedirect();
              // Show success toast after navigation so it appears on profile
              if (!disableSuccessToast) {
                try {
                  toast({
                    title: successTitle,
                    description: formatSuccessDescription(successMessage),
                    duration: 5000,
                  });
                  didShowSuccessToastRef.current = true;
                } catch (_e) {
                  // Error showing success toast
                }
              }
              onTxHash?.(transactionHash);
              setTxHash(transactionHash);
              setIsSubmitting(false);
            } else {
              // No tx hash available from aggregator; consider operation successful.
              // Redirect before showing success toast
              writeShareIntent(undefined);
              maybeRedirect();
              if (!disableSuccessToast) {
                toast({
                  title: successTitle,
                  description: formatSuccessDescription(successMessage),
                  duration: 5000,
                });
                didShowSuccessToastRef.current = true;
              }
              onSuccess?.(undefined as any);
            }
          } else {
            // Fallback path without aggregator id.
            const transactionHash = pickFinalTransactionHash(data);
            if (transactionHash) {
              // Persist share intent before redirect
              writeShareIntent(transactionHash);
              // Redirect as soon as a tx hash is known
              maybeRedirect();
              // Show success toast after navigation so it appears on profile
              if (!disableSuccessToast) {
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
              }
              onTxHash?.(transactionHash);
              setTxHash(transactionHash);
              setIsSubmitting(false);
              return;
            }
            // Fallback path without aggregator id.
            // Redirect before showing success toast
            writeShareIntent(undefined);
            maybeRedirect();
            if (!disableSuccessToast) {
              toast({
                title: successTitle,
                description: formatSuccessDescription(successMessage),
                duration: 5000,
              });
              didShowSuccessToastRef.current = true;
            }
            onSuccess?.(undefined as any);
            setIsSubmitting(false);
          }
        } catch (e) {
          console.error(e);
          // `wallet_getCallsStatus` unsupported or failed; assume success since `sendCalls` resolved.
          // Redirect before showing success toast
          writeShareIntent(undefined);
          maybeRedirect();
          if (!disableSuccessToast) {
            toast({
              title: successTitle,
              description: formatSuccessDescription(successMessage),
              duration: 5000,
            });
            didShowSuccessToastRef.current = true;
          }
          onSuccess?.(undefined as any);
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
      toast,
      fallbackErrorMessage,
      onError,
      onTxHash,
      maybeRedirect,
      writeShareIntent,
      onSuccess,
      successMessage,
      pickFinalTransactionHash,
      disableSuccessToast,
      canUseSessionForChain,
      getSessionClient,
      needsArbitrumSession,
      createArbitrumSessionIfNeeded,
      executeViaSessionKey,
    ]
  );

  const handleTxSuccess = useCallback(
    (receipt: ReturnType<typeof useTransactionReceipt>['data']) => {
      if (!txHash) return;
      // Avoid duplicate success toast if already shown after redirect
      if (!disableSuccessToast && !didShowSuccessToastRef.current) {
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
    [txHash, toast, successMessage, onSuccess, disableSuccessToast]
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
      updateShareIntent,
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
      updateShareIntent,
    ]
  );
}
