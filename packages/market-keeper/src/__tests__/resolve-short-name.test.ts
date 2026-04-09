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
  it('returns groupItemTitle when present', () => {
    const market = makeMarket({
      question: 'Will the next Prime Minister of Hungary be Viktor Orban?',
      groupItemTitle: 'Viktor Orban',
    });
    expect(resolveShortName(market)).toBe('Viktor Orban');
  });

  it('trims whitespace from groupItemTitle', () => {
    const market = makeMarket({
      groupItemTitle: '  Viktor Orban  ',
    });
    expect(resolveShortName(market)).toBe('Viktor Orban');
  });

  it('skips empty groupItemTitle and falls back to regex', () => {
    const market = makeMarket({
      question: 'Lakers vs. Celtics',
      outcomes: ['Lakers', 'Celtics'],
      groupItemTitle: '',
    });
    // Should use regex Rule 4 (team matchups)
    const result = resolveShortName(market);
    expect(result).not.toBeNull();
    expect(result).not.toBe('');
    expect(result).toContain('LAL');
  });

  it('skips whitespace-only groupItemTitle', () => {
    const market = makeMarket({
      question: 'Lakers vs. Celtics',
      outcomes: ['Lakers', 'Celtics'],
      groupItemTitle: '   ',
    });
    const result = resolveShortName(market);
    expect(result).not.toBeNull();
    expect(result).toContain('LAL');
  });

  it('falls back to regex when groupItemTitle is undefined', () => {
    const market = makeMarket({
      question: 'Bitcoin above $100,000?',
      outcomes: ['Yes', 'No'],
      groupItemTitle: undefined,
    });
    // Should match crypto threshold regex
    const result = resolveShortName(market);
    expect(result).not.toBeNull();
    expect(result).toContain('BTC');
  });

  it('returns null when no groupItemTitle and no regex match', () => {
    const market = makeMarket({
      question: 'Some obscure question with no pattern?',
      groupItemTitle: undefined,
    });
    expect(resolveShortName(market)).toBeNull();
  });

  it('prefers groupItemTitle over regex match', () => {
    // This question would match the crypto regex, but groupItemTitle takes priority
    const market = makeMarket({
      question: 'Will Bitcoin reach $200k?',
      outcomes: ['Yes', 'No'],
      groupItemTitle: 'BTC 200k Target',
    });
    expect(resolveShortName(market)).toBe('BTC 200k Target');
  });
});
