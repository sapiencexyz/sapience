import { describe, it, expect } from 'vitest';
import type { PolymarketMarket } from '../types';
import {
  GROUP_FILTERS,
  runPipeline,
  type MarketGroup,
} from '../generate/pipeline';

function makeMarket(
  overrides: Partial<PolymarketMarket> = {}
): PolymarketMarket {
  return {
    id: 'm-id',
    question: 'Will X win?',
    conditionId: '0xabc',
    outcomes: ['Yes', 'No'],
    volume: '0',
    liquidity: '0',
    endDate: '2026-12-31T00:00:00Z',
    description: '',
    slug: 'x',
    active: true,
    closed: false,
    ...overrides,
  };
}

function makeGroup(
  market: PolymarketMarket,
  eventTitle: string,
  eventId: string
): MarketGroup {
  market.events = [{ id: eventId, title: eventTitle, slug: eventTitle }];
  return {
    title: eventTitle,
    markets: [market],
    eventSlug: eventTitle,
  };
}

describe('GROUP_FILTERS — negRisk basket admission', () => {
  it('rescues low-volume negRisk siblings when one sibling passes volume+liquidity', () => {
    const passing = makeGroup(
      makeMarket({
        conditionId: '0x01',
        question: 'Will Hovland win?',
        volume: '50000',
        liquidity: '50000',
        negRisk: true,
      }),
      'us-open-winner',
      'event-1'
    );
    const longTail = makeGroup(
      makeMarket({
        conditionId: '0x02',
        question: 'Will Player B win?',
        volume: '5',
        liquidity: '5',
        negRisk: true,
      }),
      'us-open-winner',
      'event-1'
    );

    const { output } = runPipeline([passing, longTail], GROUP_FILTERS);

    expect(output).toHaveLength(2);
    expect(output.map((g) => g.markets[0].conditionId).sort()).toEqual([
      '0x01',
      '0x02',
    ]);
  });

  it('does not rescue negRisk siblings when no sibling passes thresholds', () => {
    const a = makeGroup(
      makeMarket({
        conditionId: '0xa',
        question: 'Will A win?',
        volume: '10',
        liquidity: '10',
        negRisk: true,
      }),
      'cold-event',
      'event-2'
    );
    const b = makeGroup(
      makeMarket({
        conditionId: '0xb',
        question: 'Will B win?',
        volume: '20',
        liquidity: '20',
        negRisk: true,
      }),
      'cold-event',
      'event-2'
    );

    const { output } = runPipeline([a, b], GROUP_FILTERS);

    expect(output).toHaveLength(0);
  });

  it('still removes low-volume non-negRisk groups (regression check)', () => {
    const lowVol = makeGroup(
      makeMarket({
        conditionId: '0xc',
        question: 'Will it rain?',
        volume: '5',
        liquidity: '5',
        // explicitly no negRisk
      }),
      'standalone',
      'event-3'
    );

    const { output } = runPipeline([lowVol], GROUP_FILTERS);

    expect(output).toHaveLength(0);
  });

  it('keeps non-negRisk groups that pass volume+liquidity (regression check)', () => {
    const passing = makeGroup(
      makeMarket({
        conditionId: '0xd',
        question: 'Will it rain?',
        volume: '5000',
        liquidity: '5000',
      }),
      'standalone',
      'event-4'
    );

    const { output } = runPipeline([passing], GROUP_FILTERS);

    expect(output).toHaveLength(1);
  });

  it('does not rescue a negRisk market that lacks an event id', () => {
    // Defensive: the rescue keys off Polymarket event id. A negRisk market
    // arriving without one (malformed feed, supplementary fetch path that
    // strips parent metadata) cannot be associated with a basket, so it must
    // fall back to standard volume+liquidity rules.
    const orphan = makeGroup(
      makeMarket({
        conditionId: '0xorphan',
        question: 'Will orphan win?',
        volume: '5',
        liquidity: '5',
        negRisk: true,
      }),
      'orphan-event',
      'event-orphan'
    );
    // Strip the event id to simulate the malformed payload.
    orphan.markets[0].events = [
      { title: 'orphan-event', slug: 'orphan-event' },
    ];

    const passingElsewhere = makeGroup(
      makeMarket({
        conditionId: '0xother',
        question: 'Will Other win?',
        volume: '50000',
        liquidity: '50000',
        negRisk: true,
      }),
      'other-event',
      'event-other'
    );

    const { output } = runPipeline([orphan, passingElsewhere], GROUP_FILTERS);

    expect(output.map((g) => g.markets[0].conditionId).sort()).toEqual([
      '0xother',
    ]);
  });

  it('does not rescue negRisk children across different events', () => {
    // Two separate negRisk events that happen to share a title (rare but
    // possible). Rescue must key off event id, not title — otherwise a
    // passing child of event-A would drag along low-volume children of
    // event-B.
    const passingInA = makeGroup(
      makeMarket({
        conditionId: '0xe1',
        question: 'Will X win?',
        volume: '50000',
        liquidity: '50000',
        negRisk: true,
      }),
      'shared-title',
      'event-A'
    );
    const lowInB = makeGroup(
      makeMarket({
        conditionId: '0xe2',
        question: 'Will Y win?',
        volume: '5',
        liquidity: '5',
        negRisk: true,
      }),
      'shared-title',
      'event-B'
    );

    const { output } = runPipeline([passingInA, lowInB], GROUP_FILTERS);

    expect(output).toHaveLength(1);
    expect(output[0].markets[0].conditionId).toBe('0xe1');
  });
});
