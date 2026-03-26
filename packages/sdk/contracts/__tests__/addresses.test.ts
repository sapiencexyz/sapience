import { describe, it, expect } from 'vitest';
import {
  getResolverAddressesForChain,
  pythConditionResolver,
  conditionalTokensConditionResolver,
  manualConditionResolver,
} from '../addresses';

describe('getResolverAddressesForChain', () => {
  const MAINNET = 5064014;
  const TESTNET = 13374202;

  it('returns pyth, conditionalTokens, and manual resolvers on mainnet', () => {
    const resolvers = getResolverAddressesForChain(MAINNET);
    const types = resolvers.map((r) => r.type);

    expect(types).toContain('pyth');
    expect(types).toContain('conditionalTokens');
    expect(types).toContain('manual');
    expect(resolvers).toHaveLength(3);
  });

  it('returns pyth and manual resolvers on testnet', () => {
    const resolvers = getResolverAddressesForChain(TESTNET);
    const types = resolvers.map((r) => r.type);

    expect(types).toContain('pyth');
    expect(types).toContain('manual');
    expect(types).not.toContain('conditionalTokens');
    expect(resolvers).toHaveLength(2);
  });

  it('returns correct addresses matching the source maps', () => {
    const resolvers = getResolverAddressesForChain(MAINNET);

    const pyth = resolvers.find((r) => r.type === 'pyth');
    expect(pyth?.address).toBe(pythConditionResolver[MAINNET].address);

    const ct = resolvers.find((r) => r.type === 'conditionalTokens');
    expect(ct?.address).toBe(
      conditionalTokensConditionResolver[MAINNET].address
    );

    const manual = resolvers.find((r) => r.type === 'manual');
    expect(manual?.address).toBe(manualConditionResolver[MAINNET].address);
  });

  it('excludes zero addresses', () => {
    const resolvers = getResolverAddressesForChain(MAINNET);
    const zero = '0x0000000000000000000000000000000000000000';

    for (const r of resolvers) {
      expect(r.address).not.toBe(zero);
    }
  });

  it('returns empty array for unknown chain', () => {
    expect(getResolverAddressesForChain(999999)).toEqual([]);
  });
});
