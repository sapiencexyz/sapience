import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import type { Address, EIP1193Provider } from 'viem';
import type { KernelAccountClient } from '@zerodev/sdk';
import {
  createSession,
  restoreSession,
  loadSession,
  saveSession,
  clearSession,
  type OwnerSigner,
  type SessionConfig,
  type SessionCreationStep,
  type SerializedSession,
} from '~/lib/session/sessionKeyManager';

interface SessionState {
  isReady: boolean;
  isActive: boolean;
  config: SessionConfig | null;
  client: KernelAccountClient | null;
  isStarting: boolean;
  isRestoring: boolean;
  step: SessionCreationStep | null;
  error: Error | null;
}

interface SessionContextValue extends SessionState {
  start: (durationHours?: number) => Promise<void>;
  end: () => void;
}

const SessionCtx = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { address: ownerAddress, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [state, setState] = useState<SessionState>({
    isReady: false,
    isActive: false,
    config: null,
    client: null,
    isStarting: false,
    isRestoring: false,
    step: null,
    error: null,
  });

  // Try to rehydrate a saved session on mount / when owner changes.
  const restoredForOwner = useRef<Address | null>(null);
  useEffect(() => {
    if (!ownerAddress) {
      restoredForOwner.current = null;
      setState((s) => ({
        ...s,
        isReady: true,
        isActive: false,
        config: null,
        client: null,
      }));
      return;
    }
    if (restoredForOwner.current === ownerAddress) return;
    restoredForOwner.current = ownerAddress;

    const stored = loadSession();
    if (
      !stored ||
      stored.config.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()
    ) {
      setState((s) => ({ ...s, isReady: true, isActive: false }));
      return;
    }
    setState((s) => ({ ...s, isRestoring: true }));
    restoreSession(stored)
      .then((result) => {
        // No backend registration: the backend is stateless — the session
        // rides along with each submit/line request instead.
        setState({
          isReady: true,
          isActive: true,
          config: result.config,
          client: result.client,
          isStarting: false,
          isRestoring: false,
          step: null,
          error: null,
        });
      })
      .catch((e) => {
        clearSession();
        setState({
          isReady: true,
          isActive: false,
          config: null,
          client: null,
          isStarting: false,
          isRestoring: false,
          step: null,
          error: e instanceof Error ? e : new Error(String(e)),
        });
      });
  }, [ownerAddress]);

  const start = useCallback(
    async (durationHours = 24) => {
      if (!ownerAddress) throw new Error('Wallet not connected');
      if (!connector) throw new Error('Connector not ready');

      setState((s) => ({
        ...s,
        isStarting: true,
        step: null,
        error: null,
      }));

      try {
        const provider = (await connector.getProvider()) as EIP1193Provider;
        const ownerSigner: OwnerSigner = {
          address: ownerAddress,
          provider,
          switchChain: async (chainId: number) => {
            await switchChainAsync({ chainId });
          },
        };

        const result = await createSession(
          ownerSigner,
          durationHours,
          (step) => setState((s) => ({ ...s, step })),
        );
        saveSession(result.serialized);
        setState({
          isReady: true,
          isActive: true,
          config: result.config,
          client: result.client,
          isStarting: false,
          isRestoring: false,
          step: null,
          error: null,
        });
      } catch (e) {
        setState((s) => ({
          ...s,
          isStarting: false,
          step: null,
          error: e instanceof Error ? e : new Error(String(e)),
        }));
        throw e;
      }
    },
    [ownerAddress, connector, switchChainAsync],
  );

  const end = useCallback(() => {
    clearSession();
    setState((s) => ({
      ...s,
      isActive: false,
      config: null,
      client: null,
      error: null,
    }));
  }, []);

  return (
    <SessionCtx.Provider value={{ ...state, start, end }}>
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

export type { SerializedSession };
