'use client';

import { Label } from '@sapience/ui/components/ui/label';
import { Input } from '@sapience/ui/components/ui/input';

import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import {
  DEFAULT_CHAIN_ID,
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  CHAIN_ID_ROBINHOOD_TESTNET,
  CHAIN_ID_ROBINHOOD_MAINNET,
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

// Endpoint presets applied via the buttons next to the Settings heading. Each
// preset switches the chain and populates every endpoint field for a known
// environment. The Robinhood/Meridian presets leave the signal and chat
// endpoints blank, which disables the mesh and chat bubble; the Ethereal
// (Sapience) presets keep them pointed at the matching Sapience backend.
type EndpointPreset = {
  // Display label shown on the preset button.
  label: string;
  // Static chain ID for the preset. Used as the fallback when the RPC can't be
  // reached at apply time, so the preset still switches chains and populates the
  // settings fields instead of erroring out.
  chainId: number;
  customRpcURL: string;
  graphqlEndpoint: string;
  relayerEndpoint: string;
  // Blank disables the mesh; blank chat hides the chat bubble.
  signalEndpoint: string;
  chatBaseUrl: string;
};

const ETHEREAL_MAINNET_SETTINGS: EndpointPreset = {
  label: 'Ethereal Mainnet',
  chainId: CHAIN_ID_ETHEREAL,
  customRpcURL: 'https://rpc.ethereal.trade',
  graphqlEndpoint: 'https://api.sapience.xyz/v2/graphql',
  relayerEndpoint: 'https://relayer.sapience.xyz/auction',
  signalEndpoint: 'https://relayer.sapience.xyz/signal',
  chatBaseUrl: 'https://api.sapience.xyz/chat',
} as const;

const ROBINHOOD_MAINNET_SETTINGS: EndpointPreset = {
  label: 'Robinhood Mainnet',
  chainId: CHAIN_ID_ROBINHOOD_MAINNET,
  customRpcURL: 'https://rpc.mainnet.chain.robinhood.com',
  graphqlEndpoint: 'https://api.predict.meridian.xyz/graphql',
  relayerEndpoint: 'https://relayer.predict.meridian.xyz/auction',
  signalEndpoint: '',
  chatBaseUrl: '',
} as const;

const ETHEREAL_TESTNET_SETTINGS: EndpointPreset = {
  label: 'Ethereal Testnet',
  chainId: CHAIN_ID_ETHEREAL_TESTNET,
  customRpcURL: 'https://rpc.etherealtest.net',
  graphqlEndpoint: 'https://api.staging.sapience.xyz/v2/graphql',
  relayerEndpoint: 'https://relayer.staging.sapience.xyz/auction',
  signalEndpoint: 'https://relayer.staging.sapience.xyz/signal',
  chatBaseUrl: 'https://api.staging.sapience.xyz/chat',
} as const;

const ROBINHOOD_TESTNET_SETTINGS: EndpointPreset = {
  label: 'Robinhood Testnet',
  chainId: CHAIN_ID_ROBINHOOD_TESTNET,
  customRpcURL: 'https://rpc.testnet.chain.robinhood.com',
  graphqlEndpoint: 'https://api.predict.meridiantest.net/graphql',
  relayerEndpoint: 'https://relayer.predict.meridiantest.net/auction',
  signalEndpoint: '',
  chatBaseUrl: '',
} as const;

// Order shown next to the Settings heading. Robinhood is the default
// environment, so its presets lead; Ethereal follows.
const ENDPOINT_PRESETS: EndpointPreset[] = [
  ROBINHOOD_MAINNET_SETTINGS,
  ETHEREAL_MAINNET_SETTINGS,
  ROBINHOOD_TESTNET_SETTINGS,
  ETHEREAL_TESTNET_SETTINGS,
];

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
  // What to persist when the field is cleared. Defaults to `null`, which
  // removes the override and resets to the default value. Set to `''` to keep
  // an explicit blank value (e.g. the signal endpoint, where blank disables the
  // mesh) so the field is not repopulated with the default on blur.
  emptyPersistValue?: string | null;
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
  emptyPersistValue = null,
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
        onPersist(emptyPersistValue);
        setValue(emptyPersistValue ?? '');
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
    graphqlEndpoint,
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setGqlInput(graphqlEndpoint || defaults.graphqlEndpoint);
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
    setGraphqlEndpoint(value);
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

  const applyEndpointPreset = useCallback(
    async (preset: EndpointPreset) => {
      setIsDetecting(true);
      setDetectError(null);
      // Pass the preset's static chain ID as a fallback so an unreachable RPC
      // still applies the override and populates the fields below, rather than
      // bailing out (which left the mainnet preset doing nothing when its RPC
      // was temporarily unreachable).
      const result = await detectAndSetCustomChain(
        preset.customRpcURL,
        preset.chainId
      );
      setIsDetecting(false);
      if ('error' in result) {
        setDetectError(result.error);
        return;
      }

      setGraphqlEndpoint(preset.graphqlEndpoint);
      setApiBaseUrl(preset.relayerEndpoint);
      // A blank signal endpoint disables the mesh; a blank chat endpoint hides
      // the chat bubble. The Robinhood/Meridian presets blank both; the Ethereal
      // presets point them at the matching Sapience backend.
      setSignalEndpoint(preset.signalEndpoint);
      setChatBaseUrl(preset.chatBaseUrl);
      setEtherealRpcUrl(preset.customRpcURL);

      setEtherealRpcInput(preset.customRpcURL);
      setGqlInput(preset.graphqlEndpoint);
      setApiInput(preset.relayerEndpoint);
      setSignalInput(preset.signalEndpoint);
      setChatInput(preset.chatBaseUrl);

      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    },
    [
      detectAndSetCustomChain,
      setApiBaseUrl,
      setChatBaseUrl,
      setGraphqlEndpoint,
      setEtherealRpcUrl,
      setSignalEndpoint,
    ]
  );

  // Highlight the preset whose endpoints all match the current settings.
  const activePresetLabel = useMemo(() => {
    const effectiveChainId = customChainId ?? DEFAULT_CHAIN_ID;
    const match = ENDPOINT_PRESETS.find(
      (preset) =>
        effectiveChainId === preset.chainId &&
        etherealRpcURL === preset.customRpcURL &&
        graphqlEndpoint === preset.graphqlEndpoint &&
        apiBaseUrl === preset.relayerEndpoint &&
        signalEndpoint === preset.signalEndpoint &&
        chatBaseUrl === preset.chatBaseUrl
    );
    return match?.label ?? null;
  }, [
    customChainId,
    etherealRpcURL,
    graphqlEndpoint,
    apiBaseUrl,
    signalEndpoint,
    chatBaseUrl,
  ]);

  return (
    <div className="relative min-h-screen">
      {/* Main Content */}
      <div className="container max-w-[750px] mx-auto px-4 pt-10 md:pt-14 lg:pt-16 pb-12 relative z-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl md:text-5xl font-sans font-normal text-foreground">
            Settings
          </h1>
          <div className="flex flex-wrap gap-2">
            {ENDPOINT_PRESETS.map((preset) => {
              const isActive = preset.label === activePresetLabel;
              return (
                <Button
                  key={preset.label}
                  variant={isActive ? 'default' : 'outline'}
                  size="xs"
                  aria-pressed={isActive}
                  onClick={() => void applyEndpointPreset(preset)}
                >
                  {preset.label}
                </Button>
              );
            })}
          </div>
        </div>

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
                    defaultValue={defaults.graphqlEndpoint}
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
                    emptyPersistValue=""
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
                    to send and receive signed messages. Leave blank to disable
                    chat and hide the chat bubble.
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
                    emptyPersistValue=""
                    invalidMessage="Must be an absolute http(s) base URL"
                  />
                  <p className="text-xs text-muted-foreground">
                    WebRTC signaling server for mesh peer discovery. Leave blank
                    to disable the mesh and route orders exclusively through the
                    relayer.
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
