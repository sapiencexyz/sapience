import { describe, it, expect } from 'vitest';

import {
  categoryEndTimeForMarket,
  gameEndTimeForMarket,
  leagueForMarket,
} from '../generate/grouping';
import type { PolymarketMarket } from '../types';

/**
 * The Sonar gate: markets a deterministic category specialist can resolve are
 * filtered OUT of the Sonar endTime call (grouping.ts). This locks in the
 * predicate — what gets skipped vs what still pays for an LLM call.
 */
function makeMarket(
  overrides: Partial<PolymarketMarket> = {}
): PolymarketMarket {
  return {
    id: 'test-id',
    question: 'Will X happen?',
    conditionId: '0xabc',
    outcomes: ['Yes', 'No'],
    volume: '50000',
    liquidity: '5000',
    endDate: '2026-06-01T00:00:00Z',
    description: 'Test market',
    slug: 'test-market',
    category: 'politics',
    active: true,
    closed: false,
    ...overrides,
  };
}

describe('categoryEndTimeForMarket (Sonar gate predicate)', () => {
  it('resolves a sports gameStartTime market -> would skip Sonar before category', () => {
    const m = makeMarket({
      question: 'Lakers vs Celtics: Moneyline',
      slug: 'nba-lal-bos-2099-04-01',
      gameStartTime: '2099-04-01 00:00:00+00',
      events: [
        {
          title: 'Lakers vs Celtics',
          tags: [{ slug: 'nba', label: 'NBA' }],
        },
      ],
    });
    expect(leagueForMarket(m)).toBe('nba');
    expect(gameEndTimeForMarket(m)).toBe(Date.UTC(2099, 3, 1, 3, 29, 0) / 1000);
  });

  it('resolves a mention market -> would skip Sonar', () => {
    const m = makeMarket({
      question: 'Will Trump say "Coward" this week?',
      description:
        'This market will resolve to “Yes” if Donald Trump mentions the listed term between May 25, 2026, 12:00 AM ET and May 31, 2026, 11:59 PM ET. Otherwise, this market will resolve to “No”.',
    });
    expect(categoryEndTimeForMarket(m)).toBe(
      Date.UTC(2026, 5, 1, 3, 59, 0) / 1000
    );
  });

  it('resolves an AI-leaderboard snapshot market -> would skip Sonar', () => {
    const m = makeMarket({
      question: 'Will OpenAI have the best AI Agent at the end of June 2026?',
      description:
        'This market will resolve according to the company ... when the table is checked on June 30, 2026, 12:00 PM ET. Results from the "Rank" column will be used.',
    });
    expect(categoryEndTimeForMarket(m)).toBe(
      Date.UTC(2026, 5, 30, 16, 0, 0) / 1000
    );
  });

  it('declines a generic market -> still goes to Sonar', () => {
    const m = makeMarket({
      question: 'Will there be a ceasefire in Country X this year?',
      description: 'Resolves YES if a formal ceasefire is signed.',
    });
    expect(categoryEndTimeForMarket(m)).toBeNull();
  });

  it('partitions a batch the way the gate does', () => {
    const markets = [
      makeMarket({
        conditionId: '0x1',
        description:
          'Donald Trump mentions the listed term between May 25, 2026, 12:00 AM ET and May 31, 2026, 11:59 PM ET.',
      }),
      makeMarket({
        conditionId: '0x2',
        description: 'Generic market, no window.',
      }),
      makeMarket({
        conditionId: '0x3',
        question: 'Yankees vs Mets: Moneyline',
        slug: 'mlb-yankees-mets-2099-04-01',
        gameStartTime: '2099-04-01 00:00:00+00',
        events: [{ title: 'Yankees vs Mets', tags: [{ slug: 'mlb' }] }],
      }),
    ];
    const toSonar = markets.filter(
      (m) =>
        gameEndTimeForMarket(m) == null && categoryEndTimeForMarket(m) == null
    );
    expect(toSonar.map((m) => m.conditionId)).toEqual(['0x2']);
  });
});
