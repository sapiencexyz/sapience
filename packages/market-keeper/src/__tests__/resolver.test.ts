import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getResolverConfig, type ResolverType } from '../resolver';

/**
 * Tests for resolver configuration.
 *
 * The market-keeper determines resolver type from chain ID:
 *   - Testnet (13374202) → manual resolver (stand-in for LZ bridge)
 *   - Mainnet (5064014)  → CT resolver (LZ bridge from Polygon)
 *
 * No env vars needed — the chain ID is the source of truth.
 */

// ============ getResolverConfig (pure function) ============

describe('getResolverConfig', () => {
  // ─── CT resolver (mainnet) ─────────────────────────────────────────

  describe('resolverType = "ct"', () => {
    it('returns CT resolver address for mainnet chain', () => {
      const config = getResolverConfig(5064014, 'ct');
      expect(config.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(config.address).not.toBe('');
    });

    it('returns all CT resolver addresses (current + legacy) for mainnet', () => {
      const config = getResolverConfig(5064014, 'ct');
      expect(config.allAddresses.length).toBeGreaterThanOrEqual(1);
      for (const addr of config.allAddresses) {
        expect(addr).toBe(addr.toLowerCase());
      }
      expect(config.allAddresses).toContain(config.address.toLowerCase());
    });

    it('throws for chain with no CT resolver deployed', () => {
      expect(() => getResolverConfig(13374202, 'ct')).toThrow(
        /ConditionalTokensConditionResolver.*13374202/
      );
    });
  });

  // ─── Manual resolver (testnet) ─────────────────────────────────────

  describe('resolverType = "manual"', () => {
    it('returns manual resolver address for testnet chain', () => {
      const config = getResolverConfig(13374202, 'manual');
      expect(config.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(config.address).not.toBe('');
    });

    it('returns all manual resolver addresses (current + legacy) for testnet', () => {
      const config = getResolverConfig(13374202, 'manual');
      expect(config.allAddresses.length).toBeGreaterThanOrEqual(1);
      for (const addr of config.allAddresses) {
        expect(addr).toBe(addr.toLowerCase());
      }
      expect(config.allAddresses).toContain(config.address.toLowerCase());
    });

    it('returns manual resolver for mainnet too (it exists on both chains)', () => {
      const config = getResolverConfig(5064014, 'manual');
      expect(config.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('throws for unknown chain ID', () => {
      expect(() => getResolverConfig(999999, 'ct')).toThrow();
      expect(() => getResolverConfig(999999, 'manual')).toThrow();
    });

    it('allAddresses has no duplicates', () => {
      const config = getResolverConfig(5064014, 'ct');
      const unique = new Set(config.allAddresses);
      expect(unique.size).toBe(config.allAddresses.length);
    });

    it('address is not lowercased (checksum preserved)', () => {
      const config = getResolverConfig(5064014, 'ct');
      expect(config.address).not.toBe(config.address.toLowerCase());
    });

    it('allAddresses are all lowercased (for DB matching)', () => {
      const config = getResolverConfig(5064014, 'ct');
      for (const addr of config.allAddresses) {
        expect(addr).toBe(addr.toLowerCase());
      }
    });
  });

  // ─── Type safety ───────────────────────────────────────────────────

  describe('type safety', () => {
    it('ResolverType only allows "ct" or "manual"', () => {
      const validTypes: ResolverType[] = ['ct', 'manual'];
      for (const type of validTypes) {
        expect(() => getResolverConfig(5064014, type)).not.toThrow();
      }
    });
  });
});

// ============ Chain-based resolver type (constants.ts integration) ============

describe('RESOLVER_TYPE from chain ID', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses "ct" for mainnet chain (5064014)', async () => {
    process.env.CHAIN_ID = '5064014';

    const { RESOLVER_TYPE, RESOLVER_ADDRESS } = await import('../constants');
    expect(RESOLVER_TYPE).toBe('ct');
    expect(RESOLVER_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('uses "manual" for testnet chain (13374202)', async () => {
    process.env.CHAIN_ID = '13374202';

    const { RESOLVER_TYPE, RESOLVER_ADDRESS } = await import('../constants');
    expect(RESOLVER_TYPE).toBe('manual');
    expect(RESOLVER_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('uses "manual" for testnet regardless of NODE_ENV', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CHAIN_ID = '13374202';

    // This is the exact bug scenario that was producing null resolvers.
    // Now it correctly picks manual resolver based on chain, not NODE_ENV.
    const { RESOLVER_TYPE, RESOLVER_ADDRESS } = await import('../constants');
    expect(RESOLVER_TYPE).toBe('manual');
    expect(RESOLVER_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('defaults to mainnet when CHAIN_ID is unset', async () => {
    delete process.env.CHAIN_ID;

    const { CHAIN_ID, RESOLVER_TYPE } = await import('../constants');
    expect(CHAIN_ID).toBe(5064014);
    expect(RESOLVER_TYPE).toBe('ct');
  });
});
