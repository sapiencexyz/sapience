'use client';

import {
  DEFAULT_CHAIN_ID,
  CHAIN_ID_ETHEREAL_TESTNET,
  CUSTOM_CHAIN_ID_KEY,
  CUSTOM_RPC_URL_KEY,
  getRpcUrl,
} from '@sapience/sdk/constants';
import { createPublicClient, http } from 'viem';
import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getNetworkEndpointDefaults } from '~/lib/config/networkDefaults';

type SettingsContextValue = {
  /** GraphQL endpoint used by the app. The full path is stored as configured. */
  graphqlEndpoint: string | null;
  /**
   * Auction relayer base URL (stored as http(s) and typically includes the `/auction` path).
   * This is used to construct the auction WebSocket URL via `toAuctionWsUrl(...)`.
   */
  apiBaseUrl: string | null;
  chatBaseUrl: string | null;
  adminBaseUrl: string | null;
  etherealRpcURL: string | null;
  arbitrumRpcURL: string | null;
  /**
   * Custom-chain override. When both are set, the app runs against this chain
   * after a reload (see `readCustomChainOverride` in the SDK). `customChainId`
   * is auto-detected from `customRpcURL` via `detectAndSetCustomChain`.
   */
  customChainId: number | null;
  customRpcURL: string | null;
  /** Signal server endpoint (http(s) — converted to ws(s) at connection time). */
  signalEndpoint: string | null;
  connectionDurationHours: number | null;
  meshRateLimit: number | null;
  meshMaxPeers: number | null;
  meshFanout: number | null;
  setGraphqlEndpoint: (value: string | null) => void;
  setApiBaseUrl: (value: string | null) => void;
  setChatBaseUrl: (value: string | null) => void;
  setAdminBaseUrl: (value: string | null) => void;
  setEtherealRpcUrl: (value: string | null) => void;
  setArbitrumRpcUrl: (value: string | null) => void;
  /**
   * Detect the chain ID from a custom RPC URL and persist both. Does NOT reload —
   * the caller shows the detected id and offers an explicit "Apply & Reload".
   *
   * `fallbackChainId` is used for known presets where the chain ID is static: if
   * the RPC can't be reached (or returns a bogus id), the override is still
   * applied with the known id instead of failing, so the app switches chains and
   * the settings fields populate even when the RPC is temporarily unreachable.
   */
  detectAndSetCustomChain: (
    rpcUrl: string,
    fallbackChainId?: number
  ) => Promise<{ chainId: number } | { error: string }>;
  /** Clear the custom-chain override and reload back to the default chain. */
  clearCustomChain: () => void;
  setSignalEndpoint: (value: string | null) => void;
  setConnectionDurationHours: (value: number | null) => void;
  setMeshRateLimit: (value: number | null) => void;
  setMeshMaxPeers: (value: number | null) => void;
  setMeshFanout: (value: number | null) => void;
  defaults: {
    graphqlEndpoint: string;
    apiBaseUrl: string;
    chatBaseUrl: string;
    adminBaseUrl: string;
    etherealRpcURL: string;
    arbitrumRpcURL: string;
    signalEndpoint: string;
    connectionDurationHours: number;
    meshRateLimit: number;
    meshMaxPeers: number;
    meshFanout: number;
  };
};

const STORAGE_KEYS = {
  graphql: 'sapience.settings.graphqlEndpoint',
  // Legacy key, read once for migration into `graphql` then removed on save.
  legacyGraphqlV2: 'sapience.settings.graphqlEndpointV2',
  api: 'sapience.settings.apiBaseUrl',
  chat: 'sapience.settings.chatBaseUrl',
  admin: 'sapience.settings.adminBaseUrl',
  etherealRpcURL: 'sapience.settings.etherealRpcURL',
  arbitrumRpcURL: 'sapience.settings.arbitrumRpcURL',
  // Custom-chain override keys are owned by the SDK (single source of truth)
  customChainId: CUSTOM_CHAIN_ID_KEY,
  customRpcURL: CUSTOM_RPC_URL_KEY,
  connectionDurationHours: 'sapience.settings.connectionDurationHours',
  signalEndpoint: 'sapience.settings.signalEndpoint',
  meshRateLimit: 'sapience.settings.meshRateLimit',
  meshMaxPeers: 'sapience.settings.meshMaxPeers',
  meshFanout: 'sapience.settings.meshFanout',
} as const;

export const DEFAULT_CONNECTION_DURATION_HOURS = 24 * 7;

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeBaseUrlPreservePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    const path =
      u.pathname.endsWith('/') && u.pathname !== '/'
        ? u.pathname.slice(0, -1)
        : u.pathname;
    return `${u.origin}${path}`;
  } catch {
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  }
}

function getDefaultEtherealRpcURL(): string {
  // Uses DEFAULT_CHAIN_ID so staging (testnet) gets the testnet RPC automatically
  return getRpcUrl(DEFAULT_CHAIN_ID);
}

function getDefaultArbitrumRpcURL(): string {
  const isTestnet = DEFAULT_CHAIN_ID === CHAIN_ID_ETHEREAL_TESTNET;
  const infuraKey = process.env.NEXT_PUBLIC_INFURA_API_KEY;
  if (infuraKey) {
    return isTestnet
      ? `https://arbitrum-sepolia.infura.io/v3/${infuraKey}`
      : `https://arbitrum-mainnet.infura.io/v3/${infuraKey}`;
  }
  return isTestnet
    ? 'https://arbitrum-sepolia-rpc.publicnode.com'
    : 'https://arbitrum-rpc.publicnode.com';
}

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined
);

export const SettingsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [graphqlOverride, setGraphqlOverride] = useState<string | null>(null);
  const [apiBaseOverride, setApiBaseOverride] = useState<string | null>(null);
  const [chatBaseOverride, setChatBaseOverride] = useState<string | null>(null);
  const [adminBaseOverride, setAdminBaseOverride] = useState<string | null>(
    null
  );
  const [etherealRpcOverride, setEtherealRpcOverride] = useState<string | null>(
    null
  );
  const [arbitrumRpcOverride, setArbitrumRpcOverride] = useState<string | null>(
    null
  );
  const [customChainIdOverride, setCustomChainIdOverride] = useState<
    number | null
  >(null);
  const [customRpcOverride, setCustomRpcOverride] = useState<string | null>(
    null
  );
  const [mounted, setMounted] = useState(false);
  const [connectionDurationHoursOverride, setConnectionDurationHoursOverride] =
    useState<number | null>(null);
  const [signalEndpointOverride, setSignalEndpointOverride] = useState<
    string | null
  >(null);
  const [meshRateLimitOverride, setMeshRateLimitOverride] = useState<
    number | null
  >(null);
  const [meshMaxPeersOverride, setMeshMaxPeersOverride] = useState<
    number | null
  >(null);
  const [meshFanoutOverride, setMeshFanoutOverride] = useState<number | null>(
    null
  );

  useEffect(() => {
    setMounted(true);
    try {
      const g =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.graphql)
          : null;
      // Migration: older sessions stored the endpoint under the legacy v2 key.
      const gLegacy =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.legacyGraphqlV2)
          : null;
      const a =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.api)
          : null;
      const c =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.chat)
          : null;
      const admin =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.admin)
          : null;
      const etherealRpc =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.etherealRpcURL)
          : null;
      const arbitrumRpc =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.arbitrumRpcURL)
          : null;
      const cdh =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.connectionDurationHours)
          : null;
      const gResolved = g && isHttpUrl(g) ? g : gLegacy;
      if (gResolved && isHttpUrl(gResolved)) setGraphqlOverride(gResolved);
      if (a && isHttpUrl(a))
        setApiBaseOverride(normalizeBaseUrlPreservePath(a));
      if (c !== null && c.trim() === '') {
        // Explicit disable: chat is turned off and the bubble is hidden.
        setChatBaseOverride('');
      } else if (c && isHttpUrl(c)) {
        setChatBaseOverride(normalizeBaseUrlPreservePath(c));
      }
      if (admin && isHttpUrl(admin))
        setAdminBaseOverride(normalizeBaseUrlPreservePath(admin));
      const sig =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.signalEndpoint)
          : null;
      if (sig !== null && sig.trim() === '') {
        // Explicit disable: the mesh signal is turned off.
        setSignalEndpointOverride('');
      } else if (sig && isHttpUrl(sig)) {
        setSignalEndpointOverride(normalizeBaseUrlPreservePath(sig));
      }
      if (etherealRpc && isHttpUrl(etherealRpc))
        setEtherealRpcOverride(etherealRpc);
      if (arbitrumRpc && isHttpUrl(arbitrumRpc))
        setArbitrumRpcOverride(arbitrumRpc);
      const customRpc =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.customRpcURL)
          : null;
      const customId =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.customChainId)
          : null;
      if (customRpc && isHttpUrl(customRpc)) setCustomRpcOverride(customRpc);
      if (customId) {
        const parsed = Number(customId);
        if (Number.isInteger(parsed) && parsed > 0)
          setCustomChainIdOverride(parsed);
      }
      if (cdh) {
        const parsed = parseInt(cdh, 10);
        if (Number.isFinite(parsed) && parsed >= 1)
          setConnectionDurationHoursOverride(parsed);
      }
      const mrl =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.meshRateLimit)
          : null;
      if (mrl) {
        const parsed = parseInt(mrl, 10);
        if (Number.isFinite(parsed) && parsed >= 1)
          setMeshRateLimitOverride(parsed);
      }
      const mmp =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.meshMaxPeers)
          : null;
      if (mmp) {
        const parsed = parseInt(mmp, 10);
        if (Number.isFinite(parsed) && parsed >= 1)
          setMeshMaxPeersOverride(parsed);
      }
      const mf =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.meshFanout)
          : null;
      if (mf) {
        const parsed = parseInt(mf, 10);
        if (Number.isFinite(parsed) && parsed >= 0)
          setMeshFanoutOverride(parsed);
      }
    } catch {
      /* noop */
    }
  }, []);

  const defaults = useMemo(() => {
    const net = getNetworkEndpointDefaults();
    return {
      graphqlEndpoint: net.graphqlEndpoint,
      apiBaseUrl: net.relayerBase,
      signalEndpoint: net.signalEndpoint,
      chatBaseUrl: net.chatBase,
      adminBaseUrl: net.adminBase,
      etherealRpcURL: getDefaultEtherealRpcURL(),
      arbitrumRpcURL: getDefaultArbitrumRpcURL(),
      connectionDurationHours: DEFAULT_CONNECTION_DURATION_HOURS,
      meshRateLimit: 100,
      meshMaxPeers: 25,
      meshFanout: 0,
    };
  }, []);

  // Persist default admin base on first load if no override exists,
  // so the field "sticks" across env changes. Reset will clear override
  // and fall back to the latest defaults.
  useEffect(() => {
    if (!mounted) return;
    try {
      if (typeof window === 'undefined') return;
      const current = window.localStorage.getItem(STORAGE_KEYS.admin);
      if (!current) {
        const v = normalizeBaseUrlPreservePath(defaults.adminBaseUrl);
        window.localStorage.setItem(STORAGE_KEYS.admin, v);
        setAdminBaseOverride(v);
      }
    } catch {
      /* noop */
    }
  }, [mounted, defaults.adminBaseUrl]);

  const graphqlEndpoint = mounted
    ? graphqlOverride || defaults.graphqlEndpoint
    : null;
  const apiBaseUrl = mounted ? apiBaseOverride || defaults.apiBaseUrl : null;
  const signalEndpoint = mounted
    ? // An empty (not null) override means the mesh is explicitly disabled, so
      // keep it blank instead of falling back to the default endpoint.
      signalEndpointOverride === ''
      ? ''
      : signalEndpointOverride || defaults.signalEndpoint
    : null;
  const chatBaseUrl = mounted
    ? // An empty (not null) override means chat is explicitly disabled, so keep
      // it blank instead of falling back to the default endpoint.
      chatBaseOverride === ''
      ? ''
      : chatBaseOverride || defaults.chatBaseUrl
    : null;
  const adminBaseUrl = mounted
    ? adminBaseOverride || defaults.adminBaseUrl
    : null;
  const etherealRpcURL = mounted
    ? etherealRpcOverride || defaults.etherealRpcURL
    : null;
  const arbitrumRpcURL = mounted
    ? arbitrumRpcOverride || defaults.arbitrumRpcURL
    : null;
  const customChainId = mounted ? customChainIdOverride : null;
  const customRpcURL = mounted ? customRpcOverride : null;
  const connectionDurationHours = mounted
    ? (connectionDurationHoursOverride ?? defaults.connectionDurationHours)
    : null;
  const meshRateLimit = mounted
    ? (meshRateLimitOverride ?? defaults.meshRateLimit)
    : null;
  const meshMaxPeers = mounted
    ? (meshMaxPeersOverride ?? defaults.meshMaxPeers)
    : null;
  const meshFanout = mounted
    ? (meshFanoutOverride ?? defaults.meshFanout)
    : null;

  const setGraphqlEndpoint = useCallback((value: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      // Always clear the legacy v2 key so a stale value can't resurface.
      window.localStorage.removeItem(STORAGE_KEYS.legacyGraphqlV2);
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEYS.graphql);
        setGraphqlOverride(null);
        return;
      }
      const v = value.trim();
      if (!isHttpUrl(v)) return;
      window.localStorage.setItem(STORAGE_KEYS.graphql, v);
      setGraphqlOverride(v);
    } catch {
      /* noop */
    }
  }, []);

  const setApiBaseUrl = useCallback((value: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEYS.api);
        setApiBaseOverride(null);
        return;
      }
      const v = normalizeBaseUrlPreservePath(value);
      if (!isHttpUrl(v)) return;
      window.localStorage.setItem(STORAGE_KEYS.api, v);
      setApiBaseOverride(v);
    } catch {
      /* noop */
    }
  }, []);

  const setSignalEndpoint = useCallback((value: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      // null resets to the default endpoint (removes the override entirely).
      if (value === null) {
        window.localStorage.removeItem(STORAGE_KEYS.signalEndpoint);
        setSignalEndpointOverride(null);
        return;
      }
      // An explicit empty string disables the mesh: persist a blank value so it
      // is honored over the default endpoint and getSignalUrl() returns ''.
      if (value.trim() === '') {
        window.localStorage.setItem(STORAGE_KEYS.signalEndpoint, '');
        setSignalEndpointOverride('');
        return;
      }
      const v = normalizeBaseUrlPreservePath(value);
      if (!isHttpUrl(v)) return;
      window.localStorage.setItem(STORAGE_KEYS.signalEndpoint, v);
      setSignalEndpointOverride(v);
    } catch {
      /* noop */
    }
  }, []);

  const setChatBaseUrl = useCallback((value: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      // null resets to the default endpoint (removes the override entirely).
      if (value === null) {
        window.localStorage.removeItem(STORAGE_KEYS.chat);
        setChatBaseOverride(null);
        return;
      }
      // An explicit empty string disables chat: persist a blank value so it is
      // honored over the default endpoint and the chat bubble stays hidden.
      if (value.trim() === '') {
        window.localStorage.setItem(STORAGE_KEYS.chat, '');
        setChatBaseOverride('');
        return;
      }
      const v = normalizeBaseUrlPreservePath(value);
      if (!isHttpUrl(v)) return;
      window.localStorage.setItem(STORAGE_KEYS.chat, v);
      setChatBaseOverride(v);
    } catch {
      /* noop */
    }
  }, []);

  const setAdminBaseUrl = useCallback((value: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEYS.admin);
        setAdminBaseOverride(null);
        return;
      }
      const v = normalizeBaseUrlPreservePath(value);
      if (!isHttpUrl(v)) return;
      window.localStorage.setItem(STORAGE_KEYS.admin, v);
      setAdminBaseOverride(v);
    } catch {
      /* noop */
    }
  }, []);

  const setEtherealRpcUrl = useCallback((value: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEYS.etherealRpcURL);
        setEtherealRpcOverride(null);
        return;
      }
      const v = value.trim();
      if (!isHttpUrl(v)) return;
      window.localStorage.setItem(STORAGE_KEYS.etherealRpcURL, v);
      setEtherealRpcOverride(v);
    } catch {
      /* noop */
    }
  }, []);

  const setArbitrumRpcUrl = useCallback((value: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEYS.arbitrumRpcURL);
        setArbitrumRpcOverride(null);
        return;
      }
      const v = value.trim();
      if (!isHttpUrl(v)) return;
      window.localStorage.setItem(STORAGE_KEYS.arbitrumRpcURL, v);
      setArbitrumRpcOverride(v);
    } catch {
      /* noop */
    }
  }, []);

  const detectAndSetCustomChain = useCallback(
    async (
      rpcUrl: string,
      fallbackChainId?: number
    ): Promise<{ chainId: number } | { error: string }> => {
      const url = rpcUrl.trim();
      if (!isHttpUrl(url)) {
        return { error: 'Must be an absolute http(s) URL' };
      }
      const persist = (chainId: number) => {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEYS.customRpcURL, url);
          window.localStorage.setItem(
            STORAGE_KEYS.customChainId,
            String(chainId)
          );
        }
        setCustomRpcOverride(url);
        setCustomChainIdOverride(chainId);
      };
      try {
        const client = createPublicClient({ transport: http(url) });
        const chainId = await client.getChainId();
        if (!Number.isInteger(chainId) || chainId <= 0) {
          // RPC reachable but returned a bogus id — fall back to the known id
          // when the caller supplied one (presets), otherwise surface the error.
          if (fallbackChainId != null) {
            persist(fallbackChainId);
            return { chainId: fallbackChainId };
          }
          return { error: 'RPC returned an invalid chain ID' };
        }
        persist(chainId);
        return { chainId };
      } catch {
        // RPC unreachable. For known presets we still apply the override with the
        // static id so the app switches chains and the fields populate; for a
        // user-entered URL with no known id, surface the error as before.
        if (fallbackChainId != null) {
          persist(fallbackChainId);
          return { chainId: fallbackChainId };
        }
        return { error: 'Could not reach RPC or read chain ID' };
      }
    },
    []
  );

  const clearCustomChain = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.removeItem(STORAGE_KEYS.customRpcURL);
      window.localStorage.removeItem(STORAGE_KEYS.customChainId);
      setCustomRpcOverride(null);
      setCustomChainIdOverride(null);
      // Reload so DEFAULT_CHAIN_ID and the wagmi config re-evaluate to defaults.
      window.location.reload();
    } catch {
      /* noop */
    }
  }, []);

  const setConnectionDurationHours = useCallback((value: number | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (value == null) {
        window.localStorage.removeItem(STORAGE_KEYS.connectionDurationHours);
        setConnectionDurationHoursOverride(null);
        return;
      }
      const clamped = Math.max(1, Math.floor(Number(value)));
      if (!Number.isFinite(clamped)) return;
      window.localStorage.setItem(
        STORAGE_KEYS.connectionDurationHours,
        String(clamped)
      );
      setConnectionDurationHoursOverride(clamped);
    } catch {
      /* noop */
    }
  }, []);

  const setMeshRateLimit = useCallback((value: number | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (value == null) {
        window.localStorage.removeItem(STORAGE_KEYS.meshRateLimit);
        setMeshRateLimitOverride(null);
        return;
      }
      const clamped = Math.max(1, Math.min(200, Math.floor(Number(value))));
      if (!Number.isFinite(clamped)) return;
      window.localStorage.setItem(STORAGE_KEYS.meshRateLimit, String(clamped));
      setMeshRateLimitOverride(clamped);
    } catch {
      /* noop */
    }
  }, []);

  const setMeshMaxPeers = useCallback((value: number | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (value == null) {
        window.localStorage.removeItem(STORAGE_KEYS.meshMaxPeers);
        setMeshMaxPeersOverride(null);
        return;
      }
      const clamped = Math.max(1, Math.min(12, Math.floor(Number(value))));
      if (!Number.isFinite(clamped)) return;
      window.localStorage.setItem(STORAGE_KEYS.meshMaxPeers, String(clamped));
      setMeshMaxPeersOverride(clamped);
    } catch {
      /* noop */
    }
  }, []);

  const setMeshFanout = useCallback((value: number | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (value == null) {
        window.localStorage.removeItem(STORAGE_KEYS.meshFanout);
        setMeshFanoutOverride(null);
        return;
      }
      const clamped = Math.max(0, Math.min(12, Math.floor(Number(value))));
      if (!Number.isFinite(clamped)) return;
      window.localStorage.setItem(STORAGE_KEYS.meshFanout, String(clamped));
      setMeshFanoutOverride(clamped);
    } catch {
      /* noop */
    }
  }, []);

  const value: SettingsContextValue = {
    graphqlEndpoint,
    apiBaseUrl,
    signalEndpoint,
    chatBaseUrl,
    adminBaseUrl,
    etherealRpcURL,
    arbitrumRpcURL,
    customChainId,
    customRpcURL,
    connectionDurationHours,
    meshRateLimit,
    meshMaxPeers,
    meshFanout,
    setGraphqlEndpoint,
    setApiBaseUrl,
    setSignalEndpoint,
    setChatBaseUrl,
    setAdminBaseUrl,
    setEtherealRpcUrl,
    setArbitrumRpcUrl,
    detectAndSetCustomChain,
    clearCustomChain,
    setConnectionDurationHours,
    setMeshRateLimit,
    setMeshMaxPeers,
    setMeshFanout,
    defaults,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx)
    throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
};
