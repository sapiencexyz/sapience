/**
 * Tests for the one-time Ethereal → Robinhood defaults migration wired into
 * SettingsContext's mount effect: endpoint-only migrations hydrate straight to
 * the Robinhood defaults with no reload; clearing the custom-chain pair
 * triggers a single reload; and the persisted flag makes the migration a
 * no-op afterwards, so users who re-apply an Ethereal preset keep it.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, test, expect, beforeEach, vi } from 'vitest';

import { SettingsProvider, useSettings } from './SettingsContext';
import { ROBINHOOD_DEFAULTS_MIGRATION_KEY } from '~/lib/settings/migrateEtherealDefaults';

const GRAPHQL_KEY = 'sapience.settings.graphqlEndpoint';
const API_KEY = 'sapience.settings.apiBaseUrl';
const CUSTOM_CHAIN_ID_KEY = 'sapience.settings.customChainId';
const CUSTOM_RPC_URL_KEY = 'sapience.settings.customRpcURL';

const ETHEREAL_GRAPHQL = 'https://api.sapience.xyz/v2/graphql';
const ETHEREAL_RELAYER = 'https://relayer.sapience.xyz/auction';
const MERIDIAN_GRAPHQL = 'https://api.predict.meridian.xyz/graphql';

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

describe('SettingsContext Ethereal → Robinhood migration', () => {
  test('endpoint-only Ethereal overrides migrate to Robinhood defaults without a reload', async () => {
    window.localStorage.setItem(GRAPHQL_KEY, ETHEREAL_GRAPHQL);
    window.localStorage.setItem(API_KEY, ETHEREAL_RELAYER);

    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('endpoint').textContent).toBe(MERIDIAN_GRAPHQL);
    });
    expect(window.localStorage.getItem(GRAPHQL_KEY)).toBeNull();
    expect(window.localStorage.getItem(API_KEY)).toBeNull();
    expect(window.localStorage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)).toBe(
      '1'
    );
    expect(reloadMock).not.toHaveBeenCalled();
  });

  test('clearing the Ethereal custom-chain pair triggers a single reload', async () => {
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
    expect(window.localStorage.getItem(CUSTOM_CHAIN_ID_KEY)).toBeNull();
    expect(window.localStorage.getItem(CUSTOM_RPC_URL_KEY)).toBeNull();
    expect(window.localStorage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)).toBe(
      '1'
    );
  });

  test('with the flag set, Ethereal overrides survive the mount (user opted back in)', async () => {
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
