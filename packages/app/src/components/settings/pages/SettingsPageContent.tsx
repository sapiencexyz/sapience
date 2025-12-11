'use client';

import { Label } from '@sapience/sdk/ui/components/ui/label';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import Slider from '@sapience/sdk/ui/components/ui/slider';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@sapience/sdk/ui/components/ui/command';
import { Textarea } from '@sapience/sdk/ui/components/ui/textarea';
import { Switch } from '@sapience/sdk/ui/components/ui/switch';
import {
  Tabs,
  TabsTrigger,
  TabsContent,
} from '@sapience/sdk/ui/components/ui/tabs';
import { Card, CardContent } from '@sapience/sdk/ui/components/ui/card';
import { Monitor, Key, Share2, Bot } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import { useChat } from '~/lib/context/ChatContext';
import { useSettings } from '~/lib/context/SettingsContext';
import Loader from '~/components/shared/Loader';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';

const CHAIN_ID_ARBITRUM = '42161';
const CHAIN_ID_ETHEREAL = '5064014';
const CHAIN_ID_STORAGE_KEY = 'sapience.settings.selectedChainId';
const RPC_STORAGE_KEY = 'sapience.settings.selectedRpcURL';

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

  const showReset = showResetButton && draft !== defaultValue;

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
    chatBaseUrl,
    rpcURL,
    openrouterApiKey,
    researchAgentSystemMessage,
    researchAgentModel,
    researchAgentTemperature,
    showAmericanOdds,
    setGraphqlEndpoint,
    setApiBaseUrl,
    setChatBaseUrl,
    setRpcUrl,
    setOpenrouterApiKey,
    setResearchAgentSystemMessage,
    setResearchAgentModel,
    setResearchAgentTemperature,
    setShowAmericanOdds,
    defaults,
  } = useSettings();
  const [mounted, setMounted] = useState(false);
  const [gqlInput, setGqlInput] = useState('');
  const [apiInput, setApiInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [rpcInput, setRpcInput] = useState('');
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState('');
  const [systemMessageInput, setSystemMessageInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [temperatureInput, setTemperatureInput] = useState<number>(0.7);
  const [isModelFocused, setIsModelFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'network' | 'appearance' | 'agent'
  >('network');
  const [selectedChain, setSelectedChain] = useState<
    'arbitrum' | 'ethereal' | null
  >(null);
  const { ready, exportWallet } = usePrivy();
  const { wallets } = useWallets();
  const activeWallet = (
    wallets && wallets.length > 0 ? (wallets[0] as any) : undefined
  ) as (typeof wallets extends Array<infer T> ? T : any) | undefined;
  const isActiveEmbeddedWallet = Boolean(
    (activeWallet as any)?.walletClientType === 'privy'
  );
  const { hasConnectedWallet } = useConnectedWallet();

  // Validation hints handled within SettingField to avoid parent re-renders breaking focus
  const [hydrated, setHydrated] = useState(false);

  // Initialize selectedChain from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const chainIdLocalStorage =
      window.localStorage.getItem(CHAIN_ID_STORAGE_KEY);

    if (chainIdLocalStorage === CHAIN_ID_ETHEREAL) {
      setSelectedChain('ethereal');
    } else if (chainIdLocalStorage === CHAIN_ID_ARBITRUM) {
      setSelectedChain('arbitrum');
    } else {
      // Default to Ethereal when there is no stored value or an unknown value
      setSelectedChain('ethereal');
    }
    setRpcInput(
      window.localStorage.getItem(RPC_STORAGE_KEY) || defaults.rpcURL
    );
  }, []);

  // Update RPC input, selected chain ID, and persisted RPC override when the selection changes
  useEffect(() => {
    const ETHEREAL_RPC = 'https://rpc.ethereal.trade';
    if (typeof window === 'undefined' || !selectedChain) return;

    const nextChainId =
      selectedChain === 'ethereal' ? CHAIN_ID_ETHEREAL : CHAIN_ID_ARBITRUM;
    const nextRpcUrl =
      selectedChain === 'ethereal' ? ETHEREAL_RPC : defaults.rpcURL;

    try {
      setRpcInput(nextRpcUrl);
      setRpcUrl(nextRpcUrl);
      window.localStorage.setItem(CHAIN_ID_STORAGE_KEY, nextChainId);
    } catch {
      // no-op
    }
  }, [selectedChain, defaults.rpcURL, setRpcUrl]);

  // override from SettingsContext if exists for first render after mount
  useEffect(() => {
    if (!mounted) return;
    if (typeof window === 'undefined') return;
    setRpcInput(rpcURL || '');
    window.localStorage.setItem(RPC_STORAGE_KEY, rpcURL || '');
  }, [rpcURL, mounted]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync active tab with URL hash (#network | #appearance | #agent)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromHash = () => {
      const hash = window.location.hash;
      if (hash === '#agent') {
        setActiveTab('agent');
      } else if (hash === '#appearance') {
        setActiveTab('appearance');
      } else {
        // Support legacy '#configuration' by mapping to 'network'
        setActiveTab('network');
      }
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setGqlInput(graphqlEndpoint || defaults.graphqlEndpoint);
    setApiInput(apiBaseUrl ?? defaults.apiBaseUrl);
    setChatInput(chatBaseUrl ?? defaults.chatBaseUrl);
    // If a key exists, show masked dots and disable input
    setOpenrouterKeyInput(
      openrouterApiKey
        ? '••-••-••-••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'
        : ''
    );
    setSystemMessageInput(researchAgentSystemMessage ?? '');
    setModelInput(researchAgentModel ?? defaults.researchAgentModel);
    setTemperatureInput(
      researchAgentTemperature ?? defaults.researchAgentTemperature
    );
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Keep the displayed OpenRouter key masked when a key exists
  useEffect(() => {
    if (!hydrated) return;
    setOpenrouterKeyInput(
      openrouterApiKey
        ? '••-••-••-••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'
        : ''
    );
  }, [openrouterApiKey, hydrated]);

  const suggestedModels = [
    'anthropic/claude-sonnet-4:online',
    'anthropic/claude-opus-4.1:online',
    'openai/gpt-5:online',
    'perplexity/sonar:online',
    'perplexity/sonar-deep-research:online',
    'perplexity/sonar-pro:online',
  ];
  const trimmedModelInput = (modelInput || '').toLowerCase().trim();
  const displayModelSuggestions =
    trimmedModelInput.length === 0
      ? suggestedModels
      : suggestedModels.filter((m) =>
          m.toLowerCase().includes(trimmedModelInput)
        );
  const isModelSuggestOpen =
    isModelFocused &&
    displayModelSuggestions.length > 0 &&
    (trimmedModelInput.length === 0 || trimmedModelInput.length >= 2);

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

  return (
    <div className="relative min-h-screen">
      {/* Main Content */}
      <div className="container max-w-[750px] mx-auto px-4 pt-10 md:pt-14 lg:pt-16 pb-12 relative z-10">
        <h1 className="text-3xl md:text-5xl font-sans font-normal mb-6 text-foreground">
          Settings
        </h1>

        {!hydrated ? (
          <div className="h-[720px] flex items-center justify-center">
            <Loader size={20} />
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(val) => {
              setActiveTab(val as 'network' | 'appearance' | 'agent');
              try {
                if (typeof window === 'undefined') return;
                const url = new URL(window.location.href);
                if (val === 'agent') {
                  url.hash = '#agent';
                } else if (val === 'appearance') {
                  url.hash = '#appearance';
                } else {
                  url.hash = '#network';
                }
                window.history.replaceState({}, '', url.toString());
              } catch {
                /* noop */
              }
            }}
            className="w-full"
          >
            <div className="mb-3">
              <SegmentedTabsList>
                <TabsTrigger value="network">
                  <span className="inline-flex items-center gap-1.5">
                    <Share2 className="w-4 h-4" />
                    Network
                  </span>
                </TabsTrigger>
                <TabsTrigger value="agent">
                  <span className="inline-flex items-center gap-1.5">
                    <Bot className="w-4 h-4" />
                    Agent
                  </span>
                </TabsTrigger>
                <TabsTrigger value="appearance">
                  <span className="inline-flex items-center gap-1.5">
                    <Monitor className="w-4 h-4" />
                    Appearance
                  </span>
                </TabsTrigger>
              </SegmentedTabsList>
            </div>

            <TabsContent value="network">
              <Card className="bg-background">
                <CardContent className="p-8">
                  <div className="space-y-6">
                    <div className="grid gap-2">
                      <Label htmlFor="chain-selector">Chain</Label>
                      <div id="chain-selector">
                        <Tabs
                          value={selectedChain ?? 'ethereal'}
                          onValueChange={(v) => {
                            const next = v as 'arbitrum' | 'ethereal';
                            setSelectedChain(next);
                          }}
                        >
                          <SegmentedTabsList>
                            <TabsTrigger value="ethereal">Ethereal</TabsTrigger>
                            <TabsTrigger value="arbitrum">Arbitrum</TabsTrigger>
                          </SegmentedTabsList>
                        </Tabs>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="network-rpc-endpoint">
                        Network RPC Endpoint
                      </Label>
                      <SettingField
                        id="network-rpc-endpoint"
                        value={rpcInput}
                        setValue={setRpcInput}
                        defaultValue={defaults.rpcURL}
                        onPersist={setRpcUrl}
                        validate={isHttpUrl}
                        normalizeOnChange={(s) => s.trim()}
                        invalidMessage="Must be an absolute http(s) URL"
                        showResetButton={false}
                      />
                      <p className="text-xs text-muted-foreground">
                        {selectedChain === 'arbitrum' ? (
                          <>
                            JSON-RPC URL for the{' '}
                            <a
                              href="https://chainlist.org/chain/42161"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                            >
                              Arbitrum
                            </a>{' '}
                            network
                          </>
                        ) : (
                          <>JSON-RPC URL for the Ethereal network</>
                        )}
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="graphql-endpoint">GraphQL Endpoint</Label>
                      <SettingField
                        id="graphql-endpoint"
                        value={gqlInput}
                        setValue={setGqlInput}
                        defaultValue={defaults.graphqlEndpoint}
                        onPersist={setGraphqlEndpoint}
                        validate={isHttpUrl}
                        invalidMessage="Must be an absolute http(s) URL"
                      />
                      <p className="text-xs text-muted-foreground">
                        Used to fetch metadata, historical data, and onchain
                        data via GraphQL
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

                    {ready && isActiveEmbeddedWallet ? (
                      <div className="grid gap-2">
                        <Label htmlFor="export-wallet">Back Up Account</Label>
                        <div id="export-wallet">
                          <Button
                            onClick={exportWallet}
                            disabled={
                              !(
                                ready &&
                                isActiveEmbeddedWallet &&
                                hasConnectedWallet
                              )
                            }
                            size="sm"
                          >
                            <Key className="h-4 w-4" />
                            Export Private Key
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appearance">
              <Card className="bg-background">
                <CardContent className="p-8">
                  <div className="space-y-6">
                    <div className="grid gap-1">
                      <Label htmlFor="show-american-odds">
                        Show American Odds
                      </Label>
                      <div
                        id="show-american-odds"
                        className="flex items-center h-10"
                      >
                        <Switch
                          checked={Boolean(
                            showAmericanOdds ?? defaults.showAmericanOdds
                          )}
                          onCheckedChange={(val) => setShowAmericanOdds(val)}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="agent">
              <Card className="bg-background">
                <CardContent className="px-6 py-8">
                  <div className="space-y-6">
                    <div className="grid gap-2">
                      <Label htmlFor="research-openrouter-key">
                        OpenRouter API Key
                      </Label>
                      <SettingField
                        id="research-openrouter-key"
                        value={openrouterKeyInput}
                        setValue={setOpenrouterKeyInput}
                        defaultValue={''}
                        onPersist={setOpenrouterApiKey}
                        validate={(v) => v.trim().length > 0}
                        normalizeOnChange={(s) => s.trim()}
                        invalidMessage="API key cannot be empty"
                        type="password"
                        clearOnEmpty={false}
                        disabled={Boolean(openrouterApiKey)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Use{' '}
                        <a
                          href="https://openrouter.ai"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                        >
                          OpenRouter
                        </a>{' '}
                        for flexible LLM credits via traditional and crypto
                        payments. It is{' '}
                        <span className="font-medium">
                          strongly recommended
                        </span>{' '}
                        to add a credit limit to this key, as it's stored in
                        your browser.
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="research-model">Model</Label>
                      <div className="relative">
                        <Input
                          id="research-model"
                          type="text"
                          className="text-left"
                          value={modelInput}
                          onChange={(e) => {
                            setModelInput(e.target.value);
                          }}
                          onFocus={() => setIsModelFocused(true)}
                          onBlur={() => {
                            // Delay closing to allow click on suggestion
                            setTimeout(() => setIsModelFocused(false), 120);
                            setResearchAgentModel(modelInput || null);
                          }}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                        />
                        {isModelSuggestOpen ? (
                          <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-md p-0">
                            <Command shouldFilter={false}>
                              <CommandList>
                                {displayModelSuggestions.length === 0 ? (
                                  <CommandEmpty>No suggestions</CommandEmpty>
                                ) : (
                                  <CommandGroup heading="Suggestions">
                                    {displayModelSuggestions.map((m) => (
                                      <CommandItem
                                        key={m}
                                        value={m}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onSelect={() => {
                                          setModelInput(m);
                                          setResearchAgentModel(m);
                                          setIsModelFocused(false);
                                        }}
                                      >
                                        {m}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                              </CommandList>
                            </Command>
                          </div>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Choose{' '}
                        <a
                          href="https://openrouter.ai/models"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                        >
                          a model id
                        </a>{' '}
                        available via OpenRouter.
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="research-system-message">
                        System Message
                      </Label>
                      <Textarea
                        id="research-system-message"
                        value={systemMessageInput}
                        onChange={(e) => setSystemMessageInput(e.target.value)}
                        onBlur={() =>
                          setResearchAgentSystemMessage(
                            systemMessageInput || null
                          )
                        }
                        rows={4}
                      />
                      <p className="text-xs text-muted-foreground">
                        Write instructions for your agent. This is automatically
                        included before every chat with information about the
                        market you're viewing.
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="research-temperature">Temperature</Label>
                      <div className="mt-1 space-y-2.5">
                        <Slider
                          value={[temperatureInput]}
                          onValueChange={(vals) => {
                            const v = Array.isArray(vals) ? vals[0] : 0.7;
                            setTemperatureInput(v);
                          }}
                          onValueCommit={(vals) => {
                            const v = Array.isArray(vals) ? vals[0] : 0.7;
                            setResearchAgentTemperature(v);
                          }}
                          min={0}
                          max={2}
                          step={0.01}
                          className="w-full"
                          id="research-temperature"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Lower is focused. Higher is creative.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default SettingsPageContent;
