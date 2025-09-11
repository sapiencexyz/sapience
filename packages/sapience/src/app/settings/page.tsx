'use client';

import {
  ToggleGroup,
  ToggleGroupItem,
} from '@sapience/ui/components/ui/toggle-group';
import { Label } from '@sapience/ui/components/ui/label';
import { Input } from '@sapience/ui/components/ui/input';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor, Key } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import { usePrivy, useWallets } from '@privy-io/react-auth';
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
}: SettingFieldProps) => {
  const [draft, setDraft] = useState<string>(value);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    if (!draft) {
      onPersist(null);
      setValue('');
      return;
    }
    const normalized = normalizeOnChange ? normalizeOnChange(draft) : draft;
    setDraft(normalized);
    setValue(normalized);
    if (validate(normalized)) {
      setErrorMsg(null);
      onPersist(normalized);
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

const SettingsPage = () => {
  const { theme, setTheme } = useTheme();
  const { openChat } = useChat();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const {
    graphqlEndpoint,
    apiBaseUrl,
    quoterBaseUrl,
    chatBaseUrl,
    adminBaseUrl,
    arbitrumRpcUrl,
    setGraphqlEndpoint,
    setApiBaseUrl,
    setQuoterBaseUrl,
    setChatBaseUrl,
    setAdminBaseUrl,
    setArbitrumRpcUrl,
    defaults,
  } = useSettings();
  const [mounted, setMounted] = useState(false);
  const [gqlInput, setGqlInput] = useState('');
  const [apiInput, setApiInput] = useState('');
  const [quoterInput, setQuoterInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [adminInput, setAdminInput] = useState('');
  const [rpcInput, setRpcInput] = useState('');
  const { ready, authenticated, exportWallet } = usePrivy();
  const { wallets } = useWallets();
  const activeWallet = (
    wallets && wallets.length > 0 ? (wallets[0] as any) : undefined
  ) as (typeof wallets extends Array<infer T> ? T : any) | undefined;
  const isActiveEmbeddedWallet = Boolean(
    (activeWallet as any)?.walletClientType === 'privy'
  );

  // Validation hints handled within SettingField to avoid parent re-renders breaking focus
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMounted(true);
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
    setAdminInput(adminBaseUrl ?? defaults.adminBaseUrl);
    setRpcInput(arbitrumRpcUrl ?? defaults.arbitrumRpcUrl);
    setHydrated(true);
    // Intentionally initialize once after mount to avoid overwriting while typing
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

  // Live update: values persist on change when valid; reset removes override.

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
        <h1 className="text-3xl md:text-5xl font-heading font-normal mb-6 md:mb-12">
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
          <Card className="bg-background">
            <CardContent className="px-6 py-8">
              <div className="space-y-8">
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
                        <ToggleGroupItem value="light" aria-label="Light mode">
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
                        <ToggleGroupItem value="dark" aria-label="Dark mode">
                          <Moon className="h-4 w-4" />
                          <span>Dark</span>
                        </ToggleGroupItem>
                      </ToggleGroup>
                    )}
                  </div>
                </div>

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
                    Used to fetch metadata, historical data, and onchain data
                    via GraphQL
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
                    Used to generate quotes based on liquidity available onchain
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="admin-endpoint">Admin Endpoint</Label>
                  <SettingField
                    id="admin-endpoint"
                    value={adminInput}
                    setValue={setAdminInput}
                    defaultValue={defaults.adminBaseUrl}
                    onPersist={setAdminBaseUrl}
                    validate={isHttpUrl}
                    normalizeOnChange={normalizeBase}
                    invalidMessage="Must be an absolute http(s) base URL"
                  />
                  <p className="text-xs text-muted-foreground">
                    Base URL for admin-only REST endpoints
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
                        disabled={!(ready && authenticated)}
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
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
