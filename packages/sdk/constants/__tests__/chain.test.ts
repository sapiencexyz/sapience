import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ROBINHOOD_TESTNET,
  CHAIN_ID_ROBINHOOD_MAINNET,
  CUSTOM_CHAIN_ID_KEY,
  CUSTOM_RPC_URL_KEY,
  DEFAULT_CHAIN_ID,
  buildCustomChain,
  getChainConfig,
  getRpcUrl,
  isBuiltInTradingChain,
  readCustomChainOverride,
} from '../chain';

const CUSTOM_CHAIN_ID = 424242; // an arbitrary chain not in viem's registry
const CUSTOM_RPC = 'https://rpc.example-chain.test';

/** Install a fake `window.localStorage` backed by the given map. */
function stubWindow(store: Record<string, string>) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
    },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('readCustomChainOverride', () => {
  test('returns null on the server (no window)', () => {
    expect(readCustomChainOverride()).toBeNull();
  });

  test('returns the override when both keys are valid', () => {
    stubWindow({
      [CUSTOM_CHAIN_ID_KEY]: String(CUSTOM_CHAIN_ID),
      [CUSTOM_RPC_URL_KEY]: CUSTOM_RPC,
    });
    expect(readCustomChainOverride()).toEqual({
      chainId: CUSTOM_CHAIN_ID,
      rpcUrl: CUSTOM_RPC,
    });
  });

  test('returns null when a key is missing', () => {
    stubWindow({ [CUSTOM_CHAIN_ID_KEY]: String(CUSTOM_CHAIN_ID) });
    expect(readCustomChainOverride()).toBeNull();
  });

  test('returns null for an invalid chain id or non-http rpc', () => {
    stubWindow({
      [CUSTOM_CHAIN_ID_KEY]: 'not-a-number',
      [CUSTOM_RPC_URL_KEY]: CUSTOM_RPC,
    });
    expect(readCustomChainOverride()).toBeNull();

    stubWindow({
      [CUSTOM_CHAIN_ID_KEY]: String(CUSTOM_CHAIN_ID),
      [CUSTOM_RPC_URL_KEY]: 'wss://not-http',
    });
    expect(readCustomChainOverride()).toBeNull();
  });
});

describe('DEFAULT_CHAIN_ID', () => {
  test('falls back to the env/default chain when no override is present', () => {
    // Evaluated at import time with no window → env default (Robinhood mainnet).
    expect(DEFAULT_CHAIN_ID).toBe(CHAIN_ID_ROBINHOOD_MAINNET);
  });
});

describe('buildCustomChain', () => {
  test('builds a generic viem Chain from id + rpc', () => {
    const chain = buildCustomChain(CUSTOM_CHAIN_ID, CUSTOM_RPC);
    expect(chain.id).toBe(CUSTOM_CHAIN_ID);
    expect(chain.rpcUrls.default.http[0]).toBe(CUSTOM_RPC);
    expect(chain.nativeCurrency.symbol).toBe('ETH');
  });
});

describe('getChainConfig', () => {
  test('returns Robinhood Chain Testnet config', () => {
    const chain = getChainConfig(CHAIN_ID_ROBINHOOD_TESTNET);
    expect(chain.id).toBe(CHAIN_ID_ROBINHOOD_TESTNET);
    expect(chain.name).toBe('Robinhood Testnet');
    expect(chain.rpcUrls.default.http[0]).toBe(
      'https://rpc.testnet.chain.robinhood.com'
    );
  });

  test('throws for an unknown chain when no override is set', () => {
    expect(() => getChainConfig(CUSTOM_CHAIN_ID)).toThrow(/Unsupported chain/);
  });

  test('builds a generic chain for env-configured chains in Node', () => {
    vi.stubEnv(`CHAIN_${CUSTOM_CHAIN_ID}_RPC_URL`, CUSTOM_RPC);

    const chain = getChainConfig(CUSTOM_CHAIN_ID);
    expect(chain.id).toBe(CUSTOM_CHAIN_ID);
    expect(getRpcUrl(CUSTOM_CHAIN_ID)).toBe(CUSTOM_RPC);
  });

  test('builds a generic chain for the override chain', () => {
    stubWindow({
      [CUSTOM_CHAIN_ID_KEY]: String(CUSTOM_CHAIN_ID),
      [CUSTOM_RPC_URL_KEY]: CUSTOM_RPC,
    });
    const chain = getChainConfig(CUSTOM_CHAIN_ID);
    expect(chain.id).toBe(CUSTOM_CHAIN_ID);
    expect(getRpcUrl(CUSTOM_CHAIN_ID)).toBe(CUSTOM_RPC);
  });

  test('still throws for a non-override unknown chain even with an override set', () => {
    stubWindow({
      [CUSTOM_CHAIN_ID_KEY]: String(CUSTOM_CHAIN_ID),
      [CUSTOM_RPC_URL_KEY]: CUSTOM_RPC,
    });
    expect(() => getChainConfig(99999)).toThrow(/Unsupported chain/);
  });

  test('returns Robinhood Chain Mainnet config with its default RPC', () => {
    const chain = getChainConfig(CHAIN_ID_ROBINHOOD_MAINNET);
    expect(chain.id).toBe(CHAIN_ID_ROBINHOOD_MAINNET);
    expect(chain.name).toBe('Robinhood');
    expect(chain.rpcUrls.default.http[0]).toBe(
      'https://rpc.mainnet.chain.robinhood.com'
    );
  });

  test('honors a Settings custom RPC override for Robinhood mainnet', () => {
    // A custom RPC set in Settings (the custom-chain override) must win over the
    // hardcoded default, even though the mainnet is a first-class chain.
    stubWindow({
      [CUSTOM_CHAIN_ID_KEY]: String(CHAIN_ID_ROBINHOOD_MAINNET),
      [CUSTOM_RPC_URL_KEY]: CUSTOM_RPC,
    });
    expect(getRpcUrl(CHAIN_ID_ROBINHOOD_MAINNET)).toBe(CUSTOM_RPC);
    // Identity is preserved (still the Robinhood mainnet chain, not a generic one).
    expect(getChainConfig(CHAIN_ID_ROBINHOOD_MAINNET).name).toBe('Robinhood');
  });
});

describe('isBuiltInTradingChain', () => {
  test('treats Robinhood mainnet as a first-class trading chain', () => {
    expect(isBuiltInTradingChain(CHAIN_ID_ROBINHOOD_MAINNET)).toBe(true);
  });
});
