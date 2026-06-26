'use client';

import { Label } from '@sapience/ui/components/ui/label';
import { Input } from '@sapience/ui/components/ui/input';

import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import {
  DEFAULT_CHAIN_ID,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import { useChat } from '~/lib/context/ChatContext';
import {
  useSettings,
  DEFAULT_CONNECTION_DURATION_HOURS,
} from '~/lib/context/SettingsContext';
import {
  setMeshRateLimit as applyMeshRateLimit,
  setMeshMaxPeers as applyMeshMaxPeers,
  setMeshFanout as applyMeshFanout,
} from '~/lib/ws/MeshAuctionClient';
import Loader from '~/components/shared/Loader';

const MERIDIAN_TESTNET_SETTINGS = {
  customRpcURL: 'https://rpc.testnet.chain.robinhood.com',
  graphqlEndpoint: 'https://api.predict.meridiantest.net/graphql',
  relayerEndpoint: 'https://relayer.predict.meridiantest.net/auction',
  signalEndpoint: 'https://relayer.predict.meridiantest.net/signal',
  chatBaseUrl: 'https://api.predict.meridiantest.net/chat',
} as const;

type SettingFieldProps = {
  id: string;
  value: string;
  setValue: (v: string) => void;
  defaultValue: string;
  onPersist: (v: string | null) => void;
  validate: (v: string) => boolean;
  normalizeOnChange?: (v: string) => string;
  invalidMessage: string;
  type?: 'text' | 'password';
  placeholder?: string;
  clearOnEmpty?: boolean;
  maskAfterPersist?: boolean;
  disabled?: boolean;
  showResetButton?: boolean;
  forceShowResetButton?: boolean;
};

const SettingField = ({
  id,
  value,
  setValue,
  defaultValue,
  onPersist,
  validate,
  normalizeOnChange,
  invalidMessage,
  type = 'text',
  placeholder,
  clearOnEmpty = true,
  maskAfterPersist = false,
  disabled = false,
  showResetButton = true,
  forceShowResetButton = false,
}: SettingFieldProps) => {
  const [draft, setDraft] = useState<string>(value);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Sync external value when not actively focused to avoid breaking edits
  useEffect(() => {
    if (!isFocused) {
      setDraft(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === draft) return;
    setDraft(raw);
    if (!raw) {
      setErrorMsg(null);
      return;
    }
    if (validate(raw)) {
      setErrorMsg(null);
    } else {
      setErrorMsg(invalidMessage);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (!draft) {
      if (clearOnEmpty) {
        onPersist(null);
        setValue('');
      }
      return;
    }
    const normalized = normalizeOnChange ? normalizeOnChange(draft) : draft;
    setDraft(normalized);
    setValue(normalized);
    if (validate(normalized)) {
      setErrorMsg(null);
      onPersist(normalized);
      if (maskAfterPersist) {
        // Clear visible value after persisting so secret remains hidden
        setDraft('');
        setValue('');
      }
    } else {
      setErrorMsg(invalidMessage);
    }
  };

  const showReset =
    showResetButton && (draft !== defaultValue || forceShowResetButton);

  return (
    <div className="w-full">
      <div className="flex gap-3 items-start">
        <div className="flex-1">
          <Input
            id={id}
            value={draft}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={() => setIsFocused(true)}
            type={type}
            placeholder={placeholder}
            disabled={disabled}
          />
        </div>
        {showReset ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-10"
            onClick={() => {
              setDraft(defaultValue);
              setValue(defaultValue);
              setErrorMsg(null);
              onPersist(null);
            }}
          >
            Reset
          </Button>
        ) : null}
      </div>
      {errorMsg ? (
        <p className="mt-2 text-xs text-red-500">{errorMsg}</p>
      ) : null}
    </div>
  );
};

const SettingsPageContent = () => {
  const { openChat } = useChat();
  const {
    graphqlEndpointV2,
    apiBaseUrl,
    signalEndpoint,
    chatBaseUrl,
    etherealRpcURL,
    arbitrumRpcURL,
    customChainId,
    customRpcURL,
    connectionDurationHours,
    meshRateLimit,
    meshMaxPeers,
    meshFanout,
    setGraphqlEndpoint,
    setGraphqlEndpointV2,
    setApiBaseUrl,
    setSignalEndpoint,
    setChatBaseUrl,
    setEtherealRpcUrl,
    setArbitrumRpcUrl,
    detectAndSetCustomChain,
    clearCustomChain,
    setConnectionDurationHours,
    setMeshRateLimit,
    setMeshMaxPeers,
    setMeshFanout,
    defaults,
  } = useSettings();
  const [mounted, setMounted] = useState(false);
  const [gqlInput, setGqlInput] = useState('');
  const [apiInput, setApiInput] = useState('');
  const [signalInput, setSignalInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [etherealRpcInput, setEtherealRpcInput] = useState('');
  const [arbitrumRpcInput, setArbitrumRpcInput] = useState('');
  const [, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [connectionDurationInput, setConnectionDurationInput] =
    useState<string>(String(DEFAULT_CONNECTION_DURATION_HOURS));
  const [meshRateLimitInput, setMeshRateLimitInput] = useState<number>(100);
  const [meshMaxPeersInput, setMeshMaxPeersInput] = useState<number>(25);
  const [meshFanoutInput, setMeshFanoutInput] = useState<number>(0);

  // Validation hints handled within SettingField to avoid parent re-renders breaking focus
  const [hydrated, setHydrated] = useState(false);
  const lastPresetKeyRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setGqlInput(graphqlEndpointV2 || defaults.graphqlEndpointV2);
    setApiInput(apiBaseUrl ?? defaults.apiBaseUrl);
    setSignalInput(signalEndpoint ?? defaults.signalEndpoint);
    setChatInput(chatBaseUrl ?? defaults.chatBaseUrl);
    setEtherealRpcInput(etherealRpcURL ?? defaults.etherealRpcURL);
    setArbitrumRpcInput(arbitrumRpcURL ?? defaults.arbitrumRpcURL);
    setConnectionDurationInput(
      String(connectionDurationHours ?? defaults.connectionDurationHours)
    );
    setMeshRateLimitInput(meshRateLimit ?? defaults.meshRateLimit);
    setMeshMaxPeersInput(meshMaxPeers ?? defaults.meshMaxPeers);
    setMeshFanoutInput(meshFanout ?? defaults.meshFanout);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const isHttpUrl = (value: string) => {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const normalizeBase = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  };

  const persistGraphqlEndpoint = (value: string | null) => {
    setGraphqlEndpoint(null);
    setGraphqlEndpointV2(value);
  };

  const persistPredictionMarketRpcEndpoint = (value: string | null) => {
    if (!value) {
      setEtherealRpcUrl(null);
      clearCustomChain();
      return;
    }

    const url = value.trim();
    if (!isHttpUrl(url)) {
      setDetectError('Must be an absolute http(s) URL');
      return;
    }
    if (url === (etherealRpcURL ?? defaults.etherealRpcURL)) {
      return;
    }
    setEtherealRpcUrl(url);
    setIsDetecting(true);
    setDetectError(null);
    void detectAndSetCustomChain(url)
      .then((result) => {
        if ('error' in result) {
          setDetectError(result.error);
        }
      })
      .finally(() => setIsDetecting(false));
  };

  const hasCustomPredictionMarketChain =
    customChainId != null || customRpcURL != null;
  const needsChainReload =
    customChainId != null &&
    customRpcURL === etherealRpcInput.trim() &&
    DEFAULT_CHAIN_ID !== customChainId;

  const applyMeridianTestnetSettings = useCallback(async () => {
    setIsDetecting(true);
    setDetectError(null);
    const result = await detectAndSetCustomChain(
      MERIDIAN_TESTNET_SETTINGS.customRpcURL
    );
    setIsDetecting(false);
    if ('error' in result) {
      setDetectError(result.error);
      return;
    }

    setGraphqlEndpoint(null);
    setGraphqlEndpointV2(MERIDIAN_TESTNET_SETTINGS.graphqlEndpoint);
    setApiBaseUrl(MERIDIAN_TESTNET_SETTINGS.relayerEndpoint);
    setSignalEndpoint(MERIDIAN_TESTNET_SETTINGS.signalEndpoint);
    setChatBaseUrl(MERIDIAN_TESTNET_SETTINGS.chatBaseUrl);
    setEtherealRpcUrl(MERIDIAN_TESTNET_SETTINGS.customRpcURL);

    setEtherealRpcInput(MERIDIAN_TESTNET_SETTINGS.customRpcURL);
    setGqlInput(MERIDIAN_TESTNET_SETTINGS.graphqlEndpoint);
    setApiInput(MERIDIAN_TESTNET_SETTINGS.relayerEndpoint);
    setSignalInput(MERIDIAN_TESTNET_SETTINGS.signalEndpoint);
    setChatInput(MERIDIAN_TESTNET_SETTINGS.chatBaseUrl);

    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, [
    detectAndSetCustomChain,
    setApiBaseUrl,
    setChatBaseUrl,
    setGraphqlEndpoint,
    setGraphqlEndpointV2,
    setEtherealRpcUrl,
    setSignalEndpoint,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const now = Date.now();
      if (key === 'r') {
        lastPresetKeyRef.current = { key, at: now };
        return;
      }
      if (
        key === 'h' &&
        lastPresetKeyRef.current?.key === 'r' &&
        now - lastPresetKeyRef.current.at < 1500
      ) {
        lastPresetKeyRef.current = null;
        void applyMeridianTestnetSettings();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyMeridianTestnetSettings]);

  return (
    <div className="relative min-h-screen">
      {/* Main Content */}
      <div className="container max-w-[750px] mx-auto px-4 pt-10 md:pt-14 lg:pt-16 pb-12 relative z-10">
        <h1 className="text-3xl md:text-5xl font-sans font-normal mb-6 text-foreground">
          Settings
        </h1>

        {!hydrated ? (
          <div className="h-[720px] flex items-center justify-center">
            <Loader className="w-5 h-5" />
          </div>
        ) : (
          <Card className="bg-background">
            <CardContent className="p-8">
              <div className="space-y-6">
                <div className="grid gap-2">
                  <Label htmlFor="prediction-market-rpc-endpoint">
                    Prediction Market RPC Endpoint
                  </Label>
                  <SettingField
                    id="prediction-market-rpc-endpoint"
                    value={etherealRpcInput}
                    setValue={setEtherealRpcInput}
                    defaultValue={defaults.etherealRpcURL}
                    onPersist={persistPredictionMarketRpcEndpoint}
                    validate={isHttpUrl}
                    normalizeOnChange={(s) => s.trim()}
                    invalidMessage="Must be an absolute http(s) URL"
                    forceShowResetButton={hasCustomPredictionMarketChain}
                  />
                  {detectError ? (
                    <p className="text-xs text-red-500">{detectError}</p>
                  ) : null}
                  {needsChainReload ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-9"
                        onClick={() => {
                          if (typeof window !== 'undefined')
                            window.location.reload();
                        }}
                      >
                        Apply &amp; Reload
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="arbitrum-rpc-endpoint">
                    {DEFAULT_CHAIN_ID === CHAIN_ID_ETHEREAL_TESTNET
                      ? 'Arbitrum Sepolia'
                      : 'Arbitrum'}{' '}
                    RPC Endpoint
                  </Label>
                  <SettingField
                    id="arbitrum-rpc-endpoint"
                    value={arbitrumRpcInput}
                    setValue={setArbitrumRpcInput}
                    defaultValue={defaults.arbitrumRpcURL}
                    onPersist={setArbitrumRpcUrl}
                    validate={isHttpUrl}
                    normalizeOnChange={(s) => s.trim()}
                    invalidMessage="Must be an absolute http(s) URL"
                  />
                  <p className="text-xs text-muted-foreground">
                    JSON-RPC URL for{' '}
                    <a
                      href={
                        DEFAULT_CHAIN_ID === CHAIN_ID_ETHEREAL_TESTNET
                          ? 'https://chainlist.org/chain/421614'
                          : 'https://chainlist.org/chain/42161'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                    >
                      {DEFAULT_CHAIN_ID === CHAIN_ID_ETHEREAL_TESTNET
                        ? 'Arbitrum Sepolia'
                        : 'Arbitrum'}
                    </a>{' '}
                    (forecasting)
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="graphql-endpoint">GraphQL Endpoint</Label>
                  <SettingField
                    id="graphql-endpoint"
                    value={gqlInput}
                    setValue={setGqlInput}
                    defaultValue={defaults.graphqlEndpointV2}
                    onPersist={persistGraphqlEndpoint}
                    validate={isHttpUrl}
                    invalidMessage="Must be an absolute http(s) URL"
                  />
                  <p className="text-xs text-muted-foreground">
                    Full GraphQL endpoint used by the app. Include the path
                    required by the selected backend.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="chat-endpoint">Chat Endpoint</Label>
                  <SettingField
                    id="chat-endpoint"
                    value={chatInput}
                    setValue={setChatInput}
                    defaultValue={defaults.chatBaseUrl}
                    onPersist={setChatBaseUrl}
                    validate={isHttpUrl}
                    normalizeOnChange={normalizeBase}
                    invalidMessage="Must be an absolute http(s) base URL"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used by the{' '}
                    <button
                      type="button"
                      onClick={openChat}
                      className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                    >
                      chat widget
                    </button>{' '}
                    to send and receive signed messages
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="relayer-endpoint">Relayer Endpoint</Label>
                  <SettingField
                    id="relayer-endpoint"
                    value={apiInput}
                    setValue={setApiInput}
                    defaultValue={defaults.apiBaseUrl}
                    onPersist={setApiBaseUrl}
                    validate={isHttpUrl}
                    normalizeOnChange={normalizeBase}
                    invalidMessage="Must be an absolute http(s) base URL"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used to relay bids for positions
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="signal-endpoint">Signal Endpoint</Label>
                  <SettingField
                    id="signal-endpoint"
                    value={signalInput}
                    setValue={setSignalInput}
                    defaultValue={defaults.signalEndpoint}
                    onPersist={setSignalEndpoint}
                    validate={isHttpUrl}
                    normalizeOnChange={normalizeBase}
                    invalidMessage="Must be an absolute http(s) base URL"
                  />
                  <p className="text-xs text-muted-foreground">
                    WebRTC signaling server for mesh peer discovery
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="mesh-rate-limit">Mesh Rate Limit</Label>
                    <div className="relative">
                      <Input
                        id="mesh-rate-limit"
                        type="number"
                        min={0}
                        className="pr-14"
                        value={meshRateLimitInput}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (Number.isFinite(v)) setMeshRateLimitInput(v);
                        }}
                        onBlur={() => {
                          const v = Math.max(0, meshRateLimitInput);
                          setMeshRateLimitInput(v);
                          setMeshRateLimit(v);
                          applyMeshRateLimit(v);
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                        msg/s
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Max inbound messages per peer per second
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="mesh-max-peers">Max Peers</Label>
                    <div>
                      <Input
                        id="mesh-max-peers"
                        type="number"
                        min={0}
                        value={meshMaxPeersInput}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (Number.isFinite(v)) setMeshMaxPeersInput(v);
                        }}
                        onBlur={() => {
                          const v = Math.max(0, meshMaxPeersInput);
                          setMeshMaxPeersInput(v);
                          setMeshMaxPeers(v);
                          applyMeshMaxPeers(v);
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Max WebRTC data channel connections
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="mesh-fanout">Fanout</Label>
                    <div>
                      <Input
                        id="mesh-fanout"
                        type="number"
                        min={0}
                        value={meshFanoutInput}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (Number.isFinite(v)) setMeshFanoutInput(v);
                        }}
                        onBlur={() => {
                          const v = Math.max(0, meshFanoutInput);
                          setMeshFanoutInput(v);
                          setMeshFanout(v);
                          applyMeshFanout(v);
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Peers to forward messages to (0 = all connected peers)
                    </p>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="connection-duration">
                    Connection Duration
                  </Label>
                  <div className="relative w-32">
                    <Input
                      id="connection-duration"
                      type="number"
                      min={1}
                      className="pr-14"
                      value={connectionDurationInput}
                      onChange={(e) => {
                        setConnectionDurationInput(e.target.value);
                      }}
                      onBlur={() => {
                        const parsed = parseInt(connectionDurationInput, 10);
                        if (Number.isFinite(parsed) && parsed >= 1) {
                          setConnectionDurationHours(parsed);
                        } else {
                          setConnectionDurationInput(
                            String(defaults.connectionDurationHours)
                          );
                          setConnectionDurationHours(null);
                        }
                      }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                      hours
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default SettingsPageContent;
