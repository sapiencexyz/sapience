'use client';

import {
  ToggleGroup,
  ToggleGroupItem,
} from '@sapience/ui/components/ui/toggle-group';
import { Label } from '@sapience/ui/components/ui/label';
import { Input } from '@sapience/ui/components/ui/input';
import Slider from '@sapience/ui/components/ui/slider';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@sapience/ui/components/ui/command';
import { Textarea } from '@sapience/ui/components/ui/textarea';
import { Switch } from '@sapience/ui/components/ui/switch';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@sapience/ui/components/ui/tabs';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor, Key, Share2, Bot } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import { useChat } from '~/lib/context/ChatContext';
import { useSettings } from '~/lib/context/SettingsContext';
import LottieLoader from '~/components/shared/LottieLoader';

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

  const showReset = draft !== defaultValue;

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
  const { theme, setTheme } = useTheme();
  const { openChat } = useChat();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const {
    graphqlEndpoint,
    apiBaseUrl,
    quoterBaseUrl,
    chatBaseUrl,
    arbitrumRpcUrl,
    openrouterApiKey,
    researchAgentSystemMessage,
    researchAgentModel,
    researchAgentTemperature,
    showAmericanOdds,
    setGraphqlEndpoint,
    setApiBaseUrl,
    setQuoterBaseUrl,
    setChatBaseUrl,
    setArbitrumRpcUrl,
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
  const [quoterInput, setQuoterInput] = useState('');
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

  // Force light mode rendering for the iframe (match Vaults page)
  useEffect(() => {
    const handleIframeLoad = () => {
      const iframe = iframeRef.current;
      if (typeof document === 'undefined') return;
      if (iframe && iframe.contentDocument) {
        try {
          const style = iframe.contentDocument.createElement('style');
          style.textContent =
            'html { color-scheme: light !important; } * { filter: none !important; }';
          iframe.contentDocument.head.appendChild(style);
        } catch (e) {
          console.error('Could not inject styles into iframe:', e);
        }
      }
    };

    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', handleIframeLoad);
      return () => iframe.removeEventListener('load', handleIframeLoad);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setGqlInput(graphqlEndpoint || defaults.graphqlEndpoint);
    setApiInput(apiBaseUrl ?? defaults.apiBaseUrl);
    setQuoterInput(quoterBaseUrl ?? defaults.quoterBaseUrl);
    setChatInput(chatBaseUrl ?? defaults.chatBaseUrl);
    setRpcInput(arbitrumRpcUrl ?? defaults.arbitrumRpcUrl);
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
      {/* Spline Background - Full Width (match Vaults) */}
      <div className="absolute inset-0 pointer-events-none top-0 left-0 w-full h-100dvh -scale-y-100 -translate-y-1/4 opacity-50 dark:opacity-75">
        <iframe
          ref={iframeRef}
          src="https://my.spline.design/particlesfutarchy-SDhuN0OYiCRHRPt2fFec4bCm/"
          className="w-full h-full"
          style={{
            opacity: 0.5,
            border: 'none',
            colorScheme: 'light',
            filter: 'none',
          }}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
        />
        <div className="absolute top-0 left-0 h-full w-[100px] bg-gradient-to-r from-background to-transparent hidden md:block" />
      </div>

      {/* Main Content (match Vaults spacing) */}
      <div className="container max-w-[750px] mx-auto px-4 pt-32 pb-12 relative z-10">
        <h1 className="text-3xl md:text-5xl font-heading font-normal mb-4 md:mb-8">
          Settings
        </h1>

        {!hydrated ? (
          <Card>
            <CardContent className="px-6 py-8">
              <div className="h-[720px] flex items-center justify-center">
                <LottieLoader width={48} height={48} />
              </div>
            </CardContent>
          </Card>
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
            <div className="flex flex-col md:flex-row justify-between w-full items-center md:items-center mb-5 flex-shrink-0 gap-3">
              <TabsList className="order-2 md:order-1 grid w-full md:w-auto grid-cols-1 md:grid-cols-none md:grid-flow-col md:auto-cols-auto h-auto gap-2">
                <TabsTrigger
                  className="w-full md:w-auto justify-center md:justify-start"
                  value="network"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Share2 className="w-4 h-4" />
                    Network
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  className="w-full md:w-auto justify-center md:justify-start"
                  value="agent"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Bot className="w-4 h-4" />
                    Agent
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  className="w-full md:w-auto justify-center md:justify-start"
                  value="appearance"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Monitor className="w-4 h-4" />
                    Appearance
                  </span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="network">
              <Card className="bg-background">
                <CardContent className="p-8">
                  <div className="space-y-6">
                    <div className="grid gap-2">
                      <Label htmlFor="ethereum-rpc-endpoint">
                        Ethereum RPC Endpoint
                      </Label>
                      <SettingField
                        id="ethereum-rpc-endpoint"
                        value={rpcInput}
                        setValue={setRpcInput}
                        defaultValue={defaults.arbitrumRpcUrl}
                        onPersist={setArbitrumRpcUrl}
                        validate={isHttpUrl}
                        normalizeOnChange={(s) => s.trim()}
                        invalidMessage="Must be an absolute http(s) URL"
                      />
                      <p className="text-xs text-muted-foreground">
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
                      <Label htmlFor="quoter-endpoint">Quoter Endpoint</Label>
                      <SettingField
                        id="quoter-endpoint"
                        value={quoterInput}
                        setValue={setQuoterInput}
                        defaultValue={defaults.quoterBaseUrl}
                        onPersist={setQuoterBaseUrl}
                        validate={isHttpUrl}
                        normalizeOnChange={normalizeBase}
                        invalidMessage="Must be an absolute http(s) base URL"
                      />
                      <p className="text-xs text-muted-foreground">
                        Used to generate quotes based on liquidity available
                        onchain
                      </p>
                    </div>

                    {/* Admin Endpoint intentionally managed only via Admin page dialog */}

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
                        Used to relay bids for parlays
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
                    <div className="grid gap-2">
                      <Label htmlFor="theme">Theme</Label>
                      <div id="theme" className="flex flex-col gap-1">
                        {mounted && (
                          <ToggleGroup
                            type="single"
                            value={theme ?? 'system'}
                            onValueChange={(val) => {
                              if (!val) return;
                              setTheme(val);
                            }}
                            variant="outline"
                            size="sm"
                            className="w-full md:w-auto bg-background py-1 rounded-lg justify-start gap-2 md:gap-3"
                          >
                            <ToggleGroupItem
                              value="light"
                              aria-label="Light mode"
                            >
                              <Sun className="h-4 w-4" />
                              <span>Light</span>
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="system"
                              aria-label="System mode"
                            >
                              <Monitor className="h-4 w-4" />
                              <span>System</span>
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="dark"
                              aria-label="Dark mode"
                            >
                              <Moon className="h-4 w-4" />
                              <span>Dark</span>
                            </ToggleGroupItem>
                          </ToggleGroup>
                        )}
                      </div>
                    </div>

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
