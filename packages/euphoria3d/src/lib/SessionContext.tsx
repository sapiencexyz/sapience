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
import type { Address, Hex, EIP1193Provider } from 'viem';
import type { KernelAccountClient } from '@zerodev/sdk';
import {
  createSession,
  restoreSession,
  getSmartAccountAddress,
  saveSession,
  loadSession,
  clearSession,
  type SessionConfig,
  type OwnerSigner,
  type SessionCreationStep,
  type SerializedSession,
  type EnableTypedData,
} from './sessionKeyManager';

// Strip private key + ABIs from approval for safe transport to relayer
function extractApprovalForTransport(serializedApproval: string): string | null {
  try {
    const params = JSON.parse(atob(serializedApproval));
    const stripped = {
      enableSignature: params.enableSignature,
      accountParams: params.accountParams,
      permissionParams: stripAbis(params.permissionParams),
      action: params.action,
      kernelVersion: params.kernelVersion,
      validatorData: params.validatorData,
      hookData: params.hookData,
    };
    return btoa(JSON.stringify(stripped));
  } catch {
    return null;
  }
}

function stripAbis(permissionParams: Record<string, unknown>): Record<string, unknown> {
  if (!permissionParams?.policies) return permissionParams;
  return {
    ...permissionParams,
    policies: (permissionParams.policies as Record<string, unknown>[]).map((policy) => {
      const pp = policy.policyParams as { permissions?: Record<string, unknown>[] } | undefined;
      if (!pp?.permissions) return policy;
      return {
        ...policy,
        policyParams: {
          ...pp,
          permissions: pp.permissions.map(({ abi: _abi, ...rest }) => rest),
        },
      };
    }),
  };
}

// --- Types ---

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

interface SessionApprovalData {
  approval: string;
  typedData: EnableTypedData;
}

interface SessionContextValue {
  isSessionActive: boolean;
  sessionConfig: SessionConfig | null;
  etherealClient: KernelAccountClient | null;

  startSession: (params: { durationHours: number; etherealChainId?: number }) => Promise<void>;
  endSession: () => void;

  isStartingSession: boolean;
  sessionCreationStep: SessionCreationStep | null;
  sessionError: Error | null;
  timeRemainingMs: number;

  smartAccountAddress: Address | null;
  effectiveAddress: Address | null;

  isRestoringSession: boolean;
  signTypedData: ((params: SignTypedDataParams) => Promise<Hex>) | null;
  sessionKeyAddress: Address | null;
  etherealSessionApproval: SessionApprovalData | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function createChainSwitcher(
  switchChainAsync: (args: { chainId: number }) => Promise<unknown>,
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const { address: walletAddress, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [etherealClient, setEtherealClient] = useState<KernelAccountClient | null>(null);

  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true); // true until first restore attempt completes
  const [sessionCreationStep, setSessionCreationStep] = useState<SessionCreationStep | null>(null);
  const [sessionError, setSessionError] = useState<Error | null>(null);

  const [smartAccountAddress, setSmartAccountAddress] = useState<Address | null>(null);
  const [timeRemainingMs, setTimeRemainingMs] = useState(0);
  const [sessionPrivateKey, setSessionPrivateKey] = useState<Hex | null>(null);
  const [sessionKeyAddress, setSessionKeyAddress] = useState<Address | null>(null);
  const [etherealSessionApproval, setEtherealSessionApproval] =
    useState<SessionApprovalData | null>(null);

  const effectiveAddress = useMemo((): Address | null => {
    if (!walletAddress) return null;
    return smartAccountAddress && isSessionActive ? smartAccountAddress : walletAddress;
  }, [walletAddress, smartAccountAddress, isSessionActive]);

  // Compute smart account address when wallet connects
  useEffect(() => {
    if (walletAddress) {
      setSmartAccountAddress(getSmartAccountAddress(walletAddress));
    } else {
      setSmartAccountAddress(null);
    }
  }, [walletAddress]);

  // Helper to activate session state from serialized data
  const activateSession = useCallback(
    (config: SessionConfig, client: KernelAccountClient, serialized: SerializedSession) => {
      setSessionConfig(config);
      setEtherealClient(client);
      setIsSessionActive(true);
      setSessionPrivateKey(serialized.sessionPrivateKey);
      setSessionKeyAddress(serialized.sessionKeyAddress);
      setTimeRemainingMs(Math.max(0, config.expiresAt - Date.now()));

      // Extract approval for relayer transport
      if (serialized.etherealApproval && serialized.etherealEnableTypedData) {
        const safe = extractApprovalForTransport(serialized.etherealApproval);
        if (safe) {
          setEtherealSessionApproval({
            approval: safe,
            typedData: serialized.etherealEnableTypedData,
          });
        }
      }
    },
    [],
  );

  // Restore session on mount
  useEffect(() => {
    if (!walletAddress) {
      setIsRestoringSession(false);
      return;
    }

    const stored = loadSession();
    if (!stored) {
      setIsRestoringSession(false);
      return;
    }
    if (stored.config.ownerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      clearSession();
      setIsRestoringSession(false);
      return;
    }

    restoreSession(stored)
      .then(({ config, etherealClient: client, serialized }) => {
        activateSession(config, client, serialized);
        console.debug('[SessionContext] Session restored');
      })
      .catch((err) => {
        console.warn('[SessionContext] Restore failed:', err);
        clearSession();
      })
      .finally(() => {
        setIsRestoringSession(false);
      });
  }, [walletAddress, activateSession]);

  // Expiry countdown
  useEffect(() => {
    if (!isSessionActive || !sessionConfig) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, sessionConfig.expiresAt - Date.now());
      setTimeRemainingMs(remaining);
      if (remaining <= 0) {
        console.debug('[SessionContext] Session expired');
        endSessionInternal();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isSessionActive, sessionConfig]);

  // Clear session on wallet disconnect
  useEffect(() => {
    if (!walletAddress && isSessionActive) {
      endSessionInternal();
    }
  }, [walletAddress, isSessionActive]);

  const endSessionInternal = useCallback(() => {
    setIsSessionActive(false);
    setSessionConfig(null);
    setEtherealClient(null);
    setSessionPrivateKey(null);
    setSessionKeyAddress(null);
    setEtherealSessionApproval(null);
    setTimeRemainingMs(0);
    clearSession();
  }, []);

  const startSessionFn = useCallback(
    async ({ durationHours, etherealChainId }: { durationHours: number; etherealChainId?: number }) => {
      if (!walletAddress || !connector) throw new Error('Wallet not connected');

      setIsStartingSession(true);
      setSessionError(null);
      setSessionCreationStep(null);

      try {
        // Get the EIP-1193 provider from the connector
        // In wagmi v2, getProvider may be async or may need to be called differently
        let provider: EIP1193Provider;
        if (typeof connector.getProvider === 'function') {
          provider = (await connector.getProvider()) as EIP1193Provider;
        } else {
          // Fallback: use window.ethereum directly for injected connectors
          const win = window as unknown as { ethereum?: EIP1193Provider };
          if (!win.ethereum) throw new Error('No Ethereum provider found');
          provider = win.ethereum;
        }
        const ownerSigner: OwnerSigner = {
          address: walletAddress,
          provider,
          switchChain: createChainSwitcher(switchChainAsync),
        };

        const result = await createSession(
          ownerSigner,
          durationHours,
          etherealChainId,
          setSessionCreationStep,
        );

        saveSession(result.serialized);
        activateSession(result.config, result.etherealClient, result.serialized);
        console.debug('[SessionContext] Session created');
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('[SessionContext] Session creation failed:', error);
        setSessionError(error);
        throw error;
      } finally {
        setIsStartingSession(false);
        setSessionCreationStep(null);
      }
    },
    [walletAddress, connector, switchChainAsync, activateSession],
  );

  // Sign typed data through KernelAccountClient (ERC-1271 compatible).
  // The smart account's isValidSignature() can verify these signatures on-chain.
  const signTypedData = useMemo(() => {
    if (!isSessionActive || !etherealClient) return null;

    return async (params: SignTypedDataParams): Promise<Hex> => {
      return etherealClient.signTypedData(
        params as Parameters<typeof etherealClient.signTypedData>[0],
      );
    };
  }, [isSessionActive, etherealClient]);

  const value = useMemo<SessionContextValue>(
    () => ({
      isSessionActive,
      sessionConfig,
      etherealClient,
      startSession: startSessionFn,
      endSession: endSessionInternal,
      isStartingSession,
      isRestoringSession,
      sessionCreationStep,
      sessionError,
      timeRemainingMs,
      smartAccountAddress,
      effectiveAddress,
      signTypedData,
      sessionKeyAddress,
      etherealSessionApproval,
    }),
    [
      isSessionActive,
      sessionConfig,
      etherealClient,
      startSessionFn,
      endSessionInternal,
      isStartingSession,
      isRestoringSession,
      sessionCreationStep,
      sessionError,
      timeRemainingMs,
      smartAccountAddress,
      effectiveAddress,
      signTypedData,
      sessionKeyAddress,
      etherealSessionApproval,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
