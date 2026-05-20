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

  it('returns regex inference for O/U player props', () => {
    const market = makeMarket({
      question: 'Victor Wembanyama: Points O/U 24.5',
      outcomes: ['Yes', 'No'],
      sportsMarketType: 'points',
    });
    expect(resolveShortName(market)).toBe('Wembanyama O24.5pts');
  });

  it('returns null when no regex rule matches (LLM fallback path)', () => {
    const market = makeMarket({
      question: 'Some obscure question with no pattern?',
      groupItemTitle: 'Some Option',
    });
    expect(resolveShortName(market)).toBeNull();
  });

  it('does not append a period to full-game moneyline matchups', () => {
    const market = makeMarket({
      question: 'Hawks vs. Knicks',
      outcomes: ['Hawks', 'Knicks'],
      sportsMarketType: 'moneyline',
    });
    expect(resolveShortName(market)).toBe('ATL win vs NYK');
  });

  it('appends 1H to first-half moneyline matchups', () => {
    const market = makeMarket({
      question: 'Hawks vs. Knicks: 1H Moneyline',
      outcomes: ['Hawks', 'Knicks'],
      sportsMarketType: 'first_half_moneyline',
    });
    expect(resolveShortName(market)).toBe('ATL win vs NYK 1H');
  });

  it('appends 2H to second-half moneyline matchups', () => {
    const market = makeMarket({
      question: 'Hawks vs. Knicks: 2H Moneyline',
      outcomes: ['Hawks', 'Knicks'],
      sportsMarketType: 'second_half_moneyline',
    });
    expect(resolveShortName(market)).toBe('ATL win vs NYK 2H');
  });

  it('does not append a period for matchups without sportsMarketType', () => {
    const market = makeMarket({
      question: 'Lakers vs. Celtics',
      outcomes: ['Lakers', 'Celtics'],
      sportsMarketType: undefined,
    });
    expect(resolveShortName(market)).toBe('LAL win vs BOS');
  });
});
