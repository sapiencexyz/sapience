import { describe, it, expect } from 'vitest';
import { transformToSapienceCondition } from '../generate/grouping';
import type { PolymarketMarket } from '../types';
import type { MarketEnrichmentOutput } from '../llm';

function makeMarket(
  overrides: Partial<PolymarketMarket> = {}
): PolymarketMarket {
  return {
    id: 'test-id',
    question: 'Will Bitcoin reach $150,000 in April?',
    conditionId:
      '0xabc0000000000000000000000000000000000000000000000000000000000000',
    outcomes: ['Yes', 'No'],
    volume: '12345',
    liquidity: '5000',
    endDate: '2026-05-01T00:00:00Z',
    description: 'test',
    slug: 'btc-150k-apr',
    active: true,
    closed: false,
    ...overrides,
  };
}

const enrichment: MarketEnrichmentOutput = {
  conditionId:
    '0xabc0000000000000000000000000000000000000000000000000000000000000',
  category: 'crypto',
  shortName: 'BTC ≥$150k Apr',
};

describe('transformToSapienceCondition', () => {
  it('routes groupItemTitle verbatim into optionName', () => {
    const market = makeMarket({ groupItemTitle: '↑ 150,000' });
    const c = transformToSapienceCondition(market, 'group', enrichment);
    expect(c.optionName).toBe('↑ 150,000');
  });

  it('uses LLM/regex shortName and does not read groupItemTitle for shortName', () => {
    const market = makeMarket({ groupItemTitle: '↑ 150,000' });
    const c = transformToSapienceCondition(market, 'group', enrichment);
    expect(c.shortName).toBe('BTC ≥$150k Apr');
    expect(c.shortName).not.toBe('↑ 150,000');
  });

  it('leaves optionName undefined when groupItemTitle is missing', () => {
    const market = makeMarket({ groupItemTitle: undefined });
    const c = transformToSapienceCondition(market, undefined, enrichment);
    expect(c.optionName).toBeUndefined();
  });

  it('treats whitespace-only groupItemTitle as absent', () => {
    const market = makeMarket({ groupItemTitle: '   ' });
    const c = transformToSapienceCondition(market, 'group', enrichment);
    expect(c.optionName).toBeUndefined();
  });

  it('trims leading/trailing whitespace on groupItemTitle', () => {
    const market = makeMarket({ groupItemTitle: '  April 7  ' });
    const c = transformToSapienceCondition(market, 'group', enrichment);
    expect(c.optionName).toBe('April 7');
  });

  it('falls back to question for shortName when no enrichment is provided', () => {
    const market = makeMarket({
      question: 'Something weird with no regex match',
      groupItemTitle: 'Opt A',
    });
    const c = transformToSapienceCondition(market, 'group', undefined);
    expect(c.shortName).toBe('Something weird with no regex match');
    expect(c.optionName).toBe('Opt A');
  });

  it('carries gameStartTime and inferred league for the production endTime cascade', () => {
    const market = makeMarket({
      question: 'Lakers vs Celtics: Moneyline',
      slug: 'nba-lakers-celtics-2099-04-01',
      gameStartTime: '2099-04-01 00:00:00+00',
      events: [
        {
          title: 'Lakers vs Celtics',
          tags: [{ slug: 'nba', label: 'NBA' }],
        },
      ],
    });
    const c = transformToSapienceCondition(market, 'group', enrichment);
    expect(c.gameStartTime).toBe('2099-04-01 00:00:00+00');
    expect(c.league).toBe('nba');
  });
});
