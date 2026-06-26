import { afterEach, describe, it, expect, vi } from 'vitest';
import { getProviderForChain } from '../utils/getProviderForChain';
import {
  CHAIN_ID_ROBINHOOD_TESTNET,
  getChainConfig,
  etherealChain,
} from '@sapience/sdk/constants';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getProviderForChain', () => {
  const supportedChainIds = [5064014];

  it.each(supportedChainIds)(
    'returns a PublicClient for chain ID %i',
    (chainId) => {
      const client = getProviderForChain(chainId);
      expect(client).toBeDefined();
      expect(typeof client.readContract).toBe('function');
      expect(typeof client.getBlockNumber).toBe('function');
    }
  );

  it('throws for unsupported chain ID', () => {
    expect(() => getProviderForChain(999)).toThrow('Unsupported chain');
  });

  it('supports env-configured custom chain IDs', () => {
    const chainId = 424242;
    vi.stubEnv(`CHAIN_${chainId}_RPC_URL`, 'https://rpc.example-chain.test');

    const client = getProviderForChain(chainId);
    expect(client.chain?.id).toBe(chainId);
    expect(client.chain?.rpcUrls.default.http[0]).toBe(
      'https://rpc.example-chain.test'
    );
  });

  it('supports Robinhood Chain Testnet', () => {
    const client = getProviderForChain(CHAIN_ID_ROBINHOOD_TESTNET);
    expect(client.chain?.id).toBe(CHAIN_ID_ROBINHOOD_TESTNET);
    expect(client.chain?.rpcUrls.default.http[0]).toBe(
      'https://rpc.testnet.chain.robinhood.com'
    );
  });

  describe('Caching', () => {
    it('returns the same instance on repeated calls', () => {
      const client1 = getProviderForChain(5064014);
      const client2 = getProviderForChain(5064014);
      expect(client1).toBe(client2);
    });

    it('returns different instances for different chain IDs', () => {
      const clientEthereal = getProviderForChain(5064014);
      const clientEtherealTestnet = getProviderForChain(13374202);
      expect(clientEthereal).not.toBe(clientEtherealTestnet);
    });
  });
});

describe('SDK chain config', () => {
  it('getChainConfig returns chain for ethereal (5064014)', () => {
    const chain = getChainConfig(5064014);
    expect(chain).toBeDefined();
    expect(chain.id).toBe(5064014);
  });

  it('getChainConfig throws for unknown chain ID', () => {
    expect(() => getChainConfig(99999)).toThrow('Unsupported chain');
  });
});

describe('Custom chain definitions', () => {
  it('etherealChain has id 5064014', () => {
    expect(etherealChain.id).toBe(5064014);
    expect(etherealChain.name).toBe('Ethereal');
    expect(etherealChain.nativeCurrency.symbol).toBe('USDe');
  });
});
