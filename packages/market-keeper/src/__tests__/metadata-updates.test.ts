import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PolymarketMarket } from '../types';

// Mocks below are only needed by the `groupMarkets` integration cases at the
// bottom of this file — the unit tests of `computeMetadataUpdates` and
// `computeGroupMetadataUpdates` call those functions directly with synthetic
// args and don't go through the heavy machinery.
vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CHAIN_ID: 5064014,
    LLM_ENRICHMENT_ENABLED: false,
    LLM_ENDTIME_SEARCH_ENABLED: false,
    OPENROUTER_API_KEY: '',
    LLM_MODEL: '',
    LLM_ENDTIME_MODEL: '',
    DEFAULT_SAPIENCE_API_URL: 'https://test-api.example.com',
  };
});

vi.mock('../llm', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    enrichMarketsWithLLM: vi.fn().mockResolvedValue(new Map()),
    enrichEndTimesWithLLM: vi.fn().mockResolvedValue(new Map()),
  };
});

const mockFetchEventTags = vi.fn().mockResolvedValue(new Map());
vi.mock('../generate/tags', () => ({
  fetchEventTags: (...args: unknown[]) => mockFetchEventTags(...args),
}));

vi.mock('../generate/pipeline', () => ({
  runPipeline: vi.fn((items: unknown[]) => ({
    output: items,
    stats: { filters: [] },
  })),
  printPipelineStats: vi.fn(),
  GROUP_FILTERS: [],
  UNGROUPED_MARKET_FILTERS: [],
  createLlmPreFilter: vi.fn(() => []),
  checkExistingConditions: vi.fn(),
}));

import {
  computeMetadataUpdates,
  computeGroupMetadataUpdates,
  groupMarkets,
} from '../generate/grouping';
import { checkExistingConditions } from '../generate/pipeline';
import type { ExistingCondition } from '../generate/pipeline';

const mockCheckExisting = vi.mocked(checkExistingConditions);
const API_URL = 'https://test-api.example.com';

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchEventTags.mockResolvedValue(new Map());
});

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
    events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones' }],
    ...overrides,
  };
}

/**
 * Build an `ExistingCondition` matching what the generate pipeline WOULD
 * have written on initial create — so tests can assert "no drift" vs
 * "this specific field drifted" without restating defaults.
 */
function existingFromMarket(
  market: PolymarketMarket,
  overrides: Partial<ExistingCondition> = {}
): ExistingCondition {
  const eventSlug = market.events?.[0]?.slug;
  const eventTitle = market.events?.[0]?.title;
  const similarMarkets = eventSlug
    ? [`https://polymarket.com/event/${eventSlug}#${market.slug}`]
    : [];
  return {
    endTime: 1700000000,
    question: market.question,
    shortName: market.question,
    description: market.description || '',
    similarMarkets,
    tags: [],
    similarMarketVolume: parseFloat(market.volume || '0') || 0,
    similarMarketImage: market.image,
    groupName: eventTitle,
    conditionGroupNegRisk: false,
    ...overrides,
  };
}

/**
 * Synthesize the `groups[]` arg the diff helpers expect: each market becomes
 * a one-market group keyed off its parent event. Mirrors what groupMarkets()
 * builds in the generate path and what refresh-metadata builds at runtime.
 */
function synthesizeGroups(markets: PolymarketMarket[]): Array<{
  title: string;
  markets: PolymarketMarket[];
  eventSlug?: string;
}> {
  return markets.map((m) => ({
    title: m.events?.[0]?.title ?? '',
    markets: [m],
    eventSlug: m.events?.[0]?.slug,
  }));
}

function runDiff(
  markets: PolymarketMarket[],
  existing: Map<string, ExistingCondition>,
  eventTagMap: Map<string, string[]> = new Map()
) {
  const groups = synthesizeGroups(markets);
  return {
    metadataUpdates: computeMetadataUpdates(
      markets,
      groups,
      existing,
      eventTagMap
    ),
    groupMetadataUpdates: computeGroupMetadataUpdates(groups, existing),
  };
}

describe('computeMetadataUpdates', () => {
  it('detects question change on existing condition and rewrites shortName via regex', () => {
    const market = makeMarket({
      conditionId: '0xaaa',
      question: 'Bitcoin above $150k?', // matches cryptoThresholdMatch regex
    });

    const existing = new Map([
      [
        '0xaaa',
        existingFromMarket(market, {
          question: 'Bitcoin above $100k?',
          shortName: 'BTC >$100k',
        }),
      ],
    ]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(1);
    expect(metadataUpdates[0].conditionId).toBe('0xaaa');
    expect(metadataUpdates[0].fields.question).toBe('Bitcoin above $150k?');
    expect(metadataUpdates[0].fields.shortName).toBe('BTC >$150k');
    expect(metadataUpdates[0].old.shortName).toBe('BTC >$100k');
  });

  it('does not rewrite shortName to question when regex does not match', () => {
    // Guards against the regression where freshShort fell back to question,
    // overwriting nice LLM-generated shortNames with verbose questions.
    const market = makeMarket({
      conditionId: '0xnoregex',
      question: 'Will the next Prime Minister of Hungary be Viktor Orban?',
    });

    const existing = new Map([
      [
        '0xnoregex',
        existingFromMarket(market, { shortName: 'Orban wins Hungary' }),
      ],
    ]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(0);
  });

  it('detects group name change on existing condition', () => {
    const market = makeMarket({
      conditionId: '0xbbb',
      question: 'Will ETH hit 10k?',
      events: [{ title: 'Ethereum Price Targets 2025', slug: 'eth-targets' }],
    });

    const existing = new Map([
      [
        '0xbbb',
        existingFromMarket(market, { groupName: 'Ethereum Price Targets' }),
      ],
    ]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(1);
    expect(metadataUpdates[0].fields).toEqual({
      groupName: 'Ethereum Price Targets 2025',
    });
    expect(metadataUpdates[0].old).toEqual({
      groupName: 'Ethereum Price Targets',
    });
  });

  it('detects similarMarkets URL change when event slug changes', () => {
    const market = makeMarket({
      conditionId: '0xslug',
      slug: 'btc-100k',
      events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones-v2' }],
    });

    const existing = new Map([
      [
        '0xslug',
        existingFromMarket(market, {
          similarMarkets: [
            'https://polymarket.com/event/btc-milestones#btc-100k',
          ],
        }),
      ],
    ]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(1);
    expect(metadataUpdates[0].fields.similarMarkets).toEqual([
      'https://polymarket.com/event/btc-milestones-v2#btc-100k',
    ]);
    expect(metadataUpdates[0].old.similarMarkets).toEqual([
      'https://polymarket.com/event/btc-milestones#btc-100k',
    ]);
  });

  it('detects similarMarkets URL change when market slug changes', () => {
    const market = makeMarket({
      conditionId: '0xmslug',
      slug: 'will-btc-reach-100k',
      events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones' }],
    });

    const existing = new Map([
      [
        '0xmslug',
        existingFromMarket(market, {
          similarMarkets: [
            'https://polymarket.com/event/btc-milestones#will-btc-hit-100k',
          ],
        }),
      ],
    ]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(1);
    expect(metadataUpdates[0].fields.similarMarkets).toEqual([
      'https://polymarket.com/event/btc-milestones#will-btc-reach-100k',
    ]);
  });

  it('detects description change', () => {
    const market = makeMarket({
      conditionId: '0xdesc',
      description: 'Updated description from Polymarket',
    });

    const existing = new Map([
      [
        '0xdesc',
        existingFromMarket(market, { description: 'Old description' }),
      ],
    ]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(1);
    expect(metadataUpdates[0].fields.description).toBe(
      'Updated description from Polymarket'
    );
  });

  it('detects tags change', () => {
    const eventTagMap = new Map([
      ['btc-milestones', ['crypto', 'btc', 'price']],
    ]);
    const market = makeMarket({ conditionId: '0xtags' });

    const existing = new Map([
      ['0xtags', existingFromMarket(market, { tags: ['crypto', 'btc'] })],
    ]);

    const { metadataUpdates } = runDiff([market], existing, eventTagMap);

    expect(metadataUpdates).toHaveLength(1);
    expect(metadataUpdates[0].fields.tags).toEqual(['crypto', 'btc', 'price']);
  });

  it('treats tags as order-insensitive (no spurious update)', () => {
    const eventTagMap = new Map([
      ['btc-milestones', ['crypto', 'btc', 'price']],
    ]);
    const market = makeMarket({ conditionId: '0xordered' });

    const existing = new Map([
      [
        '0xordered',
        existingFromMarket(market, { tags: ['price', 'crypto', 'btc'] }),
      ],
    ]);

    const { metadataUpdates } = runDiff([market], existing, eventTagMap);

    expect(metadataUpdates).toHaveLength(0);
  });

  it('skips unchanged conditions', () => {
    const market = makeMarket({ conditionId: '0xddd' });

    const existing = new Map([['0xddd', existingFromMarket(market)]]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(0);
  });

  it('returns no updates for new conditions (not in existingIds)', () => {
    const market = makeMarket({ conditionId: '0xeee' });

    const { metadataUpdates } = runDiff([market], new Map());

    expect(metadataUpdates).toHaveLength(0);
  });

  it('backfills every syncable field when existing condition is sparse', () => {
    const market = makeMarket({
      conditionId: '0xfff',
      question: 'Some question?',
      events: [{ title: 'Some Group', slug: 'some-group' }],
    });

    const existing = new Map<string, ExistingCondition>([
      [
        '0xfff',
        {
          endTime: 1700000000,
        },
      ],
    ]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(1);
    const update = metadataUpdates[0];
    expect(update.conditionId).toBe('0xfff');
    expect(update.fields.question).toBe('Some question?');
    expect(update.fields.groupName).toBe('Some Group');
    expect(update.fields.description).toBe('A test market');
    expect(update.fields.similarMarkets).toEqual([
      'https://polymarket.com/event/some-group#btc-100k',
    ]);
    expect(update.fields.similarMarketVolume).toBe(100000);
    expect(update.fields.shortName).toBeUndefined();
  });

  it('handles multiple conditions with mixed updates', () => {
    const markets = [
      makeMarket({
        conditionId: '0x111',
        question: 'Changed question?',
        events: [{ title: 'Same Group', slug: 'g1' }],
      }),
      makeMarket({
        conditionId: '0x222',
        question: 'Unchanged question?',
        events: [{ title: 'Same Group 2', slug: 'g2' }],
      }),
      makeMarket({
        conditionId: '0x333',
        question: 'Brand new market?',
        events: [{ title: 'New Group', slug: 'g3' }],
      }),
    ];

    const existing = new Map([
      [
        '0x111',
        existingFromMarket(markets[0], {
          question: 'Old question?',
          shortName: 'Old question?',
        }),
      ],
      ['0x222', existingFromMarket(markets[1])],
    ]);

    const { metadataUpdates } = runDiff(markets, existing);

    expect(metadataUpdates).toHaveLength(1);
    expect(metadataUpdates[0].conditionId).toBe('0x111');
    expect(metadataUpdates[0].fields.question).toBe('Changed question?');
    expect(metadataUpdates[0].fields.shortName).toBeUndefined();
  });

  it('backfills optionName on existing condition that predates the column', () => {
    const market = makeMarket({
      conditionId: '0xbackfill',
      question: 'Will the next Prime Minister of Hungary be Viktor Orban?',
      groupItemTitle: 'Viktor Orban',
    });

    const existing = new Map([
      ['0xbackfill', existingFromMarket(market, { optionName: undefined })],
    ]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(1);
    expect(metadataUpdates[0].fields.optionName).toBe('Viktor Orban');
    expect(metadataUpdates[0].old.optionName).toBeUndefined();
  });

  it('detects optionName drift when Polymarket renames groupItemTitle', () => {
    const market = makeMarket({
      conditionId: '0xrename',
      question: 'Will Bitcoin reach $150k in April?',
      groupItemTitle: '↑ 150,000',
    });

    const existing = new Map([
      ['0xrename', existingFromMarket(market, { optionName: 'BTC 150k' })],
    ]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(1);
    expect(metadataUpdates[0].fields.optionName).toBe('↑ 150,000');
    expect(metadataUpdates[0].old.optionName).toBe('BTC 150k');
  });

  it('does not emit optionName update when groupItemTitle already matches', () => {
    const market = makeMarket({
      conditionId: '0xmatch',
      question: 'Will the next Prime Minister of Hungary be Viktor Orban?',
      groupItemTitle: 'Viktor Orban',
    });

    const existing = new Map([
      ['0xmatch', existingFromMarket(market, { optionName: 'Viktor Orban' })],
    ]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(0);
  });

  it('does not clear optionName when Polymarket drops groupItemTitle', () => {
    const market = makeMarket({
      conditionId: '0xdrop',
      groupItemTitle: undefined,
    });

    const existing = new Map([
      ['0xdrop', existingFromMarket(market, { optionName: 'Viktor Orban' })],
    ]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(0);
  });

  it('does not clear a field when fresh Polymarket value is missing', () => {
    const market = makeMarket({ conditionId: '0xnoimg', image: undefined });

    const existing = new Map([
      [
        '0xnoimg',
        existingFromMarket(market, {
          similarMarketImage: 'https://existing-image.png',
        }),
      ],
    ]);

    const { metadataUpdates } = runDiff([market], existing);

    expect(metadataUpdates).toHaveLength(0);
  });
});

describe('computeGroupMetadataUpdates', () => {
  it('flips ConditionGroup.negRisk to true when fresh markets share a basket', () => {
    const market = makeMarket({
      conditionId: '0xbasket',
      events: [
        {
          title: 'NBA champion',
          slug: 'nba-champion',
          negRisk: true,
          negRiskMarketId: 'basket-a',
        },
      ],
    });

    const existing = new Map([
      [
        '0xbasket',
        existingFromMarket(market, {
          conditionGroupId: 7,
          conditionGroupNegRisk: false,
        }),
      ],
    ]);

    const { groupMetadataUpdates } = runDiff([market], existing);

    expect(groupMetadataUpdates).toHaveLength(1);
    expect(groupMetadataUpdates[0].groupId).toBe(7);
    expect(groupMetadataUpdates[0].fields.negRisk).toBe(true);
    expect(groupMetadataUpdates[0].fields.negRiskMarketId).toBe('basket-a');
    expect(groupMetadataUpdates[0].old.negRisk).toBe(false);
  });

  it('flips ConditionGroup.negRisk to false and clears the basket id when fresh markets no longer agree', () => {
    const market = makeMarket({
      conditionId: '0xnobasket',
      events: [{ title: 'NBA champion', slug: 'nba-champion' }],
    });

    const existing = new Map([
      [
        '0xnobasket',
        existingFromMarket(market, {
          conditionGroupId: 9,
          conditionGroupNegRisk: true,
        }),
      ],
    ]);

    const { groupMetadataUpdates } = runDiff([market], existing);

    expect(groupMetadataUpdates).toHaveLength(1);
    expect(groupMetadataUpdates[0].groupId).toBe(9);
    expect(groupMetadataUpdates[0].fields.negRisk).toBe(false);
    expect(groupMetadataUpdates[0].fields.negRiskMarketId).toBeNull();
  });

  it('detects stored group URL using the broken polymarket.com#slug format', () => {
    const market = makeMarket({
      conditionId: '0xfmt',
      slug: 'btc-100k',
      events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones' }],
    });

    const existing = new Map([
      [
        '0xfmt',
        existingFromMarket(market, {
          conditionGroupId: 42,
          conditionGroupSimilarMarkets: [
            'https://polymarket.com#btc-milestones',
          ],
        }),
      ],
    ]);

    const { groupMetadataUpdates } = runDiff([market], existing);

    expect(groupMetadataUpdates).toHaveLength(1);
    expect(groupMetadataUpdates[0].groupId).toBe(42);
    expect(groupMetadataUpdates[0].fields.similarMarkets).toEqual([
      'https://polymarket.com/event/btc-milestones#btc-100k',
    ]);
    expect(groupMetadataUpdates[0].old.similarMarkets).toEqual([
      'https://polymarket.com#btc-milestones',
    ]);
  });

  it('detects stored group URL when Polymarket renames the event slug', () => {
    const market = makeMarket({
      conditionId: '0xrenamed',
      slug: 'btc-100k',
      events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones-v2' }],
    });

    const existing = new Map([
      [
        '0xrenamed',
        existingFromMarket(market, {
          conditionGroupId: 100,
          conditionGroupSimilarMarkets: [
            'https://polymarket.com/event/btc-milestones#btc-100k',
          ],
        }),
      ],
    ]);

    const { groupMetadataUpdates } = runDiff([market], existing);

    expect(groupMetadataUpdates).toHaveLength(1);
    expect(groupMetadataUpdates[0].groupId).toBe(100);
    expect(groupMetadataUpdates[0].fields.similarMarkets).toEqual([
      'https://polymarket.com/event/btc-milestones-v2#btc-100k',
    ]);
  });

  it('emits no update when group similarMarkets is already current', () => {
    const market = makeMarket({
      conditionId: '0xcurrent',
      slug: 'btc-100k',
      events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones' }],
    });

    const existing = new Map([
      [
        '0xcurrent',
        existingFromMarket(market, {
          conditionGroupId: 7,
          conditionGroupSimilarMarkets: [
            'https://polymarket.com/event/btc-milestones#btc-100k',
          ],
        }),
      ],
    ]);

    const { groupMetadataUpdates } = runDiff([market], existing);

    expect(groupMetadataUpdates).toHaveLength(0);
  });

  it('emits no group update when the condition is not yet linked to a group', () => {
    const market = makeMarket({
      conditionId: '0xnogroup',
      events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones' }],
    });

    const existing = new Map([
      [
        '0xnogroup',
        existingFromMarket(market, {
          conditionGroupId: undefined,
          conditionGroupSimilarMarkets: undefined,
        }),
      ],
    ]);

    const { groupMetadataUpdates } = runDiff([market], existing);

    expect(groupMetadataUpdates).toHaveLength(0);
  });

  it('emits no group update for a brand new condition', () => {
    const market = makeMarket({ conditionId: '0xnew' });

    const { groupMetadataUpdates } = runDiff([market], new Map());

    expect(groupMetadataUpdates).toHaveLength(0);
  });

  it('does not clear an existing group URL when Polymarket returns no event slug', () => {
    const market = makeMarket({ conditionId: '0xnoevent', events: undefined });

    const existing = new Map([
      [
        '0xnoevent',
        existingFromMarket(market, {
          conditionGroupId: 55,
          conditionGroupSimilarMarkets: [
            'https://polymarket.com/event/something-old#something-old',
          ],
        }),
      ],
    ]);

    const { groupMetadataUpdates } = runDiff([market], existing);

    expect(groupMetadataUpdates).toHaveLength(0);
  });
});

// `groupMarkets` itself still owns transformToSapienceCondition routing for
// new conditions. These cases test the create path, not the diff helpers.
describe('groupMarkets new-condition routing', () => {
  it('routes groupItemTitle into optionName (not shortName) for new conditions', async () => {
    const market = makeMarket({
      conditionId: '0xgit',
      question: 'Will the next Prime Minister of Hungary be Viktor Orban?',
      groupItemTitle: 'Viktor Orban',
    });

    mockCheckExisting.mockResolvedValue(new Map());

    const result = await groupMarkets([market], API_URL);
    const condition = result.groups[0]?.conditions[0];
    expect(condition).toBeDefined();
    expect(condition.optionName).toBe('Viktor Orban');
    expect(condition.shortName).toBe(
      'Will the next Prime Minister of Hungary be Viktor Orban?'
    );
  });

  it('never uses groupItemTitle as shortName on new conditions', async () => {
    const market = makeMarket({
      conditionId: '0xprio',
      question: 'Bitcoin above $200k?',
      groupItemTitle: 'BTC 200k',
    });

    mockCheckExisting.mockResolvedValue(new Map());

    const result = await groupMarkets([market], API_URL);
    const condition = result.groups[0]?.conditions[0];
    expect(condition).toBeDefined();
    expect(condition.optionName).toBe('BTC 200k');
    expect(condition.shortName).not.toBe('BTC 200k');
    expect(condition.shortName).toBe('Bitcoin above $200k?');
  });

  it('forces sibling conditions sharing an event title onto the majority category', async () => {
    // Three sibling markets in "Champions League QF" — two LLM-classified as
    // sports, one as culture. Expected outcome: all three (and all three
    // single-market groups) end up tagged sports after the uniformity pass.
    // Without that pass the DB ConditionGroup gets whichever sibling submits
    // first as its category, and the other siblings disagree.
    const markets = [
      makeMarket({
        conditionId: '0xa',
        question: 'Will Real Madrid beat Arsenal?',
        events: [{ title: 'Champions League QF', slug: 'ucl-qf' }],
      }),
      makeMarket({
        conditionId: '0xb',
        question: 'Will Barcelona beat PSG?',
        events: [{ title: 'Champions League QF', slug: 'ucl-qf' }],
      }),
      makeMarket({
        conditionId: '0xc',
        question: 'Will the halftime musician forget the lyrics?',
        events: [{ title: 'Champions League QF', slug: 'ucl-qf' }],
      }),
    ];

    mockCheckExisting.mockResolvedValue(new Map());

    const result = await groupMarkets(markets, API_URL);

    // All three should land in three keeper-side groups sharing the title.
    const titleGroups = result.groups.filter(
      (g) => g.title === 'Champions League QF'
    );
    expect(titleGroups).toHaveLength(3);

    // Two markets have sports-style questions, one has a culture-style
    // question. inferSapienceCategorySlug (the LLM-disabled fallback used
    // here) returns 'sports' for the first two and 'culture' for the third,
    // so the majority is sports. After the uniformity pass, all three
    // groups + their conditions agree on sports.
    const categories = titleGroups.map((g) => g.categorySlug);
    expect(new Set(categories).size).toBe(1);

    const conditionCategories = titleGroups.flatMap((g) =>
      g.conditions.map((c) => c.categorySlug)
    );
    expect(new Set(conditionCategories).size).toBe(1);
    expect(conditionCategories[0]).toBe(categories[0]);
  });

  it('marks event siblings as a negRisk group only when they share one negRiskMarketId', async () => {
    const events = [
      {
        id: 'event-1',
        title: 'NBA champion',
        slug: 'nba-champion',
        negRisk: true,
        negRiskMarketId: 'basket-123',
      },
    ];
    const markets = [
      makeMarket({ conditionId: '0xa', question: 'Will Celtics win?', events }),
      makeMarket({ conditionId: '0xb', question: 'Will Knicks win?', events }),
    ];

    mockCheckExisting.mockResolvedValue(new Map());

    const result = await groupMarkets(markets, API_URL);
    const groups = result.groups.filter((g) => g.title === 'NBA champion');

    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.negRisk === true)).toBe(true);
    expect(groups.every((g) => g.negRiskMarketId === 'basket-123')).toBe(true);
    expect(
      groups
        .flatMap((g) => g.conditions)
        .every((c) => c.negRisk === true && c.negRiskMarketId === 'basket-123')
    ).toBe(true);
  });

  it('segments same-title negRisk markets by negRiskMarketId instead of downgrading them', async () => {
    const markets = [
      makeMarket({
        conditionId: '0xa',
        question: 'Will Celtics win?',
        events: [
          {
            id: 'event-1',
            title: 'NBA champion',
            slug: 'nba-champion',
            negRisk: true,
            negRiskMarketId: 'basket-a',
          },
        ],
      }),
      makeMarket({
        conditionId: '0xb',
        question: 'Will Knicks win?',
        events: [
          {
            id: 'event-1',
            title: 'NBA champion',
            slug: 'nba-champion',
            negRisk: true,
            negRiskMarketId: 'basket-b',
          },
        ],
      }),
    ];

    mockCheckExisting.mockResolvedValue(new Map());

    const result = await groupMarkets(markets, API_URL);
    const groups = result.groups.filter((g) =>
      g.title.startsWith('NBA champion')
    );

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.title).sort()).toEqual([
      'NBA champion (basket-a)',
      'NBA champion (basket-b)',
    ]);
    expect(groups.map((g) => g.negRiskMarketId).sort()).toEqual([
      'basket-a',
      'basket-b',
    ]);
    expect(groups.every((g) => g.negRisk === true)).toBe(true);
    expect(
      groups
        .flatMap((g) => g.conditions)
        .map((c) => c.negRiskMarketId)
        .sort()
    ).toEqual(['basket-a', 'basket-b']);
    expect(
      groups.flatMap((g) => g.conditions).every((c) => c.negRisk === true)
    ).toBe(true);
  });

  it('leaves a single-condition group alone (no siblings to vote against)', async () => {
    const market = makeMarket({
      conditionId: '0xsolo',
      question: 'Will the halftime musician forget the lyrics?',
      events: [{ title: 'Some Solo Event', slug: 'solo' }],
    });

    mockCheckExisting.mockResolvedValue(new Map());

    const result = await groupMarkets([market], API_URL);
    const group = result.groups[0];
    expect(group).toBeDefined();
    // Single-condition bucket — vote returns that one condition's category.
    expect(group.categorySlug).toBe(group.conditions[0].categorySlug);
  });
});
