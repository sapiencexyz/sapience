/**
 * Tests for the one-time Robinhood preset application wired into
 * SettingsContext's mount effect: the first visit persists exactly what the
 * Robinhood preset button writes and reloads once; the persisted flag makes
 * every later mount a no-op, so anything the user changes afterwards
 * (including switching back to Ethereal) sticks.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, test, expect, beforeEach, vi } from 'vitest';

import { SettingsProvider, useSettings } from './SettingsContext';
import { ROBINHOOD_DEFAULTS_MIGRATION_KEY } from '~/lib/settings/applyRobinhoodPresetOnce';
import { ROBINHOOD_MAINNET_SETTINGS } from '~/lib/config/endpointPresets';

const GRAPHQL_KEY = 'sapience.settings.graphqlEndpoint';
const API_KEY = 'sapience.settings.apiBaseUrl';
const CUSTOM_CHAIN_ID_KEY = 'sapience.settings.customChainId';
const CUSTOM_RPC_URL_KEY = 'sapience.settings.customRpcURL';

const ETHEREAL_GRAPHQL = 'https://api.sapience.xyz/v2/graphql';

const reloadMock = vi.fn();

// jsdom in this environment does not ship a working localStorage (it requires
// node's --localstorage-file flag), so install a minimal in-memory shim.
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
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: reloadMock },
  });
});

beforeEach(() => {
  window.localStorage.clear();
  reloadMock.mockClear();
});

function Probe() {
  const { graphqlEndpoint, apiBaseUrl } = useSettings();
  return (
    <div>
      <span data-testid="endpoint">{graphqlEndpoint ?? ''}</span>
      <span data-testid="api">{apiBaseUrl ?? ''}</span>
    </div>
  );
}

describe('SettingsContext one-time Robinhood preset', () => {
  test('first visit persists the Robinhood Mainnet preset and reloads once', async () => {
    window.localStorage.setItem(GRAPHQL_KEY, ETHEREAL_GRAPHQL);
    window.localStorage.setItem(CUSTOM_CHAIN_ID_KEY, '5064014');
    window.localStorage.setItem(
      CUSTOM_RPC_URL_KEY,
      'https://rpc.ethereal.trade'
    );

    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });
    expect(window.localStorage.getItem(GRAPHQL_KEY)).toBe(
      ROBINHOOD_MAINNET_SETTINGS.graphqlEndpoint
    );
    expect(window.localStorage.getItem(API_KEY)).toBe(
      ROBINHOOD_MAINNET_SETTINGS.relayerEndpoint
    );
    expect(window.localStorage.getItem(CUSTOM_CHAIN_ID_KEY)).toBe(
      String(ROBINHOOD_MAINNET_SETTINGS.chainId)
    );
    expect(window.localStorage.getItem(CUSTOM_RPC_URL_KEY)).toBe(
      ROBINHOOD_MAINNET_SETTINGS.customRpcURL
    );
    expect(window.localStorage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)).toBe(
      '1'
    );
  });

  test('a brand-new visitor also gets the preset applied, once', async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });
    expect(window.localStorage.getItem(GRAPHQL_KEY)).toBe(
      ROBINHOOD_MAINNET_SETTINGS.graphqlEndpoint
    );
    expect(window.localStorage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)).toBe(
      '1'
    );
  });

  test('with the flag set, later changes stick (user switched back to Ethereal)', async () => {
    window.localStorage.setItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY, '1');
    window.localStorage.setItem(GRAPHQL_KEY, ETHEREAL_GRAPHQL);

    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('endpoint').textContent).toBe(ETHEREAL_GRAPHQL);
    });
    expect(window.localStorage.getItem(GRAPHQL_KEY)).toBe(ETHEREAL_GRAPHQL);
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
