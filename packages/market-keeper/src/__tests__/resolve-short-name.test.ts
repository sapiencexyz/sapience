import { describe, it, expect } from 'vitest';
import { resolveShortName } from '../llm/enrichment';
import type { PolymarketMarket } from '../types';

function makeMarket(
  overrides: Partial<PolymarketMarket> = {}
): PolymarketMarket {
  return {
    id: 'test-id',
    question: 'Will something happen?',
    conditionId: '0x123',
    outcomes: ['Yes', 'No'],
    volume: '100000',
    liquidity: '50000',
    endDate: '2025-06-01T00:00:00Z',
    description: 'A test market',
    slug: 'test-market',
    active: true,
    closed: false,
    ...overrides,
  };
}

describe('resolveShortName', () => {
  it('ignores groupItemTitle and falls through to regex inference', () => {
    const market = makeMarket({
      question: 'Bitcoin above $200k?',
      outcomes: ['Yes', 'No'],
      groupItemTitle: 'BTC 200k Target',
    });
    const result = resolveShortName(market);
    expect(result).not.toBe('BTC 200k Target');
    expect(result).toContain('BTC');
  });

  it('returns regex inference for team matchups', () => {
    const market = makeMarket({
      question: 'Lakers vs. Celtics',
      outcomes: ['Lakers', 'Celtics'],
      groupItemTitle: undefined,
    });
    const result = resolveShortName(market);
    expect(result).not.toBeNull();
    expect(result).toContain('LAL');
  });

  it('returns regex inference for crypto threshold questions', () => {
    const market = makeMarket({
      question: 'Bitcoin above $100,000?',
      outcomes: ['Yes', 'No'],
      groupItemTitle: undefined,
    });
    const result = resolveShortName(market);
    expect(result).not.toBeNull();
    expect(result).toContain('BTC');
  });

  it('returns null when no regex rule matches (LLM fallback path)', () => {
    const market = makeMarket({
      question: 'Some obscure question with no pattern?',
      groupItemTitle: 'Some Option',
    });
    expect(resolveShortName(market)).toBeNull();
  });
});
