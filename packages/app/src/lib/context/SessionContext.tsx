'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi';
import type { Address, EIP1193Provider, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { KernelAccountClient } from '@zerodev/sdk';
import { DEFAULT_CHAIN_ID, CHAIN_ID_ARBITRUM } from '@sapience/sdk/constants';
import {
  predictionMarketEscrow,
  secondaryMarketEscrow,
} from '@sapience/sdk/contracts/addresses';
import {
  createSession,
  createArbitrumSession,
  restoreSession,
  getSmartAccountAddress,
  saveSession,
  loadSession,
  clearSession,
  type SessionConfig,
  type OwnerSigner,
  type EnableTypedData,
  type SerializedSession,
  type EscrowSessionKeyApproval,
  type SessionCreationStep,
} from '~/lib/session/sessionKeyManager';

/**
 * Strip private key and ABIs from approval for safe transport.
 * ABIs are embedded in permission policies but not needed for relayer signature verification.
 */
function extractApprovalForTransport(
  serializedApproval: string
): string | null {
  try {
    const jsonString = atob(serializedApproval);
    const params = JSON.parse(jsonString);

    const strippedPermissionParams = stripAbisFromPolicies(
      params.permissionParams
    );

    const safeParams = {
      enableSignature: params.enableSignature,
      accountParams: params.accountParams,
      permissionParams: strippedPermissionParams,
      action: params.action,
      kernelVersion: params.kernelVersion,
      validatorData: params.validatorData,
      hookData: params.hookData,
    };

    return btoa(JSON.stringify(safeParams));
  } catch {
    return null;
  }
}

interface PolicyPermission {
  abi?: unknown;
  [key: string]: unknown;
}

interface PolicyParams {
  permissions?: PolicyPermission[];
  [key: string]: unknown;
}

interface Policy {
  policyParams?: PolicyParams;
  [key: string]: unknown;
}

interface PermissionParams {
  policies?: Policy[];
  [key: string]: unknown;
}

function stripAbisFromPolicies(
  permissionParams: PermissionParams
): PermissionParams {
  if (!permissionParams?.policies) {
    return permissionParams;
  }

  return {
    ...permissionParams,
    policies: permissionParams.policies.map((policy) => {
      if (!policy.policyParams?.permissions) {
        return policy;
      }
      return {
        ...policy,
        policyParams: {
          ...policy.policyParams,
          permissions: policy.policyParams.permissions.map((perm) => {
            const { abi: _abi, ...permWithoutAbi } = perm;
            return permWithoutAbi;
          }),
        },
      };
    }),
  };
}

// Chain clients type
interface ChainClients {
  ethereal: KernelAccountClient | null;
  arbitrum: KernelAccountClient | null;
}

// Type for signTypedData parameters
interface SignTypedDataParams {
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: Address;
  };
  types: Record<
    string,
    readonly { readonly name: string; readonly type: string }[]
  >;
  primaryType: string;
  message: Record<string, unknown>;
}

// Session approval data for relayer authentication
interface SessionApprovalData {
  // The ZeroDev approval string with private key stripped (base64)
  approval: string;
  // The EIP-712 typed data captured during session creation
  typedData: EnableTypedData;
}

/**
 * Account mode - determines which account to use for transactions.
 * - 'smart-account': Use the smart account (with session key if active, otherwise owner signing)
 * - 'eoa': Use the wallet directly
 */
export type AccountMode = 'smart-account' | 'eoa';

// Session context value
interface SessionContextValue {
  // Session state
  isSessionActive: boolean;
  sessionConfig: SessionConfig | null;
  chainClients: ChainClients;

  // Session actions
  startSession: (params: {
    durationHours: number;
    etherealChainId?: number;
  }) => Promise<void>;
  endSession: () => void;

  // Status
  isStartingSession: boolean;
  isRestoringSession: boolean;
  sessionCreationStep: SessionCreationStep | null;
  sessionError: Error | null;

  // Time remaining in milliseconds
  timeRemainingMs: number;

  // Smart account address (available before session starts)
  smartAccountAddress: Address | null;
  isCalculatingAddress: boolean;

  // Account mode - the current mode the app is operating in
  // 'smart-account' = use smart account, 'eoa' = use wallet directly
  accountMode: AccountMode;
  setAccountMode: (mode: AccountMode) => void;

  // Derived flags - these are what the rest of the app should use
  // isUsingSmartAccount = mode is smart-account AND smart account address is available
  isUsingSmartAccount: boolean;
  // isUsingSession = using smart account AND session is active (can auto-sign)
  isUsingSession: boolean;

  // Effective address - the address to use for transactions, balance display, etc.
  // In smart-account mode: smart account address
  // In eoa mode: wallet address
  effectiveAddress: Address | null;

  // Session signing functions (available when session is active)
  // Note: These are used for on-chain UserOperations via ZeroDev, not for relayer auth
  signMessage: ((message: string) => Promise<Hex>) | null;
  signTypedData: ((params: SignTypedDataParams) => Promise<Hex>) | null;

  // Session key address (for reference, but relayer auth uses owner's wallet signature)
  sessionKeyAddress: Address | null;

  // Session approval data for relayer authentication (per chain)
  // Use Ethereal for auction auth (signed on login)
  etherealSessionApproval: SessionApprovalData | null;
  // Arbitrum is created lazily on first EAS attestation
  arbitrumSessionApproval: SessionApprovalData | null;

  // Lazy Arbitrum session creation
  hasArbitrumSession: boolean;
  isCreatingArbitrumSession: boolean;
  // Returns the created/existing client directly to avoid race conditions with state updates
  createArbitrumSessionIfNeeded: () => Promise<KernelAccountClient | null>;

  // The Ethereal chain ID the session was created for (mainnet or testnet)
  etherealChainId: number | null;

  // Escrow Session Key Approval for PredictionMarketEscrow
  escrowSessionKeyApproval: EscrowSessionKeyApproval | null;

  // Trade Session Key Approval for SecondaryMarketEscrow (TRADE_PERMISSION)
  tradeSessionKeyApproval: EscrowSessionKeyApproval | null;

  // Raw session key signing (bypasses kernel wrapping) for escrow approval signatures
  signTypedDataRaw: ((params: SignTypedDataParams) => Promise<Hex>) | null;
}

/**
 * ABI fragment for revokeSessionKey(address) — shared by both escrow contracts.
 */
const revokeSessionKeyAbi = [
  {
    type: 'function',
    name: 'revokeSessionKey',
    inputs: [{ name: 'sessionKey', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const SessionContext = createContext<SessionContextValue | null>(null);

interface SessionProviderProps {
  children: ReactNode;
}

/**
 * Create a chain switcher function that handles unrecognized chain errors.
 */
function createChainSwitcher(
  switchChainAsync: (args: { chainId: number }) => Promise<unknown>
): (chainId: number) => Promise<void> {
  return async (chainId: number) => {
    try {
      await switchChainAsync({ chainId });
    } catch (error: unknown) {
      const err = error as { code?: number; message?: string };
      if (err?.code === 4902 || err?.message?.includes('Unrecognized chain')) {
        throw new Error(`Please add chain ${chainId} to your wallet first`);
      }
      throw error;
    }
  };
}

export function SessionProvider({ children }: SessionProviderProps) {
  const { address: walletAddress, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  // Session state
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(
    null
  );
  const [chainClients, setChainClients] = useState<ChainClients>({
    ethereal: null,
    arbitrum: null,
  });

  // Status state
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [sessionCreationStep, setSessionCreationStep] =
    useState<SessionCreationStep | null>(null);
  const [sessionError, setSessionError] = useState<Error | null>(null);

  // Smart account address state
  const [smartAccountAddress, setSmartAccountAddress] =
    useState<Address | null>(null);
  const [isCalculatingAddress] = useState(false);

  // Account mode state - always initialize to default, then sync from localStorage in useEffect
  // This avoids SSR hydration mismatches since server always sees the same initial value
  const [accountMode, setAccountModeInternal] =
    useState<AccountMode>('smart-account');

  // Sync account mode from localStorage after mount (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(
        'sapience:accountMode'
      ) as AccountMode | null;
      // Migrate from old preferEoa setting
      if (!stored) {
        const oldPreferEoa = window.localStorage.getItem('sapience:preferEoa');
        if (oldPreferEoa === 'true') {
          setAccountModeInternal('eoa');
          return;
        }
      }
      if (stored && stored !== accountMode) {
        setAccountModeInternal(stored);
      }
    } catch {
      // localStorage not available
    }
  }, []); // Run once on mount

  // Derived flags - these are what the rest of the app should use
  // isUsingSmartAccount = mode is smart-account AND smart account address is available
  const isUsingSmartAccount =
    accountMode === 'smart-account' && !!smartAccountAddress;
  // isUsingSession = using smart account AND session is active (can auto-sign)
  const isUsingSession = isUsingSmartAccount && isSessionActive;

  // Effective address - the address the app uses for transactions, balance display, etc.
  const effectiveAddress = useMemo((): Address | null => {
    if (!walletAddress) return null;
    if (isUsingSmartAccount) {
      return smartAccountAddress;
    }
    return walletAddress;
  }, [walletAddress, isUsingSmartAccount, smartAccountAddress]);

  // Time remaining
  const [timeRemainingMs, setTimeRemainingMs] = useState(0);

  // Session private key for signing
  const [sessionPrivateKey, setSessionPrivateKey] = useState<Hex | null>(null);

  // Session metadata for relayer verification
  const [sessionKeyAddress, setSessionKeyAddress] = useState<Address | null>(
    null
  );

  // Session approval data for relayer authentication (per chain)
  const [arbitrumSessionApproval, setArbitrumSessionApproval] =
    useState<SessionApprovalData | null>(null);
  const [etherealSessionApproval, setEtherealSessionApproval] =
    useState<SessionApprovalData | null>(null);

  // Escrow Session Key Approval for PredictionMarketEscrow
  const [escrowSessionKeyApproval, setEscrowSessionKeyApproval] =
    useState<EscrowSessionKeyApproval | null>(null);
  // Trade Session Key Approval for SecondaryMarketEscrow
  const [tradeSessionKeyApproval, setTradeSessionKeyApproval] =
    useState<EscrowSessionKeyApproval | null>(null);

  // Lazy Arbitrum session creation state
  const [isCreatingArbitrumSession, setIsCreatingArbitrumSession] =
    useState(false);
  // Store serialized session for lazy Arbitrum creation
  const [serializedSession, setSerializedSession] =
    useState<SerializedSession | null>(null);

  // Helper to extract session approval data from serialized session
  const extractSessionApprovalData = useCallback(
    (
      serialized: SerializedSession
    ): {
      arbitrum: SessionApprovalData | null;
      ethereal: SessionApprovalData | null;
    } => {
      let arbitrum: SessionApprovalData | null = null;
      let ethereal: SessionApprovalData | null = null;

      // Extract Arbitrum approval
      if (serialized.arbitrumApproval && serialized.arbitrumEnableTypedData) {
        const safeApproval = extractApprovalForTransport(
          serialized.arbitrumApproval
        );
        if (safeApproval) {
          arbitrum = {
            approval: safeApproval,
            typedData: serialized.arbitrumEnableTypedData,
          };
        }
      }

      // Extract Ethereal approval
      if (serialized.etherealApproval && serialized.etherealEnableTypedData) {
        const safeApproval = extractApprovalForTransport(
          serialized.etherealApproval
        );
        if (safeApproval) {
          ethereal = {
            approval: safeApproval,
            typedData: serialized.etherealEnableTypedData,
          };
        }
      }

      return { arbitrum, ethereal };
    },
    []
  );

  // Sign message with session key
  const signMessage = useCallback(
    async (message: string): Promise<Hex> => {
      if (!sessionPrivateKey) {
        throw new Error('No active session');
      }
      const account = privateKeyToAccount(sessionPrivateKey);
      return account.signMessage({ message });
    },
    [sessionPrivateKey]
  );

  // Sign typed data through the KernelAccountClient (ERC-1271 compatible)
  // The smart account's isValidSignature() can verify these signatures on-chain
  const signTypedData = useCallback(
    async (params: SignTypedDataParams): Promise<Hex> => {
      const client = chainClients.ethereal;
      if (!client) {
        throw new Error('No active session');
      }
      return client.signTypedData(
        params as Parameters<typeof client.signTypedData>[0]
      );
    },
    [chainClients.ethereal]
  );

  // Sign typed data directly with the raw session key (plain ECDSA, no kernel wrapping).
  // Used for escrow MintApproval signatures that go through the contract's native
  // session key validation path (Option B in SignatureValidator).
  const signTypedDataRaw = useCallback(
    async (params: SignTypedDataParams): Promise<Hex> => {
      if (!sessionPrivateKey) {
        throw new Error('No active session');
      }
      const account = privateKeyToAccount(sessionPrivateKey);
      return account.signTypedData(
        params as Parameters<typeof account.signTypedData>[0]
      );
    },
    [sessionPrivateKey]
  );

  // Calculate smart account address when wallet connects (synchronous, no RPC)
  useEffect(() => {
    if (!walletAddress) {
      setSmartAccountAddress(null);
      return;
    }

    setSmartAccountAddress(getSmartAccountAddress(walletAddress));
  }, [walletAddress]);

  // Restore session from localStorage on mount
  useEffect(() => {
    const restore = async () => {
      const stored = loadSession();
      if (!stored) return;

      // Don't restore expired sessions
      if (Date.now() > stored.config.expiresAt) {
        clearSession();
        return;
      }

      // Check if the stored session matches the current wallet
      if (
        walletAddress?.toLowerCase() !==
        stored.config.ownerAddress.toLowerCase()
      ) {
        clearSession();
        return;
      }

      setIsRestoringSession(true);
      try {
        const result = await restoreSession(stored);
        setSessionConfig(result.config);
        setChainClients({
          ethereal: result.etherealClient,
          arbitrum: result.arbitrumClient,
        });
        setSessionPrivateKey(stored.sessionPrivateKey);
        setSessionKeyAddress(stored.sessionKeyAddress);
        setSerializedSession(stored);
        // Extract session approval data for relayer authentication
        const approvalData = extractSessionApprovalData(stored);
        setArbitrumSessionApproval(approvalData.arbitrum);
        setEtherealSessionApproval(approvalData.ethereal);
        // Restore escrow session key approval if available (legacy sessions)
        // escrowSessionKeyApproval removed — contract validates via ERC-1271
        // Restore trade session key approval for secondary market
        if (stored.tradeSessionKeyApproval) {
          setTradeSessionKeyApproval(stored.tradeSessionKeyApproval);
        }
        setIsSessionActive(true);
        setTimeRemainingMs(result.config.expiresAt - Date.now());
      } catch (error) {
        console.error('Failed to restore session:', error);
        clearSession();
      } finally {
        setIsRestoringSession(false);
      }
    };

    if (walletAddress) {
      void restore();
    }
  }, [walletAddress]);

  // Update time remaining every second
  useEffect(() => {
    if (!isSessionActive || !sessionConfig) return;

    const interval = setInterval(() => {
      const remaining = sessionConfig.expiresAt - Date.now();
      if (remaining <= 0) {
        // Session expired
        endSessionInternal();
      } else {
        setTimeRemainingMs(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isSessionActive, sessionConfig]);

  // Internal end session function
  const endSessionInternal = useCallback(() => {
    console.debug(
      '[SessionContext] Ending session, clearing state and localStorage'
    );
    setIsSessionActive(false);
    setSessionConfig(null);
    setChainClients({ ethereal: null, arbitrum: null });
    setSessionPrivateKey(null);
    setSessionKeyAddress(null);
    setSerializedSession(null);
    setArbitrumSessionApproval(null);
    setEtherealSessionApproval(null);
    setEscrowSessionKeyApproval(null);
    setTradeSessionKeyApproval(null);
    setTimeRemainingMs(0);
    clearSession();
    console.debug('[SessionContext] Session cleared');
  }, []);

  // Set account mode - also persists as preference, destroys session if switching to EOA
  const setAccountMode = useCallback(
    (mode: AccountMode) => {
      // If switching to EOA and session is active, destroy the session
      if (mode === 'eoa' && isSessionActive) {
        try {
          endSessionInternal();
        } catch (error) {
          console.error(
            '[SessionContext] Failed to end session when switching to EOA:',
            error
          );
          // Continue with mode switch even if session cleanup fails
        }
      }
      setAccountModeInternal(mode);
      // Persist as preference so user returns to this mode
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('sapience:accountMode', mode);
          // Clean up old preferEoa key if it exists
          window.localStorage.removeItem('sapience:preferEoa');
        }
      } catch {
        // localStorage not available
      }
    },
    [isSessionActive, endSessionInternal]
  );

  // Start a new session
  const startSession = useCallback(
    async (params: { durationHours: number; etherealChainId?: number }) => {
      if (!walletAddress || !connector) {
        throw new Error('No wallet connected');
      }

      setIsStartingSession(true);
      setSessionCreationStep(null);
      setSessionError(null);

      const etherealChainId = params.etherealChainId ?? DEFAULT_CHAIN_ID;

      try {
        const provider = (await connector.getProvider()) as EIP1193Provider;
        const ownerSigner: OwnerSigner = {
          address: walletAddress,
          provider,
          switchChain: createChainSwitcher(switchChainAsync),
        };

        const result = await createSession(
          ownerSigner,
          params.durationHours,
          etherealChainId,
          setSessionCreationStep
        );

        // Save to localStorage
        saveSession(result.serialized);
        console.debug('[SessionContext] Session saved to localStorage');

        // Update state
        setSessionConfig(result.config);
        setChainClients({
          ethereal: result.etherealClient,
          arbitrum: result.arbitrumClient,
        });
        setSessionPrivateKey(result.serialized.sessionPrivateKey);
        setSessionKeyAddress(result.serialized.sessionKeyAddress);
        setSerializedSession(result.serialized);
        // Extract session approval data for relayer authentication
        const approvalData = extractSessionApprovalData(result.serialized);
        setArbitrumSessionApproval(approvalData.arbitrum);
        setEtherealSessionApproval(approvalData.ethereal);
        // Set escrow session key approval if available (legacy sessions)
        // escrowSessionKeyApproval removed — contract validates via ERC-1271
        // Set trade session key approval for secondary market
        if (result.serialized.tradeSessionKeyApproval) {
          setTradeSessionKeyApproval(result.serialized.tradeSessionKeyApproval);
        }
        setIsSessionActive(true);
        setTimeRemainingMs(result.config.expiresAt - Date.now());
        console.debug(
          '[SessionContext] Session active, smart account:',
          result.config.smartAccountAddress
        );
      } catch (error) {
        console.error('Failed to start session:', error);
        setSessionError(
          error instanceof Error ? error : new Error('Failed to start session')
        );
        throw error;
      } finally {
        setIsStartingSession(false);
        setSessionCreationStep(null);
      }
    },
    [walletAddress, connector, switchChainAsync]
  );

  // Attempt on-chain session key revocation on both escrow contracts for a given chain.
  // Fire-and-forget: failures are logged but never block local cleanup.
  const revokeSessionKeyOnChain = useCallback(
    (sessionKey: Address, chainId: number) => {
      const pmEscrow = predictionMarketEscrow[chainId];
      const smEscrow = secondaryMarketEscrow[chainId];

      const revoke = (contractAddress: Address, label: string) =>
        writeContractAsync({
          address: contractAddress,
          abi: revokeSessionKeyAbi,
          functionName: 'revokeSessionKey',
          args: [sessionKey],
          chainId,
        }).catch((err) => {
          console.warn(
            `[SessionContext] Failed to revoke session key on ${label}:`,
            err
          );
        });

      const calls: Promise<unknown>[] = [];
      if (pmEscrow?.address)
        calls.push(revoke(pmEscrow.address, 'PredictionMarketEscrow'));
      if (smEscrow?.address)
        calls.push(revoke(smEscrow.address, 'SecondaryMarketEscrow'));

      if (calls.length > 0) {
        void Promise.allSettled(calls);
      }
    },
    [writeContractAsync]
  );

  // End the current session — attempts on-chain revocation then clears local state.
  const endSession = useCallback(() => {
    if (isSessionActive && sessionKeyAddress) {
      // Revoke on Ethereal chain
      if (serializedSession?.etherealChainId) {
        revokeSessionKeyOnChain(
          sessionKeyAddress,
          serializedSession.etherealChainId
        );
      }
      // Revoke on Arbitrum if an Arbitrum session was created
      if (arbitrumSessionApproval) {
        revokeSessionKeyOnChain(sessionKeyAddress, CHAIN_ID_ARBITRUM);
      }
    }
    // Always clear local state regardless of revocation outcome
    endSessionInternal();
  }, [
    endSessionInternal,
    isSessionActive,
    sessionKeyAddress,
    serializedSession,
    arbitrumSessionApproval,
    revokeSessionKeyOnChain,
  ]);

  // Create Arbitrum session lazily (on first EAS attestation)
  // Returns the client directly to avoid race conditions with state updates
  const createArbitrumSessionIfNeeded =
    useCallback(async (): Promise<KernelAccountClient | null> => {
      // Already has Arbitrum session - return existing client
      if (arbitrumSessionApproval || chainClients.arbitrum) {
        console.debug('[SessionContext] Arbitrum session already exists');
        return chainClients.arbitrum;
      }

      // No active session
      if (!isSessionActive || !sessionConfig || !serializedSession) {
        throw new Error('No active session');
      }

      // No wallet connected
      if (!walletAddress || !connector) {
        throw new Error('No wallet connected');
      }

      setIsCreatingArbitrumSession(true);
      try {
        console.debug('[SessionContext] Creating Arbitrum session lazily...');

        const provider = (await connector.getProvider()) as EIP1193Provider;
        const ownerSigner: OwnerSigner = {
          address: walletAddress,
          provider,
          switchChain: createChainSwitcher(switchChainAsync),
        };

        // Create Arbitrum session using existing session key
        const arbitrumResult = await createArbitrumSession(
          ownerSigner,
          serializedSession.sessionPrivateKey,
          sessionConfig.expiresAt
        );

        // Update serialized session with Arbitrum data
        const updatedSerialized: SerializedSession = {
          ...serializedSession,
          arbitrumApproval: arbitrumResult.arbitrumApproval,
          arbitrumEnableTypedData: arbitrumResult.arbitrumEnableTypedData,
        };

        // Save to localStorage
        saveSession(updatedSerialized);
        setSerializedSession(updatedSerialized);

        // Update chain clients
        setChainClients((prev) => ({
          ...prev,
          arbitrum: arbitrumResult.arbitrumClient,
        }));

        // Extract and set Arbitrum approval data
        if (
          arbitrumResult.arbitrumApproval &&
          arbitrumResult.arbitrumEnableTypedData
        ) {
          const safeApproval = extractApprovalForTransport(
            arbitrumResult.arbitrumApproval
          );
          if (safeApproval) {
            setArbitrumSessionApproval({
              approval: safeApproval,
              typedData: arbitrumResult.arbitrumEnableTypedData,
            });
          }
        }

        console.debug('[SessionContext] Arbitrum session created successfully');
        // Return the client directly to avoid race condition with state updates
        return arbitrumResult.arbitrumClient;
      } catch (error) {
        console.error(
          '[SessionContext] Failed to create Arbitrum session:',
          error
        );
        throw error;
      } finally {
        setIsCreatingArbitrumSession(false);
      }
    }, [
      arbitrumSessionApproval,
      chainClients.arbitrum,
      isSessionActive,
      sessionConfig,
      serializedSession,
      walletAddress,
      connector,
      switchChainAsync,
    ]);

  // Clear session when wallet disconnects or changes to a different address
  useEffect(() => {
    if (!walletAddress && isSessionActive) {
      // Wallet disconnected
      endSessionInternal();
    } else if (
      walletAddress &&
      isSessionActive &&
      sessionConfig &&
      walletAddress.toLowerCase() !== sessionConfig.ownerAddress.toLowerCase()
    ) {
      // Wallet changed to a different address than session owner
      console.debug(
        '[SessionContext] Wallet changed, clearing session for previous owner'
      );
      endSessionInternal();
    }
  }, [walletAddress, isSessionActive, sessionConfig, endSessionInternal]);

  // Compute hasArbitrumSession from state
  const hasArbitrumSession = Boolean(
    arbitrumSessionApproval || chainClients.arbitrum
  );

  // Compute etherealChainId from serialized session
  const etherealChainId = serializedSession?.etherealChainId ?? null;

  const value = useMemo(
    () => ({
      isSessionActive,
      sessionConfig,
      chainClients,
      startSession,
      endSession,
      isStartingSession,
      isRestoringSession,
      sessionCreationStep,
      sessionError,
      timeRemainingMs,
      smartAccountAddress,
      isCalculatingAddress,
      accountMode,
      setAccountMode,
      isUsingSmartAccount,
      isUsingSession,
      effectiveAddress,
      signMessage: sessionPrivateKey ? signMessage : null,
      signTypedData: chainClients.ethereal ? signTypedData : null,
      signTypedDataRaw: sessionPrivateKey ? signTypedDataRaw : null,
      sessionKeyAddress,
      etherealSessionApproval,
      arbitrumSessionApproval,
      hasArbitrumSession,
      isCreatingArbitrumSession,
      createArbitrumSessionIfNeeded,
      etherealChainId,
      escrowSessionKeyApproval,
      tradeSessionKeyApproval,
    }),
    [
      isSessionActive,
      sessionConfig,
      chainClients,
      startSession,
      endSession,
      isStartingSession,
      isRestoringSession,
      sessionCreationStep,
      sessionError,
      timeRemainingMs,
      smartAccountAddress,
      isCalculatingAddress,
      accountMode,
      setAccountMode,
      isUsingSmartAccount,
      isUsingSession,
      effectiveAddress,
      sessionPrivateKey,
      signMessage,
      signTypedData,
      signTypedDataRaw,
      sessionKeyAddress,
      etherealSessionApproval,
      arbitrumSessionApproval,
      hasArbitrumSession,
      isCreatingArbitrumSession,
      createArbitrumSessionIfNeeded,
      etherealChainId,
      escrowSessionKeyApproval,
      tradeSessionKeyApproval,
    ]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

/**
 * Format time remaining as a human-readable string.
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Expired';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${seconds}s`;
}
