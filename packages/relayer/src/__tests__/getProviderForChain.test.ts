import { describe, it, expect } from 'vitest';
import {
  getProviderForChain,
  getChainById,
  etherealChain,
} from '../utils/getProviderForChain';

describe('getProviderForChain', () => {
  const supportedChainIds = [13370, 5064014];

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
    expect(() => getProviderForChain(999)).toThrow('Unsupported chain ID: 999');
  });

  describe('Caching', () => {
    it('returns the same instance on repeated calls', () => {
      const client1 = getProviderForChain(5064014);
      const client2 = getProviderForChain(5064014);
      expect(client1).toBe(client2);
    });

    it('returns different instances for different chain IDs', () => {
      const clientCannon = getProviderForChain(13370);
      const clientEthereal = getProviderForChain(5064014);
      expect(clientCannon).not.toBe(clientEthereal);
    });
  });
});

describe('getChainById', () => {
  it('returns chain definition for cannon (13370)', () => {
    const chain = getChainById(13370);
    expect(chain).toBeDefined();
    expect(chain!.id).toBe(13370);
  });

  it('returns chain definition for ethereal (5064014)', () => {
    const chain = getChainById(5064014);
    expect(chain).toBeDefined();
    expect(chain!.id).toBe(5064014);
  });

  it('returns undefined for unknown chain ID', () => {
    const chain = getChainById(99999);
    expect(chain).toBeUndefined();
  });
});

describe('Custom chain definitions', () => {
  it('etherealChain has id 5064014', () => {
    expect(etherealChain.id).toBe(5064014);
    expect(etherealChain.name).toBe('EtherealChain');
    expect(etherealChain.nativeCurrency.symbol).toBe('USDe');
  });
});
