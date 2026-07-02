/**
 * Tests for detectAndSetCustomChain's fallback behavior.
 *
 * When the RPC can't be reached (or returns a bogus chain ID), a caller that
 * supplies a known `fallbackChainId` (the Settings presets) should still get the
 * custom-chain override applied instead of an error — otherwise applying a
 * preset whose RPC is temporarily unreachable silently does nothing.
 */

import { render, screen, act, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, test, expect, vi } from 'vitest';

import { SettingsProvider, useSettings } from './SettingsContext';

const CUSTOM_CHAIN_ID_KEY = 'sapience.settings.customChainId';
const CUSTOM_RPC_URL_KEY = 'sapience.settings.customRpcURL';

// Controls whether the mocked RPC client succeeds or throws per test.
const getChainId = vi.fn();

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: () => ({ getChainId }),
    http: () => ({}),
  };
});

// jsdom here ships no working localStorage; install a minimal in-memory shim.
beforeAll(() => {
  if (
    typeof window !== 'undefined' &&
    typeof window.localStorage?.clear !== 'function'
  ) {
    const store = new Map<string, string>();
    const shim: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
    };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: shim,
    });
  }
});

beforeEach(() => {
  window.localStorage.clear();
  // Pre-seed the one-time Robinhood-preset flag so mounting the provider
  // doesn't apply the preset and reload (the post-migration state every
  // returning user is in).
  window.localStorage.setItem(
    'sapience.settings.robinhoodDefaultsMigrated',
    '1'
  );
  getChainId.mockReset();
});

let detect:
  | ((
      rpcUrl: string,
      fallbackChainId?: number
    ) => Promise<{ chainId: number } | { error: string }>)
  | null = null;

function Probe() {
  const { customChainId, customRpcURL, detectAndSetCustomChain } =
    useSettings();
  detect = detectAndSetCustomChain;
  return (
    <div>
      <span data-testid="chainId">{customChainId ?? ''}</span>
      <span data-testid="rpc">{customRpcURL ?? ''}</span>
    </div>
  );
}

describe('detectAndSetCustomChain fallback', () => {
  test('falls back to the known chain ID when the RPC is unreachable', async () => {
    getChainId.mockRejectedValue(new Error('network down'));
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    let result: { chainId: number } | { error: string } | undefined;
    await act(async () => {
      result = await detect!('https://rpc.chain.robinhood.com', 4663);
    });

    expect(result).toEqual({ chainId: 4663 });
    expect(window.localStorage.getItem(CUSTOM_CHAIN_ID_KEY)).toBe('4663');
    expect(window.localStorage.getItem(CUSTOM_RPC_URL_KEY)).toBe(
      'https://rpc.chain.robinhood.com'
    );
    await waitFor(() => {
      expect(screen.getByTestId('chainId').textContent).toBe('4663');
    });
  });

  test('errors when the RPC is unreachable and no fallback is given', async () => {
    getChainId.mockRejectedValue(new Error('network down'));
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    let result: { chainId: number } | { error: string } | undefined;
    await act(async () => {
      result = await detect!('https://rpc.chain.robinhood.com');
    });

    expect(result).toEqual({ error: 'Could not reach RPC or read chain ID' });
    expect(window.localStorage.getItem(CUSTOM_CHAIN_ID_KEY)).toBeNull();
  });

  test('prefers the live chain ID over the fallback when the RPC responds', async () => {
    getChainId.mockResolvedValue(4663);
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    let result: { chainId: number } | { error: string } | undefined;
    await act(async () => {
      // Pass a different fallback to prove the live value wins.
      result = await detect!('https://rpc.chain.robinhood.com', 999);
    });

    expect(result).toEqual({ chainId: 4663 });
    expect(window.localStorage.getItem(CUSTOM_CHAIN_ID_KEY)).toBe('4663');
  });
});
