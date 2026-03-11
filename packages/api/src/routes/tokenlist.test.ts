import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../db';

vi.mock('../db', () => {
  const prisma = {
    picks: { findMany: vi.fn() },
    condition: { findMany: vi.fn() },
  };
  return { default: prisma, __esModule: true };
});

const prisma = dbModule.default as unknown as {
  picks: { findMany: ReturnType<typeof vi.fn> };
  condition: { findMany: ReturnType<typeof vi.fn> };
};

import { buildTokenList, resetCache, CT_RESOLVER, MAX_NAME_LENGTH, MAX_SYMBOL_LENGTH } from './tokenlist';

// Helper to build a pick config fixture
function makePickConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pc-1',
    predictorToken: '0xPREDICTOR',
    counterpartyToken: '0xCOUNTERPARTY',
    resolved: false,
    result: 'UNRESOLVED',
    createdAt: new Date(),
    picks: [
      {
        conditionId: 'cond-1',
        conditionResolver: CT_RESOLVER,
        predictedOutcome: 0,
      },
    ],
    ...overrides,
  };
}

function makeCondition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cond-1',
    question: 'Will BTC hit 100k?',
    shortName: 'BTC-100k',
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
      prisma.picks.findMany.mockResolvedValue([makePickConfig()]);
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const json = await buildTokenList();
      const list = JSON.parse(json);

      expect(list.name).toBe('Sapience Position Tokens');
      expect(list.version.major).toBe(1);
      expect(list.version.minor).toBeGreaterThan(0);
      expect(list.version.minor).toBeLessThan(65536);
      expect(list.timestamp).toBeTruthy();
      expect(list.tokens).toBeInstanceOf(Array);
    });

    it('creates entries for both chains and both sides', async () => {
      prisma.picks.findMany.mockResolvedValue([makePickConfig()]);
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const list = JSON.parse(await buildTokenList());

      // 2 sides (predictor + counterparty) × 2 chains = 4 tokens
      expect(list.tokens).toHaveLength(4);

      const chainIds = list.tokens.map((t: { chainId: number }) => t.chainId);
      expect(chainIds).toContain(42161);
      expect(chainIds).toContain(5064014);

      const tags = list.tokens.map((t: { tags: string[] }) => t.tags[0]);
      expect(tags.filter((t: string) => t === 'predict')).toHaveLength(2);
      expect(tags.filter((t: string) => t === 'cpty')).toHaveLength(2);
    });

    it('builds correct name and symbol for single-pick config', async () => {
      prisma.picks.findMany.mockResolvedValue([makePickConfig()]);
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const list = JSON.parse(await buildTokenList());

      const predictor = list.tokens.find(
        (t: { tags: string[] }) => t.tags[0] === 'predict'
      );
      const counterparty = list.tokens.find(
        (t: { tags: string[] }) => t.tags[0] === 'cpty'
      );

      expect(predictor.name).toBe('Will BTC hit 100k? Yes');
      expect(predictor.symbol).toBe('BTC-100k-Yes');

      expect(counterparty.name).toBe(
        'Will BTC hit 100k? Yes (Counterparty)'
      );
      expect(counterparty.symbol).toBe('BTC-100k-Yes-counterparty');
    });

    it('uses "No" outcome when predictedOutcome is 1', async () => {
      prisma.picks.findMany.mockResolvedValue([
        makePickConfig({
          picks: [
            {
              conditionId: 'cond-1',
              conditionResolver: CT_RESOLVER,
              predictedOutcome: 1,
            },
          ],
        }),
      ]);
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const list = JSON.parse(await buildTokenList());
      const predictor = list.tokens.find(
        (t: { tags: string[] }) => t.tags[0] === 'predict'
      );

      expect(predictor.name).toBe('Will BTC hit 100k? No');
      expect(predictor.symbol).toBe('BTC-100k-No');
    });

    it('builds correct name/symbol for parlay (multi-pick) config', async () => {
      prisma.picks.findMany.mockResolvedValue([
        makePickConfig({
          picks: [
            {
              conditionId: 'cond-1',
              conditionResolver: CT_RESOLVER,
              predictedOutcome: 0,
            },
            {
              conditionId: 'cond-2',
              conditionResolver: CT_RESOLVER,
              predictedOutcome: 1,
            },
          ],
        }),
      ]);
      prisma.condition.findMany.mockResolvedValue([
        makeCondition(),
        makeCondition({
          id: 'cond-2',
          question: 'Will ETH hit 10k?',
          shortName: 'ETH-10k',
        }),
      ]);

      const list = JSON.parse(await buildTokenList());
      const predictor = list.tokens.find(
        (t: { tags: string[] }) => t.tags[0] === 'predict'
      );
      const counterparty = list.tokens.find(
        (t: { tags: string[] }) => t.tags[0] === 'cpty'
      );

      expect(predictor.name).toBe(
        'Will BTC hit 100k? Yes + Will ETH hit 10k? No'
      );
      expect(predictor.symbol).toBe('BTC-100k-Yes+ETH-10k-No');

      expect(counterparty.name).toBe(
        'Will BTC hit 100k? Yes + Will ETH hit 10k? No (Counterparty)'
      );
      expect(counterparty.symbol).toBe('BTC-100k-Yes+ETH-10k-No-counterparty');
    });

    it('falls back to question when shortName is missing', async () => {
      prisma.picks.findMany.mockResolvedValue([makePickConfig()]);
      prisma.condition.findMany.mockResolvedValue([
        makeCondition({ shortName: null }),
      ]);

      const list = JSON.parse(await buildTokenList());
      const predictor = list.tokens.find(
        (t: { tags: string[] }) => t.tags[0] === 'predict'
      );

      expect(predictor.symbol).toBe('Will BTC hit 100k?-Yes');
    });

    it('filters out configs that do not use the CT resolver', async () => {
      prisma.picks.findMany.mockResolvedValue([
        makePickConfig(),
        makePickConfig({
          id: 'pc-non-ct',
          picks: [
            {
              conditionId: 'cond-1',
              conditionResolver: '0xOTHER_RESOLVER',
              predictedOutcome: 0,
            },
          ],
        }),
      ]);
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const list = JSON.parse(await buildTokenList());

      // Only pc-1 passes CT filter → 4 tokens (2 sides × 2 chains)
      expect(list.tokens).toHaveLength(4);
      expect(
        list.tokens.every(
          (t: { extensions: { pickConfigId: string } }) =>
            t.extensions.pickConfigId === 'pc-1'
        )
      ).toBe(true);
    });

    it('skips pick configs where condition is missing', async () => {
      prisma.picks.findMany.mockResolvedValue([makePickConfig()]);
      prisma.condition.findMany.mockResolvedValue([]); // no conditions found

      const list = JSON.parse(await buildTokenList());

      expect(list.tokens).toHaveLength(0);
    });

    it('returns empty token list when no pick configs exist', async () => {
      prisma.picks.findMany.mockResolvedValue([]);
      prisma.condition.findMany.mockResolvedValue([]);

      const list = JSON.parse(await buildTokenList());

      expect(list.tokens).toHaveLength(0);
    });

    it('sets extensions correctly', async () => {
      prisma.picks.findMany.mockResolvedValue([
        makePickConfig({ resolved: true, result: 'PREDICTOR_WINS' }),
      ]);
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const list = JSON.parse(await buildTokenList());
      const token = list.tokens[0];

      expect(token.extensions).toEqual({
        pickConfigId: 'pc-1',
        result: 'PREDICTOR_WINS',
        sapience: true,
      });
      expect(token.decimals).toBe(18);
    });

    it('sets version fields within uint16 range', async () => {
      prisma.picks.findMany.mockResolvedValue([makePickConfig()]);
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const list = JSON.parse(await buildTokenList());

      expect(list.version.major).toBe(1);
      // minor = MMDD (max 1231)
      const now = new Date();
      const expectedMinor =
        (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
      expect(list.version.minor).toBe(expectedMinor);
      expect(list.version.minor).toBeLessThan(65536);
      // patch = token count
      expect(list.version.patch).toBe(list.tokens.length);
      expect(list.version.patch).toBeLessThan(65536);
    });

    it('strips angle brackets from symbols', async () => {
      prisma.picks.findMany.mockResolvedValue([makePickConfig()]);
      prisma.condition.findMany.mockResolvedValue([
        makeCondition({ shortName: 'GOOGL >$300' }),
      ]);

      const list = JSON.parse(await buildTokenList());
      const predictor = list.tokens.find(
        (t: { tags: string[] }) => t.tags[0] === 'predict'
      );

      expect(predictor.symbol).toBe('GOOGL $300-Yes');
      expect(predictor.symbol).not.toMatch(/[<>]/);
    });

    it('uses short tag names (max 10 chars)', async () => {
      prisma.picks.findMany.mockResolvedValue([makePickConfig()]);
      prisma.condition.findMany.mockResolvedValue([makeCondition()]);

      const list = JSON.parse(await buildTokenList());
      for (const token of list.tokens) {
        for (const tag of token.tags) {
          expect(tag.length).toBeLessThanOrEqual(10);
        }
      }
    });

    it('truncates long names and symbols', async () => {
      const longQuestion = 'A'.repeat(120);
      const longShortName = 'S'.repeat(90);
      prisma.picks.findMany.mockResolvedValue([makePickConfig()]);
      prisma.condition.findMany.mockResolvedValue([
        makeCondition({ question: longQuestion, shortName: longShortName }),
      ]);

      const list = JSON.parse(await buildTokenList());
      for (const token of list.tokens) {
        expect(token.name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
        expect(token.symbol.length).toBeLessThanOrEqual(MAX_SYMBOL_LENGTH);
      }
    });
  });
});
