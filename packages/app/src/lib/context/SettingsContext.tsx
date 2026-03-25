'use client';

import {
  DEFAULT_CHAIN_ID,
  CHAIN_ID_ETHEREAL_TESTNET,
  getRpcUrl,
} from '@sapience/sdk/constants';
import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type SettingsContextValue = {
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
  /** Signal server endpoint (http(s) — converted to ws(s) at connection time). */
  signalEndpoint: string | null;
  // Research Agent settings
  openrouterApiKey: string | null;
  researchAgentSystemMessage: string | null;
  researchAgentModel: string | null;
  researchAgentTemperature: number | null;
  // Appearance settings
  showAmericanOdds: boolean | null;
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
  setSignalEndpoint: (value: string | null) => void;
  setOpenrouterApiKey: (value: string | null) => void;
  setResearchAgentSystemMessage: (value: string | null) => void;
  setResearchAgentModel: (value: string | null) => void;
  setResearchAgentTemperature: (value: number | null) => void;
  setShowAmericanOdds: (value: boolean | null) => void;
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
    researchAgentSystemMessage: string;
    researchAgentModel: string;
    researchAgentTemperature: number;
    showAmericanOdds: boolean;
    connectionDurationHours: number;
    meshRateLimit: number;
    meshMaxPeers: number;
    meshFanout: number;
  };
};

const STORAGE_KEYS = {
  graphql: 'sapience.settings.graphqlEndpoint',
  api: 'sapience.settings.apiBaseUrl',
  chat: 'sapience.settings.chatBaseUrl',
  admin: 'sapience.settings.adminBaseUrl',
  etherealRpcURL: 'sapience.settings.etherealRpcURL',
  arbitrumRpcURL: 'sapience.settings.arbitrumRpcURL',
  openrouterApiKey: 'sapience.settings.openrouterApiKey',
  researchAgentSystemMessage: 'sapience.settings.researchAgentSystemMessage',
  researchAgentModel: 'sapience.settings.researchAgentModel',
  researchAgentTemperature: 'sapience.settings.researchAgentTemperature',
  showAmericanOdds: 'sapience.settings.showAmericanOdds',
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

function getDefaultSignalEndpoint(): string {
  const relayerBase = getDefaultRelayerBase();
  try {
    const u = new URL(relayerBase);
    u.pathname = '/signal';
    return u.toString();
  } catch {
    return 'https://relayer.sapience.xyz/signal';
  }
}

function getDefaultRelayerBase(): string {
  // Auction relayer base. Prefer explicit relayer env, otherwise derive from API env
  // but only swap `api.sapience.xyz` -> `relayer.sapience.xyz` for production.
  const explicitRelayer = process.env.NEXT_PUBLIC_FOIL_RELAYER_URL;
  const apiRoot =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  const root = explicitRelayer || apiRoot;
  try {
    const u = new URL(root);
    if (!explicitRelayer && u.hostname === 'api.sapience.xyz') {
      u.hostname = 'relayer.sapience.xyz';
    }
    return `${u.origin}/auction`;
  } catch {
    return 'https://relayer.sapience.xyz/auction';
  }
}

function getDefaultGraphqlEndpoint(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/graphql`;
  } catch {
    return 'https://api.sapience.xyz/graphql';
  }
}

function getDefaultChatBase(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/chat`;
  } catch {
    return 'https://api.sapience.xyz/chat';
  }
}

function getDefaultAdminBase(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/admin`;
  } catch {
    return 'https://api.sapience.xyz/admin';
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
  const [openrouterApiKeyOverride, setOpenrouterApiKeyOverride] = useState<
    string | null
  >(null);
  const [
    researchAgentSystemMessageOverride,
    setResearchAgentSystemMessageOverride,
  ] = useState<string | null>(null);
  const [researchAgentModelOverride, setResearchAgentModelOverride] = useState<
    string | null
  >(null);
  const [
    researchAgentTemperatureOverride,
    setResearchAgentTemperatureOverride,
  ] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showAmericanOddsOverride, setShowAmericanOddsOverride] = useState<
    boolean | null
  >(null);
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
      const ork =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.openrouterApiKey)
          : null;
      const rsm =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.researchAgentSystemMessage)
          : null;
      const rmodel =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.researchAgentModel)
          : null;
      const rtemp =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.researchAgentTemperature)
          : null;
      const sao =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.showAmericanOdds)
          : null;
      const cdh =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.connectionDurationHours)
          : null;
      if (g && isHttpUrl(g)) setGraphqlOverride(g);
      if (a && isHttpUrl(a))
        setApiBaseOverride(normalizeBaseUrlPreservePath(a));
      if (c && isHttpUrl(c))
        setChatBaseOverride(normalizeBaseUrlPreservePath(c));
      if (admin && isHttpUrl(admin))
        setAdminBaseOverride(normalizeBaseUrlPreservePath(admin));
      const sig =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.signalEndpoint)
          : null;
      if (sig && isHttpUrl(sig))
        setSignalEndpointOverride(normalizeBaseUrlPreservePath(sig));
      if (etherealRpc && isHttpUrl(etherealRpc))
        setEtherealRpcOverride(etherealRpc);
      if (arbitrumRpc && isHttpUrl(arbitrumRpc))
        setArbitrumRpcOverride(arbitrumRpc);
      if (ork) setOpenrouterApiKeyOverride(ork);
      if (rsm) setResearchAgentSystemMessageOverride(rsm);
      if (rmodel) setResearchAgentModelOverride(rmodel);
      if (rtemp) {
        const parsed = parseFloat(rtemp);
        if (Number.isFinite(parsed))
          setResearchAgentTemperatureOverride(parsed);
      }
      if (sao != null) {
        // store as '1' or '0' or 'true'/'false'
        const lowered = sao.toLowerCase();
        const val = lowered === '1' || lowered === 'true';
        setShowAmericanOddsOverride(val);
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

  const defaults = useMemo(
    () => ({
      graphqlEndpoint: getDefaultGraphqlEndpoint(),
      apiBaseUrl: getDefaultRelayerBase(),
      signalEndpoint: getDefaultSignalEndpoint(),
      chatBaseUrl: getDefaultChatBase(),
      adminBaseUrl: getDefaultAdminBase(),
      etherealRpcURL: getDefaultEtherealRpcURL(),
      arbitrumRpcURL: getDefaultArbitrumRpcURL(),
      researchAgentSystemMessage:
        'You are an expert researcher assisting a prediction market participant via chat. You are friendly, smart, curious, succinct, and analytical. You proactively search the web for the most recent information relevant to the questions being discussed.',
      researchAgentModel: 'anthropic/claude-sonnet-4:online',
      researchAgentTemperature: 0.7,
      showAmericanOdds: false,
      connectionDurationHours: DEFAULT_CONNECTION_DURATION_HOURS,
      meshRateLimit: 100,
      meshMaxPeers: 25,
      meshFanout: 0,
    }),
    []
  );

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
    ? signalEndpointOverride || defaults.signalEndpoint
    : null;
  const chatBaseUrl = mounted ? chatBaseOverride || defaults.chatBaseUrl : null;
  const adminBaseUrl = mounted
    ? adminBaseOverride || defaults.adminBaseUrl
    : null;
  const etherealRpcURL = mounted
    ? etherealRpcOverride || defaults.etherealRpcURL
    : null;
  const arbitrumRpcURL = mounted
    ? arbitrumRpcOverride || defaults.arbitrumRpcURL
    : null;
  const openrouterApiKey = mounted ? openrouterApiKeyOverride || '' : null;
  const researchAgentSystemMessage = mounted
    ? researchAgentSystemMessageOverride || defaults.researchAgentSystemMessage
    : null;
  const researchAgentModel = mounted
    ? researchAgentModelOverride || defaults.researchAgentModel
    : null;
  const researchAgentTemperature = mounted
    ? (researchAgentTemperatureOverride ?? defaults.researchAgentTemperature)
    : null;
  const showAmericanOdds = mounted
    ? (showAmericanOddsOverride ?? defaults.showAmericanOdds)
    : null;
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
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEYS.signalEndpoint);
        setSignalEndpointOverride(null);
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
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEYS.chat);
        setChatBaseOverride(null);
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

  const setOpenrouterApiKey = useCallback((value: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEYS.openrouterApiKey);
        setOpenrouterApiKeyOverride(null);
        return;
      }
      const v = value.trim();
      if (!v) return;
      window.localStorage.setItem(STORAGE_KEYS.openrouterApiKey, v);
      setOpenrouterApiKeyOverride(v);
    } catch {
      /* noop */
    }
  }, []);

  const setResearchAgentSystemMessage = useCallback((value: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEYS.researchAgentSystemMessage);
        setResearchAgentSystemMessageOverride(null);
        return;
      }
      const v = value.trim();
      window.localStorage.setItem(STORAGE_KEYS.researchAgentSystemMessage, v);
      setResearchAgentSystemMessageOverride(v);
    } catch {
      /* noop */
    }
  }, []);

  const setResearchAgentModel = useCallback((value: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEYS.researchAgentModel);
        setResearchAgentModelOverride(null);
        return;
      }
      const v = value.trim();
      window.localStorage.setItem(STORAGE_KEYS.researchAgentModel, v);
      setResearchAgentModelOverride(v);
    } catch {
      /* noop */
    }
  }, []);

  const setResearchAgentTemperature = useCallback((value: number | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (value == null) {
        window.localStorage.removeItem(STORAGE_KEYS.researchAgentTemperature);
        setResearchAgentTemperatureOverride(null);
        return;
      }
      const clamped = Math.max(0, Math.min(2, Number(value)));
      if (!Number.isFinite(clamped)) return;
      window.localStorage.setItem(
        STORAGE_KEYS.researchAgentTemperature,
        String(clamped)
      );
      setResearchAgentTemperatureOverride(clamped);
    } catch {
      /* noop */
    }
  }, []);

  const setShowAmericanOdds = useCallback((value: boolean | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (value == null) {
        window.localStorage.removeItem(STORAGE_KEYS.showAmericanOdds);
        setShowAmericanOddsOverride(null);
        return;
      }
      const v = Boolean(value);
      window.localStorage.setItem(STORAGE_KEYS.showAmericanOdds, v ? '1' : '0');
      setShowAmericanOddsOverride(v);
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
    openrouterApiKey,
    researchAgentSystemMessage,
    researchAgentModel,
    researchAgentTemperature,
    showAmericanOdds,
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
    setOpenrouterApiKey,
    setResearchAgentSystemMessage,
    setResearchAgentModel,
    setResearchAgentTemperature,
    setShowAmericanOdds,
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
