'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';

import { Card, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { DEFAULT_CHAIN_ID } from '~/lib/sdk/constants';
import type { EndpointPreset } from '~/lib/config/endpointPresets';
import { ENDPOINT_PRESETS } from '~/lib/config/endpointPresets';
import { useSettings } from '~/lib/context/SettingsContext';
import Loader from '~/components/shared/Loader';

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
  const {
    graphqlEndpoint,
    apiBaseUrl,
    etherealRpcURL,
    customChainId,
    customRpcURL,
    setGraphqlEndpoint,
    setApiBaseUrl,
    setEtherealRpcUrl,
    detectAndSetCustomChain,
    clearCustomChain,
    defaults,
  } = useSettings();
  const [mounted, setMounted] = useState(false);
  const [gqlInput, setGqlInput] = useState('');
  const [apiInput, setApiInput] = useState('');
  const [etherealRpcInput, setEtherealRpcInput] = useState('');
  const [, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  // Validation hints handled within SettingField to avoid parent re-renders breaking focus
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setGqlInput(graphqlEndpoint || defaults.graphqlEndpoint);
    setApiInput(apiBaseUrl ?? defaults.apiBaseUrl);
    setEtherealRpcInput(etherealRpcURL ?? defaults.etherealRpcURL);
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
      setEtherealRpcUrl(preset.customRpcURL);

      setEtherealRpcInput(preset.customRpcURL);
      setGqlInput(preset.graphqlEndpoint);
      setApiInput(preset.relayerEndpoint);

      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    },
    [
      detectAndSetCustomChain,
      setApiBaseUrl,
      setGraphqlEndpoint,
      setEtherealRpcUrl,
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
        apiBaseUrl === preset.relayerEndpoint
    );
    return match?.label ?? null;
  }, [customChainId, etherealRpcURL, graphqlEndpoint, apiBaseUrl]);

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
          <Card className="bg-[hsl(var(--primary)/_0.05)] border border-brand-white/10">
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
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default SettingsPageContent;
