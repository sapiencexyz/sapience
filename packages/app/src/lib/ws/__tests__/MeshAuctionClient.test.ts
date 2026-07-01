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

  it('does NOT derive the signal URL from NEXT_PUBLIC_FOIL_API_URL', async () => {
    // The mesh must not turn itself on just because an API base is configured;
    // an incognito session on the Robinhood default network keeps it off.
    process.env.NEXT_PUBLIC_FOIL_API_URL = 'https://api.sapience.xyz';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('');
  });

  it('returns empty (mesh disabled) when nothing is configured', async () => {
    const getSignalUrl = await loadGetSignalUrl();
    // Default network is Robinhood Mainnet, which ships with the mesh disabled.
    expect(getSignalUrl()).toBe('');
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

  it('returns empty string (mesh disabled) when signal endpoint is explicitly blank', async () => {
    store[SIGNAL_KEY] = '';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('');
  });

  it('explicit blank signal disable wins over NEXT_PUBLIC_SIGNAL_URL env', async () => {
    process.env.NEXT_PUBLIC_SIGNAL_URL = 'wss://env-signal.example.com';
    store[SIGNAL_KEY] = '';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('');
  });

  it('does not disable when signal key is absent (falls through to the network default)', async () => {
    // An absent key must not trigger the explicit-disable branch. With a relayer
    // base configured it derives a signal URL; with nothing configured it falls
    // through to the network default (Robinhood → mesh off → '').
    process.env.NEXT_PUBLIC_FOIL_RELAYER_URL = 'https://relayer.sapience.xyz';
    const getSignalUrl = await loadGetSignalUrl();
    expect(getSignalUrl()).toBe('wss://relayer.sapience.xyz/signal');
  });
});
