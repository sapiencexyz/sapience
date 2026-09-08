import { describe, it, expect } from 'vitest';
import {
  getResolverAddressesForChain,
  getConditionalTokensPairs,
  getProtocolAddressesForChain,
  pythConditionResolver,
  conditionalTokensConditionResolver,
  conditionalTokensReader,
  collateralToken,
  manualConditionResolver,
  predictionMarketEscrow,
  predictionMarketVault,
  singleLegVault,
  secondaryMarketEscrow,
} from '../addresses';
import {
  CHAIN_ID_ROBINHOOD_TESTNET,
  CHAIN_ID_ROBINHOOD_MAINNET,
  COLLATERAL_SYMBOLS,
  getChainConfig,
} from '../../constants/chain';

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

describe('getProtocolAddressesForChain', () => {
  const MAINNET = 5064014;
  const TESTNET = 13374202;

  it('returns the current escrow address on mainnet, lower-cased', () => {
    const addrs = getProtocolAddressesForChain(MAINNET);
    expect(addrs).toContain(
      predictionMarketEscrow[MAINNET].address.toLowerCase()
    );
  });

  it('includes legacy escrow addresses on mainnet, lower-cased', () => {
    const addrs = getProtocolAddressesForChain(MAINNET);
    const legacy = predictionMarketEscrow[MAINNET].legacy ?? [];
    for (const leg of legacy) {
      const legAddr = (
        typeof leg === 'string' ? leg : leg.address
      ).toLowerCase();
      expect(addrs).toContain(legAddr);
    }
    expect(legacy.length).toBeGreaterThan(0);
  });

  it('includes secondary market escrow on testnet (current + legacy)', () => {
    const addrs = getProtocolAddressesForChain(TESTNET);
    expect(addrs).toContain(
      secondaryMarketEscrow[TESTNET].address.toLowerCase()
    );
    const legacy = secondaryMarketEscrow[TESTNET].legacy ?? [];
    for (const leg of legacy) {
      const legAddr = (
        typeof leg === 'string' ? leg : leg.address
      ).toLowerCase();
      expect(addrs).toContain(legAddr);
    }
  });

  it('returns lower-cased addresses with no duplicates', () => {
    const addrs = getProtocolAddressesForChain(MAINNET);
    expect(addrs.length).toBeGreaterThan(0);
    for (const a of addrs) {
      expect(a).toBe(a.toLowerCase());
    }
    expect(new Set(addrs).size).toBe(addrs.length);
  });

  it('returns empty array for unknown chain', () => {
    expect(getProtocolAddressesForChain(999999)).toEqual([]);
  });
});

describe('Robinhood Chain Testnet deployment', () => {
  it('has a first-class chain config and escrow deployments', () => {
    expect(getChainConfig(CHAIN_ID_ROBINHOOD_TESTNET).id).toBe(
      CHAIN_ID_ROBINHOOD_TESTNET
    );
    expect(COLLATERAL_SYMBOLS[CHAIN_ID_ROBINHOOD_TESTNET]).toBe('USDe');
    expect(collateralToken[CHAIN_ID_ROBINHOOD_TESTNET]?.address).toBe(
      '0xCc4225D5F36b26b211675E8d9B7f11511Ba58D2C'
    );
    expect(predictionMarketEscrow[CHAIN_ID_ROBINHOOD_TESTNET]?.address).toBe(
      '0x2A97702591ACCbF330c6c813C46DE287653eb645'
    );
    expect(
      predictionMarketEscrow[CHAIN_ID_ROBINHOOD_TESTNET]?.blockCreated
    ).toBe(81639399);
    expect(secondaryMarketEscrow[CHAIN_ID_ROBINHOOD_TESTNET]?.address).toBe(
      '0x888e445F96515186B7b262d959FFF4AF14151ca9'
    );
    expect(
      secondaryMarketEscrow[CHAIN_ID_ROBINHOOD_TESTNET]?.blockCreated
    ).toBe(81643819);
  });

  it('includes Robinhood testnet escrow addresses in protocol addresses', () => {
    expect(getProtocolAddressesForChain(CHAIN_ID_ROBINHOOD_TESTNET)).toEqual(
      expect.arrayContaining([
        '0xcc4225d5f36b26b211675e8d9b7f11511ba58d2c',
        '0x2a97702591accbf330c6c813c46de287653eb645',
        '0xf03efa8bf3271fe347bf750d72baaf2f9b6ffc29',
        '0x1847e316e6e4302b23b5ab5be078926386d78e95',
        '0x888e445f96515186b7b262d959fff4af14151ca9',
        '0xc1525cf7d9b9ed81ce277c2bf96fb1e0e85e1e7e',
      ])
    );
  });
});

describe('Robinhood Chain Mainnet collateral', () => {
  it('expects USDe collateral at the mainnet token address', () => {
    expect(COLLATERAL_SYMBOLS[CHAIN_ID_ROBINHOOD_MAINNET]).toBe('USDe');
    expect(collateralToken[CHAIN_ID_ROBINHOOD_MAINNET]?.address).toBe(
      '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34'
    );
  });
});

describe('Robinhood Chain Mainnet vaults', () => {
  it('registers the main (Core) and single-leg vaults so they show as tabs', () => {
    expect(predictionMarketVault[CHAIN_ID_ROBINHOOD_MAINNET]?.address).toBe(
      '0x79cB914f3F336426E89FaB55A9488AB25770552D'
    );
    expect(singleLegVault[CHAIN_ID_ROBINHOOD_MAINNET]?.address).toBe(
      '0xdD9B39FFedf8602Ff86c3621f30Bbc598a2Df223'
    );
  });

  it('has no legacy entries for the mainnet protocol contracts', () => {
    expect(predictionMarketEscrow[CHAIN_ID_ROBINHOOD_MAINNET]?.legacy).toEqual(
      []
    );
    expect(predictionMarketVault[CHAIN_ID_ROBINHOOD_MAINNET]?.legacy).toEqual(
      []
    );
    expect(singleLegVault[CHAIN_ID_ROBINHOOD_MAINNET]?.legacy).toEqual([]);
  });
});
