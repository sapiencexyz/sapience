import { describe, expect, it } from 'vitest';
import {
  BUNGEE_NATIVE_TOKEN,
  isBungeeNative,
  selectBungeeSourceTokens,
  type BungeeApiToken,
} from '~/lib/bungee';

const baseToken = (over: Partial<BungeeApiToken>): BungeeApiToken => ({
  chainId: 1,
  address: '0x0000000000000000000000000000000000000001',
  name: 'Mock',
  symbol: 'MOCK',
  decimals: 18,
  logoURI: 'https://example.invalid/mock.png',
  ...over,
});

describe('bungee/sources', () => {
  describe('isBungeeNative', () => {
    it('matches the sentinel regardless of casing', () => {
      expect(isBungeeNative(BUNGEE_NATIVE_TOKEN)).toBe(true);
      expect(
        isBungeeNative(BUNGEE_NATIVE_TOKEN.toLowerCase() as `0x${string}`)
      ).toBe(true);
    });

    it('rejects non-sentinel addresses', () => {
      expect(isBungeeNative('0x0000000000000000000000000000000000000000')).toBe(
        false
      );
    });
  });

  describe('selectBungeeSourceTokens', () => {
    it('keeps only allowlisted symbols', () => {
      const out = selectBungeeSourceTokens([
        baseToken({ symbol: 'USDC' }),
        baseToken({ symbol: 'SHIB' }),
        baseToken({ symbol: 'USDe' }),
      ]);
      expect(out.map((t) => t.symbol)).toEqual(
        expect.arrayContaining(['USDC', 'USDe'])
      );
      expect(out.map((t) => t.symbol)).not.toContain('SHIB');
    });

    it('dedupes by symbol, first-wins', () => {
      const out = selectBungeeSourceTokens([
        baseToken({
          symbol: 'USDC',
          address: '0x0000000000000000000000000000000000000001',
        }),
        baseToken({
          symbol: 'USDC',
          address: '0x0000000000000000000000000000000000000002',
        }),
      ]);
      expect(out).toHaveLength(1);
      expect(out[0].address).toBe('0x0000000000000000000000000000000000000001');
    });

    it('flags the native sentinel', () => {
      const out = selectBungeeSourceTokens([
        baseToken({ symbol: 'ETH', address: BUNGEE_NATIVE_TOKEN }),
      ]);
      expect(out[0].isNative).toBe(true);
    });

    it('sorts by symbol priority — USDe first, then native gas, then stables', () => {
      const out = selectBungeeSourceTokens([
        baseToken({ symbol: 'USDT' }),
        baseToken({ symbol: 'cbBTC' }),
        baseToken({ symbol: 'ETH' }),
        baseToken({ symbol: 'USDC' }),
        baseToken({ symbol: 'USDe' }),
      ]);
      expect(out.map((t) => t.symbol)).toEqual([
        'USDe',
        'ETH',
        'USDC',
        'USDT',
        'cbBTC',
      ]);
    });
  });
});
