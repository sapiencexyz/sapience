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
import { useAccount, useSwitchChain } from 'wagmi';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { KernelAccountClient } from '@zerodev/sdk';
import {
  createSession,
  restoreSession,
  getSmartAccountAddress,
  saveSession,
  loadSession,
  clearSession,
  type SessionConfig,
  type SessionResult,
  type OwnerSigner,
  type EnableTypedData,
  type SerializedSession,
} from '~/lib/session/sessionKeyManager';

// Helper to strip private key from approval for safe transport
function extractApprovalForTransport(serializedApproval: string): string | null {
  try {
    const jsonString = atob(serializedApproval);
    const params = JSON.parse(jsonString);

    // Remove the private key before transport
    const safeParams = {
      enableSignature: params.enableSignature,
      accountParams: params.accountParams,
      permissionParams: params.permissionParams,
      action: params.action,
      kernelVersion: params.kernelVersion,
      validatorData: params.validatorData,
      hookData: params.hookData,
      // Explicitly exclude: privateKey, eip7702Auth
    };

    const safeJsonString = JSON.stringify(safeParams);
    return btoa(safeJsonString);
  } catch {
    return null;
  }
}

// Chain clients type
interface ChainClients {
  ethereal: KernelAccountClient<any, any, any> | null;
  arbitrum: KernelAccountClient<any, any, any> | null;
}

// Type for signTypedData parameters
interface SignTypedDataParams {
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: Address;
  };
  types: Record<string, readonly { readonly name: string; readonly type: string }[]>;
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

// Session context value
interface SessionContextValue {
  // Session state
  isSessionActive: boolean;
  sessionConfig: SessionConfig | null;
  chainClients: ChainClients;

  // Session actions
  startSession: (params: { durationHours: number }) => Promise<void>;
  endSession: () => void;

  // Status
  isStartingSession: boolean;
  isRestoringSession: boolean;
  sessionError: Error | null;

  // Time remaining in milliseconds
  timeRemainingMs: number;

  // Smart account address (available before session starts)
  smartAccountAddress: Address | null;
  isCalculatingAddress: boolean;

  // Session signing functions (available when session is active)
  // Note: These are used for on-chain UserOperations via ZeroDev, not for relayer auth
  signMessage: ((message: string) => Promise<Hex>) | null;
  signTypedData: ((params: SignTypedDataParams) => Promise<Hex>) | null;

  // Session key address (for reference, but relayer auth uses owner's wallet signature)
  sessionKeyAddress: Address | null;

  // Session approval data for relayer authentication (per chain)
  // Use Arbitrum for most relayer requests
  arbitrumSessionApproval: SessionApprovalData | null;
  etherealSessionApproval: SessionApprovalData | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const { address: walletAddress, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  // Session state
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [chainClients, setChainClients] = useState<ChainClients>({
    ethereal: null,
    arbitrum: null,
  });

  // Status state
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [sessionError, setSessionError] = useState<Error | null>(null);

  // Smart account address state
  const [smartAccountAddress, setSmartAccountAddress] = useState<Address | null>(null);
  const [isCalculatingAddress, setIsCalculatingAddress] = useState(false);

  // Time remaining
  const [timeRemainingMs, setTimeRemainingMs] = useState(0);

  // Session private key for signing
  const [sessionPrivateKey, setSessionPrivateKey] = useState<Hex | null>(null);

  // Session metadata for relayer verification
  const [sessionKeyAddress, setSessionKeyAddress] = useState<Address | null>(null);

  // Session approval data for relayer authentication (per chain)
  const [arbitrumSessionApproval, setArbitrumSessionApproval] = useState<SessionApprovalData | null>(null);
  const [etherealSessionApproval, setEtherealSessionApproval] = useState<SessionApprovalData | null>(null);

  // Helper to extract session approval data from serialized session
  const extractSessionApprovalData = useCallback((serialized: SerializedSession): {
    arbitrum: SessionApprovalData | null;
    ethereal: SessionApprovalData | null;
  } => {
    let arbitrum: SessionApprovalData | null = null;
    let ethereal: SessionApprovalData | null = null;

    // Extract Arbitrum approval
    if (serialized.arbitrumApproval && serialized.arbitrumEnableTypedData) {
      const safeApproval = extractApprovalForTransport(serialized.arbitrumApproval);
      if (safeApproval) {
        arbitrum = {
          approval: safeApproval,
          typedData: serialized.arbitrumEnableTypedData,
        };
      }
    }

    // Extract Ethereal approval
    if (serialized.etherealApproval && serialized.etherealEnableTypedData) {
      const safeApproval = extractApprovalForTransport(serialized.etherealApproval);
      if (safeApproval) {
        ethereal = {
          approval: safeApproval,
          typedData: serialized.etherealEnableTypedData,
        };
      }
    }

    return { arbitrum, ethereal };
  }, []);

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

  // Sign typed data with session key
  const signTypedData = useCallback(
    async (params: SignTypedDataParams): Promise<Hex> => {
      if (!sessionPrivateKey) {
        throw new Error('No active session');
      }
      const account = privateKeyToAccount(sessionPrivateKey);
      return account.signTypedData(params as any);
    },
    [sessionPrivateKey]
  );

  // Calculate smart account address when wallet connects
  useEffect(() => {
    if (!walletAddress) {
      setSmartAccountAddress(null);
      return;
    }

    let cancelled = false;

    const calculateAddress = async () => {
      setIsCalculatingAddress(true);
      try {
        const address = await getSmartAccountAddress(walletAddress);
        if (!cancelled) {
          setSmartAccountAddress(address);
        }
      } catch (error) {
        console.error('Failed to calculate smart account address:', error);
        if (!cancelled) {
          setSmartAccountAddress(null);
        }
      } finally {
        if (!cancelled) {
          setIsCalculatingAddress(false);
        }
      }
    };

    void calculateAddress();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  // Restore session from localStorage on mount
  useEffect(() => {
    const restore = async () => {
      const stored = loadSession();
      console.debug('[SessionContext] Checking for stored session:', stored ? 'found' : 'none');
      if (!stored) return;

      // Check if the stored session matches the current wallet
      if (walletAddress?.toLowerCase() !== stored.config.ownerAddress.toLowerCase()) {
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
        // Extract session approval data for relayer authentication
        const approvalData = extractSessionApprovalData(stored);
        setArbitrumSessionApproval(approvalData.arbitrum);
        setEtherealSessionApproval(approvalData.ethereal);
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
    console.debug('[SessionContext] Ending session, clearing state and localStorage');
    setIsSessionActive(false);
    setSessionConfig(null);
    setChainClients({ ethereal: null, arbitrum: null });
    setSessionPrivateKey(null);
    setSessionKeyAddress(null);
    setArbitrumSessionApproval(null);
    setEtherealSessionApproval(null);
    setTimeRemainingMs(0);
    clearSession();
    console.debug('[SessionContext] Session cleared');
  }, []);

  // Start a new session
  const startSession = useCallback(
    async (params: { durationHours: number }) => {
      if (!connectedWallet?.address) {
        throw new Error('No wallet connected');
      }

      setIsStartingSession(true);
      setSessionError(null);

      try {
        // Get the Ethereum provider from the connected wallet's connector
        // ZeroDev will use this provider to request signatures via EIP-1193
        const provider = await connector.getProvider();

        // Create a chain switcher function for multi-chain session creation
        const switchChain = async (chainId: number) => {
          try {
            await switchChainAsync({ chainId });
          } catch (error: any) {
            // If chain doesn't exist, try to add it first (for Ethereal)
            if (error?.code === 4902 || error?.message?.includes('Unrecognized chain')) {
              // Chain not added to wallet, need to add it
              // For now, just re-throw - user needs to add the chain manually
              throw new Error(`Please add chain ${chainId} to your wallet first`);
            }
            throw error;
          }
        };

        // Create owner signer with the EIP-1193 provider and chain switcher
        // ZeroDev's signerToEcdsaValidator accepts EIP-1193 providers directly
        const ownerSigner: OwnerSigner = {
          address: walletAddress,
          provider,
          switchChain,
        };

        const result = await createSession(
          ownerSigner,
          params.durationHours
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
        // Extract session approval data for relayer authentication
        const approvalData = extractSessionApprovalData(result.serialized);
        setArbitrumSessionApproval(approvalData.arbitrum);
        setEtherealSessionApproval(approvalData.ethereal);
        setIsSessionActive(true);
        setTimeRemainingMs(result.config.expiresAt - Date.now());
        console.debug('[SessionContext] Session active, smart account:', result.config.smartAccountAddress);
      } catch (error) {
        console.error('Failed to start session:', error);
        setSessionError(error instanceof Error ? error : new Error('Failed to start session'));
        throw error;
      } finally {
        setIsStartingSession(false);
      }
    },
    [walletAddress, connector, switchChainAsync]
  );

  // End the current session
  const endSession = useCallback(() => {
    endSessionInternal();
  }, [endSessionInternal]);

  // Clear session when wallet disconnects
  useEffect(() => {
    if (!walletAddress && isSessionActive) {
      endSessionInternal();
    }
  }, [walletAddress, isSessionActive, endSessionInternal]);

  const value = useMemo(
    () => ({
      isSessionActive,
      sessionConfig,
      chainClients,
      startSession,
      endSession,
      isStartingSession,
      isRestoringSession,
      sessionError,
      timeRemainingMs,
      smartAccountAddress,
      isCalculatingAddress,
      signMessage: sessionPrivateKey ? signMessage : null,
      signTypedData: sessionPrivateKey ? signTypedData : null,
      sessionKeyAddress,
      arbitrumSessionApproval,
      etherealSessionApproval,
    }),
    [
      isSessionActive,
      sessionConfig,
      chainClients,
      startSession,
      endSession,
      isStartingSession,
      isRestoringSession,
      sessionError,
      timeRemainingMs,
      smartAccountAddress,
      isCalculatingAddress,
      sessionPrivateKey,
      signMessage,
      signTypedData,
      sessionKeyAddress,
      arbitrumSessionApproval,
      etherealSessionApproval,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
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
