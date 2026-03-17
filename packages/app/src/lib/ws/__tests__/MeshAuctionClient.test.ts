import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const SIGNAL_KEY = 'sapience.settings.signalEndpoint';
const RELAYER_KEY = 'sapience.settings.apiBaseUrl';

let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
  // Clear env vars
  delete process.env.NEXT_PUBLIC_SIGNAL_URL;
  delete process.env.NEXT_PUBLIC_FOIL_RELAYER_URL;
  delete process.env.NEXT_PUBLIC_FOIL_API_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadGetSignalUrl() {
  const mod = await import('../signalUrl');
  return mod.getSignalUrl;
}

describe('getSignalUrl', () => {
  it('returns NEXT_PUBLIC_SIGNAL_URL when set', async () => {
    process.env.NEXT_PUBLIC_SIGNAL_URL = 'wss://custom-signal.example.com';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('wss://custom-signal.example.com');
  });

  it('reads from signal endpoint localStorage and converts https → wss', async () => {
    store[SIGNAL_KEY] = 'https://my-relay.example.com/signal';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('wss://my-relay.example.com/signal');
  });

  it('reads from signal endpoint localStorage and converts http → ws', async () => {
    store[SIGNAL_KEY] = 'http://localhost:3001/signal';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('ws://localhost:3001/signal');
  });

  it('preserves the path from the signal endpoint setting', async () => {
    store[SIGNAL_KEY] = 'https://my-relay.example.com/custom/path';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('wss://my-relay.example.com/custom/path');
  });

  it('falls back to relayer localStorage with /signal path', async () => {
    store[RELAYER_KEY] = 'https://my-relay.example.com/auction';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('wss://my-relay.example.com/signal');
  });

  it('falls back to NEXT_PUBLIC_FOIL_RELAYER_URL env with /signal path', async () => {
    process.env.NEXT_PUBLIC_FOIL_RELAYER_URL =
      'https://staging-relayer.example.com';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('wss://staging-relayer.example.com/signal');
  });

  it('falls back to NEXT_PUBLIC_FOIL_API_URL with hostname swap', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.sapience.xyz';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('wss://relayer.sapience.xyz/signal');
  });

  it('does not swap hostname for non-production API URLs', async () => {
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.staging.example.com';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('wss://api.staging.example.com/signal');
  });

  it('returns hardcoded default when nothing is configured', async () => {
    const getSignalUrl = await loadGetSignalUrl();
    // Default API URL is https://api.sapience.xyz → swapped to relayer.sapience.xyz
    expect(getSignalUrl()).toBe('wss://relayer.sapience.xyz/signal');
  });

  it('signal localStorage takes priority over relayer localStorage', async () => {
    store[SIGNAL_KEY] = 'https://signal-specific.example.com/signal';
    store[RELAYER_KEY] = 'https://relayer-base.example.com/auction';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('wss://signal-specific.example.com/signal');
  });

  it('env override takes priority over all localStorage', async () => {
    process.env.NEXT_PUBLIC_SIGNAL_URL = 'wss://env-signal.example.com';
    store[SIGNAL_KEY] = 'https://stored-signal.example.com/signal';
    store[RELAYER_KEY] = 'https://stored-relayer.example.com/auction';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('wss://env-signal.example.com');
  });
});
