import { describe, test, expect } from 'vitest';

import {
  applyRobinhoodPresetOnce,
  pickRobinhoodPreset,
  ROBINHOOD_DEFAULTS_MIGRATION_KEY,
} from './applyRobinhoodPresetOnce';
import {
  ROBINHOOD_MAINNET_SETTINGS,
  ROBINHOOD_TESTNET_SETTINGS,
} from '~/lib/config/endpointPresets';
import { STORAGE_KEYS } from '~/lib/settings/storageKeys';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  CHAIN_ID_ROBINHOOD_MAINNET,
  CHAIN_ID_ROBINHOOD_TESTNET,
} from '@sapience/sdk/constants';

// What the Robinhood Mainnet Settings button persists (this suite runs with
// no NEXT_PUBLIC_DEFAULT_CHAIN_ID, i.e. a non-staging build).
const EXPECTED_WRITES: Record<string, string> = {
  [STORAGE_KEYS.customChainId]: String(ROBINHOOD_MAINNET_SETTINGS.chainId),
  [STORAGE_KEYS.customRpcURL]: ROBINHOOD_MAINNET_SETTINGS.customRpcURL,
  [STORAGE_KEYS.graphql]: ROBINHOOD_MAINNET_SETTINGS.graphqlEndpoint,
  [STORAGE_KEYS.api]: ROBINHOOD_MAINNET_SETTINGS.relayerEndpoint,
  [STORAGE_KEYS.signalEndpoint]: ROBINHOOD_MAINNET_SETTINGS.signalEndpoint,
  [STORAGE_KEYS.chat]: ROBINHOOD_MAINNET_SETTINGS.chatBaseUrl,
  [STORAGE_KEYS.etherealRpcURL]: ROBINHOOD_MAINNET_SETTINGS.customRpcURL,
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

/** Storage whose setItem starts throwing after `successfulWrites` writes. */
function makeFlakyStorage(
  seed: Record<string, string>,
  successfulWrites: number
) {
  const storage = makeStorage(seed);
  let writes = 0;
  return {
    store: storage.store,
    getItem: storage.getItem,
    setItem: (key: string, value: string) => {
      writes += 1;
      if (writes > successfulWrites) {
        throw new Error('quota exceeded');
      }
      storage.setItem(key, value);
    },
    removeItem: storage.removeItem,
  };
}

describe('pickRobinhoodPreset', () => {
  test('testnet env defaults (staging builds) get the Robinhood Testnet preset', () => {
    expect(pickRobinhoodPreset(CHAIN_ID_ROBINHOOD_TESTNET)).toBe(
      ROBINHOOD_TESTNET_SETTINGS
    );
    expect(pickRobinhoodPreset(CHAIN_ID_ETHEREAL_TESTNET)).toBe(
      ROBINHOOD_TESTNET_SETTINGS
    );
  });

  test('mainnet env defaults get the Robinhood Mainnet preset', () => {
    expect(pickRobinhoodPreset(CHAIN_ID_ROBINHOOD_MAINNET)).toBe(
      ROBINHOOD_MAINNET_SETTINGS
    );
    expect(pickRobinhoodPreset(CHAIN_ID_ETHEREAL)).toBe(
      ROBINHOOD_MAINNET_SETTINGS
    );
  });
});

describe('applyRobinhoodPresetOnce', () => {
  test('session with Ethereal-era overrides: persists exactly what the Robinhood Mainnet button writes', () => {
    const storage = makeStorage({
      [STORAGE_KEYS.graphql]: 'https://api.sapience.xyz/v2/graphql',
    });
    const result = applyRobinhoodPresetOnce(storage);
    expect(result).toEqual({ applied: true });
    for (const [key, value] of Object.entries(EXPECTED_WRITES)) {
      expect(storage.getItem(key)).toBe(value);
    }
    expect(storage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)).toBe('1');
  });

  test('overwrites Ethereal-era values and removes the legacy graphql key', () => {
    const storage = makeStorage({
      [STORAGE_KEYS.graphql]: 'https://api.sapience.xyz/v2/graphql',
      [STORAGE_KEYS.legacyGraphqlV2]: 'https://api.sapience.xyz/v2/graphql',
      [STORAGE_KEYS.api]: 'https://relayer.sapience.xyz/auction',
      [STORAGE_KEYS.customChainId]: '5064014',
      [STORAGE_KEYS.customRpcURL]: 'https://rpc.ethereal.trade',
    });
    const result = applyRobinhoodPresetOnce(storage);
    expect(result).toEqual({ applied: true });
    expect(storage.getItem(STORAGE_KEYS.legacyGraphqlV2)).toBeNull();
    for (const [key, value] of Object.entries(EXPECTED_WRITES)) {
      expect(storage.getItem(key)).toBe(value);
    }
  });

  test('fresh storage: sets the flag only — defaults already serve Robinhood, so no writes and no reload', () => {
    const storage = makeStorage();
    const result = applyRobinhoodPresetOnce(storage);
    expect(result).toEqual({ applied: false });
    expect(storage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)).toBe('1');
    expect(storage.store.size).toBe(1); // nothing pinned as an override
  });

  test('storage with only non-preset settings counts as fresh', () => {
    const unrelated: Record<string, string> = {
      [STORAGE_KEYS.admin]: 'https://api.sapience.xyz/admin',
      [STORAGE_KEYS.arbitrumRpcURL]: 'https://my-arbitrum.example',
      [STORAGE_KEYS.connectionDurationHours]: '48',
      [STORAGE_KEYS.meshRateLimit]: '10',
    };
    const storage = makeStorage(unrelated);
    const result = applyRobinhoodPresetOnce(storage);
    expect(result).toEqual({ applied: false });
    expect(storage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)).toBe('1');
    for (const [key, value] of Object.entries(unrelated)) {
      expect(storage.getItem(key)).toBe(value);
    }
  });

  test('leaves settings unrelated to the preset alone when applying', () => {
    const unrelated: Record<string, string> = {
      [STORAGE_KEYS.admin]: 'https://api.sapience.xyz/admin',
      [STORAGE_KEYS.arbitrumRpcURL]: 'https://my-arbitrum.example',
      [STORAGE_KEYS.connectionDurationHours]: '48',
      [STORAGE_KEYS.meshRateLimit]: '10',
    };
    const storage = makeStorage({
      ...unrelated,
      [STORAGE_KEYS.graphql]: 'https://api.sapience.xyz/v2/graphql',
    });
    expect(applyRobinhoodPresetOnce(storage)).toEqual({ applied: true });
    for (const [key, value] of Object.entries(unrelated)) {
      expect(storage.getItem(key)).toBe(value);
    }
  });

  test('flag already set: a complete no-op, so later user changes stick', () => {
    const seeded: Record<string, string> = {
      [ROBINHOOD_DEFAULTS_MIGRATION_KEY]: '1',
      [STORAGE_KEYS.graphql]: 'https://api.sapience.xyz/v2/graphql',
      [STORAGE_KEYS.customChainId]: '5064014',
      [STORAGE_KEYS.customRpcURL]: 'https://rpc.ethereal.trade',
    };
    const storage = makeStorage(seeded);
    const result = applyRobinhoodPresetOnce(storage);
    expect(result).toEqual({ applied: false });
    for (const [key, value] of Object.entries(seeded)) {
      expect(storage.getItem(key)).toBe(value);
    }
  });

  test('storage that always throws: nothing written, no reload', () => {
    const storage = makeStorage({
      [STORAGE_KEYS.graphql]: 'https://keep.example',
    });
    const throwing = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: storage.removeItem,
    };
    const result = applyRobinhoodPresetOnce(throwing);
    expect(result).toEqual({ applied: false });
    expect(storage.getItem(STORAGE_KEYS.graphql)).toBe('https://keep.example');
    expect(storage.store.size).toBe(1);
  });

  test('mid-sequence failure leaves the flag unset so the next visit retries and self-heals', () => {
    const seed = {
      [STORAGE_KEYS.graphql]: 'https://api.sapience.xyz/v2/graphql',
    };
    // First two writes (chain id + rpc) land, then storage starts throwing —
    // the flag must NOT be set, so the migration is retried, not stranded.
    const flaky = makeFlakyStorage(seed, 2);
    expect(applyRobinhoodPresetOnce(flaky)).toEqual({ applied: false });
    expect(flaky.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)).toBeNull();

    // Next visit, storage healthy again: the retry completes the preset.
    const retry = makeStorage(Object.fromEntries(flaky.store));
    expect(applyRobinhoodPresetOnce(retry)).toEqual({ applied: true });
    for (const [key, value] of Object.entries(EXPECTED_WRITES)) {
      expect(retry.getItem(key)).toBe(value);
    }
    expect(retry.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)).toBe('1');
  });
});
