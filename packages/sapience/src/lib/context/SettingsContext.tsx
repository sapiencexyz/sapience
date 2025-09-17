'use client';

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
  apiBaseUrl: string | null;
  quoterBaseUrl: string | null;
  chatBaseUrl: string | null;
  adminBaseUrl: string | null;
  arbitrumRpcUrl: string | null;
  // Research Agent settings
  openrouterApiKey: string | null;
  researchAgentSystemMessage: string | null;
  researchAgentModel: string | null;
  researchAgentTemperature: number | null;
  setGraphqlEndpoint: (value: string | null) => void;
  setApiBaseUrl: (value: string | null) => void;
  setQuoterBaseUrl: (value: string | null) => void;
  setChatBaseUrl: (value: string | null) => void;
  setAdminBaseUrl: (value: string | null) => void;
  setArbitrumRpcUrl: (value: string | null) => void;
  setOpenrouterApiKey: (value: string | null) => void;
  setResearchAgentSystemMessage: (value: string | null) => void;
  setResearchAgentModel: (value: string | null) => void;
  setResearchAgentTemperature: (value: number | null) => void;
  defaults: {
    graphqlEndpoint: string;
    apiBaseUrl: string;
    quoterBaseUrl: string;
    chatBaseUrl: string;
    adminBaseUrl: string;
    arbitrumRpcUrl: string;
    researchAgentSystemMessage: string;
    researchAgentModel: string;
    researchAgentTemperature: number;
  };
};

const STORAGE_KEYS = {
  graphql: 'sapience.settings.graphqlEndpoint',
  api: 'sapience.settings.apiBaseUrl',
  quoter: 'sapience.settings.quoterBaseUrl',
  chat: 'sapience.settings.chatBaseUrl',
  admin: 'sapience.settings.adminBaseUrl',
  arbitrum: 'sapience.settings.arbitrumRpcUrl',
  openrouterApiKey: 'sapience.settings.openrouterApiKey',
  researchAgentSystemMessage: 'sapience.settings.researchAgentSystemMessage',
  researchAgentModel: 'sapience.settings.researchAgentModel',
  researchAgentTemperature: 'sapience.settings.researchAgentTemperature',
} as const;

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

function getDefaultApiBase(): string {
  const root =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(root);
    return `${u.origin}/auction`;
  } catch {
    return 'https://api.sapience.xyz/auction';
  }
}

function getDefaultQuoterBase(): string {
  const root =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(root);
    return `${u.origin}/quoter`;
  } catch {
    return 'https://api.sapience.xyz/quoter';
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

function getDefaultArbitrumRpcUrl(): string {
  const infuraKey = process.env.NEXT_PUBLIC_INFURA_API_KEY;
  return infuraKey
    ? `https://arbitrum-mainnet.infura.io/v3/${infuraKey}`
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
  const [quoterBaseOverride, setQuoterBaseOverride] = useState<string | null>(
    null
  );
  const [chatBaseOverride, setChatBaseOverride] = useState<string | null>(null);
  const [adminBaseOverride, setAdminBaseOverride] = useState<string | null>(
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
      const q =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.quoter)
          : null;
      const c =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.chat)
          : null;
      const admin =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.admin)
          : null;
      const r =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(STORAGE_KEYS.arbitrum)
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
      if (g && isHttpUrl(g)) setGraphqlOverride(g);
      if (a && isHttpUrl(a))
        setApiBaseOverride(normalizeBaseUrlPreservePath(a));
      if (q && isHttpUrl(q))
        setQuoterBaseOverride(normalizeBaseUrlPreservePath(q));
      if (c && isHttpUrl(c))
        setChatBaseOverride(normalizeBaseUrlPreservePath(c));
      if (admin && isHttpUrl(admin))
        setAdminBaseOverride(normalizeBaseUrlPreservePath(admin));
      if (r && isHttpUrl(r)) setArbitrumRpcOverride(r);
      if (ork) setOpenrouterApiKeyOverride(ork);
      if (rsm) setResearchAgentSystemMessageOverride(rsm);
      if (rmodel) setResearchAgentModelOverride(rmodel);
      if (rtemp) {
        const parsed = parseFloat(rtemp);
        if (Number.isFinite(parsed))
          setResearchAgentTemperatureOverride(parsed);
      }
    } catch {
      /* noop */
    }
  }, []);

  const defaults = useMemo(
    () => ({
      graphqlEndpoint: getDefaultGraphqlEndpoint(),
      apiBaseUrl: getDefaultApiBase(),
      quoterBaseUrl: getDefaultQuoterBase(),
      chatBaseUrl: getDefaultChatBase(),
      adminBaseUrl: getDefaultAdminBase(),
      arbitrumRpcUrl: getDefaultArbitrumRpcUrl(),
      researchAgentSystemMessage:
        'You are an expert researcher assisting a prediction market participant via chat. You are friendly, smart, curious, succinct, and analytical. You proactively search the web for the most recent information relevant to the questions being discussed.',
      researchAgentModel: 'anthropic/claude-sonnet-4:online',
      researchAgentTemperature: 0.7,
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
  const quoterBaseUrl = mounted
    ? quoterBaseOverride || defaults.quoterBaseUrl
    : null;
  const chatBaseUrl = mounted ? chatBaseOverride || defaults.chatBaseUrl : null;
  const adminBaseUrl = mounted
    ? adminBaseOverride || defaults.adminBaseUrl
    : null;
  const arbitrumRpcUrl = mounted
    ? arbitrumRpcOverride || defaults.arbitrumRpcUrl
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

  const setQuoterBaseUrl = useCallback((value: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEYS.quoter);
        setQuoterBaseOverride(null);
        return;
      }
      const v = normalizeBaseUrlPreservePath(value);
      if (!isHttpUrl(v)) return;
      window.localStorage.setItem(STORAGE_KEYS.quoter, v);
      setQuoterBaseOverride(v);
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

  const setArbitrumRpcUrl = useCallback((value: string | null) => {
    try {
      if (typeof window === 'undefined') return;
      if (!value) {
        window.localStorage.removeItem(STORAGE_KEYS.arbitrum);
        setArbitrumRpcOverride(null);
        return;
      }
      const v = value.trim();
      if (!isHttpUrl(v)) return;
      window.localStorage.setItem(STORAGE_KEYS.arbitrum, v);
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

  const value: SettingsContextValue = {
    graphqlEndpoint,
    apiBaseUrl,
    quoterBaseUrl,
    chatBaseUrl,
    adminBaseUrl,
    arbitrumRpcUrl,
    openrouterApiKey,
    researchAgentSystemMessage,
    researchAgentModel,
    researchAgentTemperature,
    setGraphqlEndpoint,
    setApiBaseUrl,
    setQuoterBaseUrl,
    setChatBaseUrl,
    setAdminBaseUrl,
    setArbitrumRpcUrl,
    setOpenrouterApiKey,
    setResearchAgentSystemMessage,
    setResearchAgentModel,
    setResearchAgentTemperature,
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

// Expose small helpers for non-React modules to read overrides on client
export const settingsStorage = {
  keys: STORAGE_KEYS,
  read(key: keyof typeof STORAGE_KEYS): string | null {
    try {
      if (typeof window === 'undefined') return null;
      const k = STORAGE_KEYS[key];
      const v = window.localStorage.getItem(k);
      return v || null;
    } catch {
      return null;
    }
  },
  getApiBaseUrl(): string | null {
    const v = this.read('api');
    return v ? normalizeBaseUrlPreservePath(v) : null;
  },
  getQuoterBaseUrl(): string | null {
    const v = this.read('quoter');
    return v ? normalizeBaseUrlPreservePath(v) : null;
  },
  getChatBaseUrl(): string | null {
    const v = this.read('chat');
    return v ? normalizeBaseUrlPreservePath(v) : null;
  },
  getAdminBaseUrl(): string | null {
    const v = this.read('admin');
    return v ? normalizeBaseUrlPreservePath(v) : null;
  },
  getGraphqlEndpoint(): string | null {
    const v = this.read('graphql');
    return v || null;
  },
  getArbitrumRpcUrl(): string | null {
    const v = this.read('arbitrum');
    return v || null;
  },
};
