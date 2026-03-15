import { describe, it, expect } from 'vitest';
import {
  inferResolverKind,
  inferChainIdFromResolverAddress,
  getAdminSettlementTarget,
} from '../conditionResolver';
import {
  pythConditionResolver,
  lzPMResolver,
  umaResolver,
  lzUmaResolver,
} from '@sapience/sdk/contracts/addresses';
import {
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_ETHEREAL,
  DEFAULT_CHAIN_ID,
} from '@sapience/sdk/constants';

describe('inferResolverKind', () => {
  it('identifies pythConditionResolver address as "pyth"', () => {
    expect(inferResolverKind(pythConditionResolver[5064014]?.address)).toBe(
      'pyth'
    );
  });

  it('identifies lzPMResolver address as "lzPM"', () => {
    expect(inferResolverKind(lzPMResolver[5064014]?.address)).toBe('lzPM');
  });

  it('identifies umaResolver address as "uma"', () => {
    expect(inferResolverKind(umaResolver[42161]?.address)).toBe('uma');
  });

  it('returns "unknown" for unknown address', () => {
    expect(
      inferResolverKind('0x0000000000000000000000000000000000000001')
    ).toBe('unknown');
  });

  it('returns "unknown" for null', () => {
    expect(inferResolverKind(null)).toBe('unknown');
  });

  it('returns "unknown" for undefined', () => {
    expect(inferResolverKind(undefined)).toBe('unknown');
  });

  it('is case-insensitive for hex digits', () => {
    const addr = pythConditionResolver[5064014]!.address;
    const uppercased = '0x' + addr.slice(2).toUpperCase();
    expect(inferResolverKind(uppercased)).toBe('pyth');
  });
});

describe('inferChainIdFromResolverAddress', () => {
  it('returns chain ID for pythConditionResolver on Ethereal mainnet', () => {
    expect(
      inferChainIdFromResolverAddress(pythConditionResolver[5064014]?.address)
    ).toBe(CHAIN_ID_ETHEREAL);
  });

  it('returns chain ID for lzPMResolver', () => {
    expect(
      inferChainIdFromResolverAddress(lzPMResolver[5064014]?.address)
    ).toBe(CHAIN_ID_ETHEREAL);
  });

  it('returns DEFAULT_CHAIN_ID for unknown address', () => {
    expect(
      inferChainIdFromResolverAddress(
        '0x0000000000000000000000000000000000000001'
      )
    ).toBe(DEFAULT_CHAIN_ID);
  });

  it('returns DEFAULT_CHAIN_ID for null', () => {
    expect(inferChainIdFromResolverAddress(null)).toBe(DEFAULT_CHAIN_ID);
  });
});

describe('getAdminSettlementTarget', () => {
  it('returns null for Pyth resolver (settles itself)', () => {
    expect(
      getAdminSettlementTarget({
        conditionResolver: pythConditionResolver[5064014]?.address,
      })
    ).toBeNull();
  });

  it('returns Arbitrum lzUmaResolver for lzPM resolver', () => {
    const result = getAdminSettlementTarget({
      conditionResolver: lzPMResolver[5064014]?.address,
    });
    expect(result).not.toBeNull();
    expect(result!.chainId).toBe(CHAIN_ID_ARBITRUM);
    expect(result!.resolverAddress.toLowerCase()).toBe(
      lzUmaResolver[CHAIN_ID_ARBITRUM]?.address.toLowerCase()
    );
  });

  it('returns Arbitrum target for UMA resolver', () => {
    const result = getAdminSettlementTarget({
      conditionResolver: umaResolver[42161]?.address,
    });
    expect(result).not.toBeNull();
    expect(result!.chainId).toBe(CHAIN_ID_ARBITRUM);
  });

  it('returns null for unknown resolver', () => {
    expect(
      getAdminSettlementTarget({
        conditionResolver: '0x0000000000000000000000000000000000000001',
      })
    ).toBeNull();
  });
});
