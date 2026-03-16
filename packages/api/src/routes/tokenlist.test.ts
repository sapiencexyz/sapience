import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../db';

vi.mock('../db', () => {
  const prisma = {
    condition: { findMany: vi.fn() },
  };
  return { default: prisma, __esModule: true };
});

const prisma = dbModule.default as unknown as {
  condition: { findMany: ReturnType<typeof vi.fn> };
};

import {
  buildTokenList,
  resetCache,
  MAX_NAME_LENGTH,
  MAX_SYMBOL_LENGTH,
} from './tokenlist';

// Helper to build a condition fixture
function makeCondition(overrides: Record<string, unknown> = {}) {
  return {
    id: '0xabc123' + '0'.repeat(58), // 66-char hex conditionId
    question: 'Will BTC hit 100k?',
    shortName: 'BTC-100k',
    openInterest: '1000000000000000000', // 1e18
    category: { name: 'Crypto' },
    ...overrides,
  };
}

describe('tokenlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCache();
  });

  describe('buildTokenList', () => {
    it('returns valid token list JSON with correct structure', async () => {
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const json = await buildTokenList();
      const list = JSON.parse(json);

      expect(list.name).toBe('Sapience Tokens');
      expect(list.version.major).toBe(1);
      expect(list.version.minor).toBeGreaterThan(0);
      expect(list.version.minor).toBeLessThan(65536);
      expect(list.timestamp).toBeTruthy();
      expect(list.tokens).toBeInstanceOf(Array);
    });

    it('creates YES and NO entries for each condition on Arbitrum', async () => {
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const list = JSON.parse(await buildTokenList());

      // 2 outcomes (Yes + No) per condition
      expect(list.tokens).toHaveLength(2);

      const chainIds = list.tokens.map((t: { chainId: number }) => t.chainId);
      expect(chainIds).toEqual([42161, 42161]);

      // Both tokens tagged with category name
      for (const token of list.tokens) {
        expect(token.tags).toEqual(['Crypto']);
      }
    });

    it('builds correct name and symbol for Yes/No outcomes', async () => {
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const list = JSON.parse(await buildTokenList());

      const yes = list.tokens.find((t: { name: string }) =>
        t.name.endsWith('Yes')
      );
      const no = list.tokens.find((t: { name: string }) =>
        t.name.endsWith('No')
      );

      expect(yes.name).toBe('Will BTC hit 100k? — Yes');
      expect(yes.symbol).toBe('BTC-100k-Yes');

      expect(no.name).toBe('Will BTC hit 100k? — No');
      expect(no.symbol).toBe('BTC-100k-No');
    });

    it('computes deterministic token addresses', async () => {
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const list = JSON.parse(await buildTokenList());

      for (const token of list.tokens) {
        expect(token.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      }

      // Yes and No should have different addresses
      expect(list.tokens[0].address).not.toBe(list.tokens[1].address);
    });

    it('falls back to question when shortName is missing', async () => {
      prisma.condition.findMany.mockResolvedValue([
        makeCondition({ shortName: null }),
      ]);

      const list = JSON.parse(await buildTokenList());
      const yes = list.tokens.find((t: { name: string }) =>
        t.name.endsWith('Yes')
      );

      expect(yes.symbol).toBe('Will BTC hit 100k?-Yes');
    });

    it('returns empty token list when no conditions exist', async () => {
      prisma.condition.findMany.mockResolvedValue([]);

      const list = JSON.parse(await buildTokenList());

      expect(list.tokens).toHaveLength(0);
    });

    it('sets extensions with conditionId', async () => {
      const condId = '0xabc123' + '0'.repeat(58);
      prisma.condition.findMany.mockResolvedValue([
        makeCondition({ id: condId }),
      ]);

      const list = JSON.parse(await buildTokenList());
      const token = list.tokens[0];

      expect(token.extensions).toEqual({
        conditionId: condId,
        sapience: true,
      });
      expect(token.decimals).toBe(18);
      expect(token.logoURI).toBe('https://sapience.xyz/favicon.ico');
    });

    it('sets version fields within uint16 range', async () => {
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const list = JSON.parse(await buildTokenList());

      expect(list.version.major).toBe(1);
      const now = new Date();
      const expectedMinor = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
      expect(list.version.minor).toBe(expectedMinor);
      expect(list.version.minor).toBeLessThan(65536);
      expect(list.version.patch).toBe(list.tokens.length);
      expect(list.version.patch).toBeLessThan(65536);
    });

    it('replaces angle brackets in symbols with unicode equivalents', async () => {
      prisma.condition.findMany.mockResolvedValue([
        makeCondition({ shortName: 'GOOGL >$300' }),
      ]);

      const list = JSON.parse(await buildTokenList());
      const yes = list.tokens.find((t: { name: string }) =>
        t.name.endsWith('Yes')
      );

      expect(yes.symbol).toBe('GOOGL ›$300-Yes');
      expect(yes.symbol).not.toMatch(/[<>]/);
    });

    it('replaces angle brackets in names with unicode equivalents', async () => {
      prisma.condition.findMany.mockResolvedValue([
        makeCondition({ question: 'Will Elon Musk post <40 tweets?' }),
      ]);

      const list = JSON.parse(await buildTokenList());
      const yes = list.tokens.find((t: { name: string }) =>
        t.name.endsWith('Yes')
      );

      expect(yes.name).not.toMatch(/[<>]/);
      expect(yes.name).toContain('‹40 tweets');
    });

    it('uses category name as tag', async () => {
      prisma.condition.findMany.mockResolvedValue([
        makeCondition({ category: { name: 'Crypto' } }),
      ]);

      const list = JSON.parse(await buildTokenList());
      for (const token of list.tokens) {
        expect(token.tags).toEqual(['Crypto']);
      }
    });

    it('omits tags when category is null', async () => {
      prisma.condition.findMany.mockResolvedValue([
        makeCondition({ category: null }),
      ]);

      const list = JSON.parse(await buildTokenList());
      for (const token of list.tokens) {
        expect(token.tags).toEqual([]);
      }
    });

    it('sanitizes and truncates tag names (max 10 chars, alphanumeric)', async () => {
      prisma.condition.findMany.mockResolvedValue([
        makeCondition({ category: { name: 'US Politics & More' } }),
      ]);

      const list = JSON.parse(await buildTokenList());
      for (const token of list.tokens) {
        expect(token.tags[0]).toBe('USPolitics');
        expect(token.tags[0].length).toBeLessThanOrEqual(10);
        expect(token.tags[0]).toMatch(/^[\w]+$/);
      }
    });

    it('truncates long names and symbols', async () => {
      const longQuestion = 'A'.repeat(120);
      const longShortName = 'S'.repeat(90);
      prisma.condition.findMany.mockResolvedValue([
        makeCondition({ question: longQuestion, shortName: longShortName }),
      ]);

      const list = JSON.parse(await buildTokenList());
      for (const token of list.tokens) {
        expect(token.name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
        expect(token.symbol.length).toBeLessThanOrEqual(MAX_SYMBOL_LENGTH);
      }
    });

    it('handles multiple conditions in order', async () => {
      prisma.condition.findMany.mockResolvedValue([
        makeCondition({
          id: '0x' + '1'.repeat(64),
          question: 'Q1',
          shortName: 'Q1',
        }),
        makeCondition({
          id: '0x' + '2'.repeat(64),
          question: 'Q2',
          shortName: 'Q2',
        }),
      ]);

      const list = JSON.parse(await buildTokenList());

      // 2 conditions × 2 outcomes = 4 tokens
      expect(list.tokens).toHaveLength(4);

      // First condition's tokens come first
      expect(list.tokens[0].name).toContain('Q1');
      expect(list.tokens[1].name).toContain('Q1');
      expect(list.tokens[2].name).toContain('Q2');
      expect(list.tokens[3].name).toContain('Q2');
    });
  });
});
