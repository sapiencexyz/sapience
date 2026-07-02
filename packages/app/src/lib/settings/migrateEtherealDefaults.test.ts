import { describe, test, expect } from 'vitest';

import {
  migrateEtherealDefaultsToRobinhood,
  ROBINHOOD_DEFAULTS_MIGRATION_KEY,
} from './migrateEtherealDefaults';

const KEYS = {
  graphql: 'sapience.settings.graphqlEndpoint',
  legacyGraphqlV2: 'sapience.settings.graphqlEndpointV2',
  api: 'sapience.settings.apiBaseUrl',
  signal: 'sapience.settings.signalEndpoint',
  chat: 'sapience.settings.chatBaseUrl',
  admin: 'sapience.settings.adminBaseUrl',
  etherealRpc: 'sapience.settings.etherealRpcURL',
  customChainId: 'sapience.settings.customChainId',
  customRpcURL: 'sapience.settings.customRpcURL',
} as const;

const ETHEREAL_MAINNET_VALUES: Record<string, string> = {
  [KEYS.graphql]: 'https://api.sapience.xyz/v2/graphql',
  [KEYS.api]: 'https://relayer.sapience.xyz/auction',
  [KEYS.signal]: 'https://relayer.sapience.xyz/signal',
  [KEYS.chat]: 'https://api.sapience.xyz/chat',
  [KEYS.admin]: 'https://api.sapience.xyz/admin',
  [KEYS.etherealRpc]: 'https://rpc.ethereal.trade',
  [KEYS.customChainId]: '5064014',
  [KEYS.customRpcURL]: 'https://rpc.ethereal.trade',
};

const ETHEREAL_TESTNET_VALUES: Record<string, string> = {
  [KEYS.graphql]: 'https://api.staging.sapience.xyz/v2/graphql',
  [KEYS.api]: 'https://relayer.staging.sapience.xyz/auction',
  [KEYS.signal]: 'https://relayer.staging.sapience.xyz/signal',
  [KEYS.chat]: 'https://api.staging.sapience.xyz/chat',
  [KEYS.admin]: 'https://api.staging.sapience.xyz/admin',
  [KEYS.etherealRpc]: 'https://rpc.etherealtest.net',
  [KEYS.customChainId]: '13374202',
  [KEYS.customRpcURL]: 'https://rpc.etherealtest.net',
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

describe('migrateEtherealDefaultsToRobinhood', () => {
  test('fresh storage: sets the flag and nothing else', () => {
    const storage = makeStorage();
    const result = migrateEtherealDefaultsToRobinhood(storage);
    expect(result).toEqual({ changed: false, chainCleared: false });
    expect(storage.store.size).toBe(1);
    expect(storage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)).toBe('1');
  });

  test('full Ethereal Mainnet settings: clears every key and reports chainCleared', () => {
    const storage = makeStorage(ETHEREAL_MAINNET_VALUES);
    const result = migrateEtherealDefaultsToRobinhood(storage);
    expect(result).toEqual({ changed: true, chainCleared: true });
    for (const key of Object.keys(ETHEREAL_MAINNET_VALUES)) {
      expect(storage.getItem(key)).toBeNull();
    }
    expect(storage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)).toBe('1');
  });

  test('full Ethereal Testnet settings: clears every key and reports chainCleared', () => {
    const storage = makeStorage(ETHEREAL_TESTNET_VALUES);
    const result = migrateEtherealDefaultsToRobinhood(storage);
    expect(result).toEqual({ changed: true, chainCleared: true });
    for (const key of Object.keys(ETHEREAL_TESTNET_VALUES)) {
      expect(storage.getItem(key)).toBeNull();
    }
  });

  test('legacy graphqlEndpointV2 key holding an Ethereal value is cleared', () => {
    const storage = makeStorage({
      [KEYS.legacyGraphqlV2]: 'https://api.sapience.xyz/v2/graphql',
    });
    const result = migrateEtherealDefaultsToRobinhood(storage);
    expect(result.changed).toBe(true);
    expect(storage.getItem(KEYS.legacyGraphqlV2)).toBeNull();
  });

  test('flag already set: leaves Ethereal values alone (user opted back in)', () => {
    const storage = makeStorage({
      ...ETHEREAL_MAINNET_VALUES,
      [ROBINHOOD_DEFAULTS_MIGRATION_KEY]: '1',
    });
    const result = migrateEtherealDefaultsToRobinhood(storage);
    expect(result).toEqual({ changed: false, chainCleared: false });
    for (const [key, value] of Object.entries(ETHEREAL_MAINNET_VALUES)) {
      expect(storage.getItem(key)).toBe(value);
    }
  });

  test('custom endpoint values survive; only known Ethereal values are cleared', () => {
    const storage = makeStorage({
      [KEYS.graphql]: 'https://my-own-api.example/graphql',
      [KEYS.api]: 'https://relayer.sapience.xyz/auction',
    });
    const result = migrateEtherealDefaultsToRobinhood(storage);
    expect(result).toEqual({ changed: true, chainCleared: false });
    expect(storage.getItem(KEYS.graphql)).toBe(
      'https://my-own-api.example/graphql'
    );
    expect(storage.getItem(KEYS.api)).toBeNull();
  });

  test('Ethereal chain id with a custom RPC is a deliberate setup: chain keys kept', () => {
    const storage = makeStorage({
      [KEYS.customChainId]: '5064014',
      [KEYS.customRpcURL]: 'https://my-ethereal-node.example',
    });
    const result = migrateEtherealDefaultsToRobinhood(storage);
    expect(result).toEqual({ changed: false, chainCleared: false });
    expect(storage.getItem(KEYS.customChainId)).toBe('5064014');
    expect(storage.getItem(KEYS.customRpcURL)).toBe(
      'https://my-ethereal-node.example'
    );
  });

  test('Robinhood preset values are not in the known set and survive', () => {
    const robinhood = {
      [KEYS.graphql]: 'https://api.predict.meridian.xyz/graphql',
      [KEYS.api]: 'https://relayer.predict.meridian.xyz/auction',
      [KEYS.customChainId]: '4663',
      [KEYS.customRpcURL]: 'https://rpc.mainnet.chain.robinhood.com',
    };
    const storage = makeStorage(robinhood);
    const result = migrateEtherealDefaultsToRobinhood(storage);
    expect(result).toEqual({ changed: false, chainCleared: false });
    for (const [key, value] of Object.entries(robinhood)) {
      expect(storage.getItem(key)).toBe(value);
    }
  });

  test('tolerates surrounding whitespace and trailing slashes on stored values', () => {
    const storage = makeStorage({
      [KEYS.graphql]: ' https://api.sapience.xyz/v2/graphql/ ',
    });
    const result = migrateEtherealDefaultsToRobinhood(storage);
    expect(result.changed).toBe(true);
    expect(storage.getItem(KEYS.graphql)).toBeNull();
  });

  test('does not clear anything when the flag write throws (no reload loop)', () => {
    const storage = makeStorage(ETHEREAL_MAINNET_VALUES);
    const throwing = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: storage.removeItem,
    };
    const result = migrateEtherealDefaultsToRobinhood(throwing);
    expect(result).toEqual({ changed: false, chainCleared: false });
    for (const [key, value] of Object.entries(ETHEREAL_MAINNET_VALUES)) {
      expect(storage.getItem(key)).toBe(value);
    }
  });
});
