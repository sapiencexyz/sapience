import { describe, it, expect } from 'vitest';
import { getProviderForChain } from '../utils/getProviderForChain';
import { getChainConfig, etherealChain } from '@sapience/sdk/constants';

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
