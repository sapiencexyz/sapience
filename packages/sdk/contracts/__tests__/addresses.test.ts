import { describe, it, expect } from 'vitest';
import {
  getResolverAddressesForChain,
  getConditionalTokensPairs,
  pythConditionResolver,
  conditionalTokensConditionResolver,
  conditionalTokensReader,
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

describe('getConditionalTokensPairs', () => {
  const MAINNET = 5064014;

  it('returns at least the current pair on mainnet', () => {
    const pairs = getConditionalTokensPairs(MAINNET);
    expect(pairs.length).toBeGreaterThanOrEqual(1);

    const current = pairs.find((p) => p.current);
    expect(current).toBeDefined();
  });

  it('current pair matches SDK config addresses', () => {
    const pairs = getConditionalTokensPairs(MAINNET);
    const current = pairs.find((p) => p.current)!;

    expect(current.resolver.toLowerCase()).toBe(
      conditionalTokensConditionResolver[MAINNET].address.toLowerCase()
    );
    expect(current.reader.toLowerCase()).toBe(
      conditionalTokensReader[137].address.toLowerCase()
    );
  });

  it('includes legacy pairs', () => {
    const pairs = getConditionalTokensPairs(MAINNET);
    const legacy = pairs.filter((p) => !p.current);
    expect(legacy.length).toBeGreaterThanOrEqual(1);
  });

  it('all pairs have valid addresses', () => {
    const pairs = getConditionalTokensPairs(MAINNET);
    for (const pair of pairs) {
      expect(pair.reader).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(pair.resolver).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it('returns empty array for unknown chain', () => {
    expect(getConditionalTokensPairs(999999)).toEqual([]);
  });
});
