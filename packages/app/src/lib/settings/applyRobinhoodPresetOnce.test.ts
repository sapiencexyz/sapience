import { describe, test, expect } from 'vitest';

import {
  applyRobinhoodPresetOnce,
  ROBINHOOD_DEFAULTS_MIGRATION_KEY,
} from './applyRobinhoodPresetOnce';
import { ROBINHOOD_MAINNET_SETTINGS } from '~/lib/config/endpointPresets';

const KEYS = {
  graphql: 'sapience.settings.graphqlEndpoint',
  legacyGraphqlV2: 'sapience.settings.graphqlEndpointV2',
  api: 'sapience.settings.apiBaseUrl',
  signal: 'sapience.settings.signalEndpoint',
  chat: 'sapience.settings.chatBaseUrl',
  etherealRpc: 'sapience.settings.etherealRpcURL',
  customChainId: 'sapience.settings.customChainId',
  customRpcURL: 'sapience.settings.customRpcURL',
} as const;

// What the Robinhood Mainnet Settings button persists (this suite runs with
// no NEXT_PUBLIC_DEFAULT_CHAIN_ID, i.e. a non-staging build).
const EXPECTED_WRITES: Record<string, string> = {
  [KEYS.customChainId]: String(ROBINHOOD_MAINNET_SETTINGS.chainId),
  [KEYS.customRpcURL]: ROBINHOOD_MAINNET_SETTINGS.customRpcURL,
  [KEYS.graphql]: ROBINHOOD_MAINNET_SETTINGS.graphqlEndpoint,
  [KEYS.api]: ROBINHOOD_MAINNET_SETTINGS.relayerEndpoint,
  [KEYS.signal]: ROBINHOOD_MAINNET_SETTINGS.signalEndpoint,
  [KEYS.chat]: ROBINHOOD_MAINNET_SETTINGS.chatBaseUrl,
  [KEYS.etherealRpc]: ROBINHOOD_MAINNET_SETTINGS.customRpcURL,
};

function makeStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe('applyRobinhoodPresetOnce', () => {
  test('first visit: persists exactly what the Robinhood Mainnet button writes', () => {
    const storage = makeStorage();
    const result = applyRobinhoodPresetOnce(storage);
    expect(result).toEqual({ applied: true });
    for (const [key, value] of Object.entries(EXPECTED_WRITES)) {
      expect(storage.getItem(key)).toBe(value);
    }
    expect(storage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)).toBe('1');
  });

  test('overwrites Ethereal-era values and removes the legacy graphql key', () => {
    const storage = makeStorage({
      [KEYS.graphql]: 'https://api.sapience.xyz/v2/graphql',
      [KEYS.legacyGraphqlV2]: 'https://api.sapience.xyz/v2/graphql',
      [KEYS.api]: 'https://relayer.sapience.xyz/auction',
      [KEYS.customChainId]: '5064014',
      [KEYS.customRpcURL]: 'https://rpc.ethereal.trade',
    });
    const result = applyRobinhoodPresetOnce(storage);
    expect(result).toEqual({ applied: true });
    expect(storage.getItem(KEYS.legacyGraphqlV2)).toBeNull();
    for (const [key, value] of Object.entries(EXPECTED_WRITES)) {
      expect(storage.getItem(key)).toBe(value);
    }
  });

  test('leaves settings unrelated to the preset alone', () => {
    const unrelated: Record<string, string> = {
      'sapience.settings.adminBaseUrl': 'https://api.sapience.xyz/admin',
      'sapience.settings.arbitrumRpcURL': 'https://my-arbitrum.example',
      'sapience.settings.connectionDurationHours': '48',
      'sapience.settings.meshRateLimit': '10',
    };
    const storage = makeStorage(unrelated);
    applyRobinhoodPresetOnce(storage);
    for (const [key, value] of Object.entries(unrelated)) {
      expect(storage.getItem(key)).toBe(value);
    }
  });

  test('flag already set: a complete no-op, so later user changes stick', () => {
    const seeded: Record<string, string> = {
      [ROBINHOOD_DEFAULTS_MIGRATION_KEY]: '1',
      [KEYS.graphql]: 'https://api.sapience.xyz/v2/graphql',
      [KEYS.customChainId]: '5064014',
      [KEYS.customRpcURL]: 'https://rpc.ethereal.trade',
    };
    const storage = makeStorage(seeded);
    const result = applyRobinhoodPresetOnce(storage);
    expect(result).toEqual({ applied: false });
    for (const [key, value] of Object.entries(seeded)) {
      expect(storage.getItem(key)).toBe(value);
    }
  });

  test('does not write anything when the flag write throws (no reload loop)', () => {
    const storage = makeStorage({ [KEYS.graphql]: 'https://keep.example' });
    const throwing = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: storage.removeItem,
    };
    const result = applyRobinhoodPresetOnce(throwing);
    expect(result).toEqual({ applied: false });
    expect(storage.getItem(KEYS.graphql)).toBe('https://keep.example');
    expect(storage.store.size).toBe(1);
  });
});
