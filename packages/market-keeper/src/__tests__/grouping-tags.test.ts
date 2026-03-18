import { describe, it, expect, vi } from 'vitest';
import type { PolymarketMarket } from '../types';

vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CHAIN_ID: 5064014,
  };
});

vi.mock('../llm', () => ({
  enrichMarketsWithLLM: vi.fn().mockResolvedValue(new Map()),
}));

function makeMarket(
  overrides: Partial<PolymarketMarket> = {}
): PolymarketMarket {
  return {
    id: 'test-id',
    question: 'Will BTC hit 100k?',
    conditionId: '0x123',
    outcomes: ['Yes', 'No'],
    volume: '100000',
    liquidity: '50000',
    endDate: '2025-06-01T00:00:00Z',
    description: 'A test market',
    slug: 'btc-100k',
    active: true,
    closed: false,
    ...overrides,
  };
}

describe('transformToSapienceCondition with tags', () => {
  it('includes tags from enrichment in output', async () => {
    const { transformToSapienceCondition } = await import(
      '../generate/grouping'
    );
    const result = transformToSapienceCondition(
      makeMarket(),
      'Test Group',
      undefined,
      ['UFC', 'Sports']
    );

    expect(result.tags).toEqual(['UFC', 'Sports']);
  });

  it('defaults to empty tags when none provided', async () => {
    const { transformToSapienceCondition } = await import(
      '../generate/grouping'
    );
    const result = transformToSapienceCondition(
      makeMarket(),
      'Test Group',
      undefined
    );

    expect(result.tags).toEqual([]);
  });
});
