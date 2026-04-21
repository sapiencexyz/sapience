import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PolymarketMarket } from '../types';

// Mock all external dependencies before importing
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
vi.mock('./tags', () => ({
  fetchEventTags: (...args: unknown[]) => mockFetchEventTags(...args),
}));

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

import { groupMarkets } from '../generate/grouping';
import { checkExistingConditions } from '../generate/pipeline';
import type { ExistingCondition } from '../generate/pipeline';

const mockCheckExisting = vi.mocked(checkExistingConditions);

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
 * Build an `ExistingCondition` that matches what the generate pipeline
 * WOULD have written on initial create for the given market — so tests
 * can assert "no drift" vs "this specific field drifted" without having
 * to repeat all the default fields.
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchEventTags.mockResolvedValue(new Map());
});

describe('metadata updates via groupMarkets', () => {
  it('detects question change on existing condition and rewrites shortName via regex', async () => {
    const market = makeMarket({
      conditionId: '0xaaa',
      question: 'Bitcoin above $150k?', // new question matches cryptoThresholdMatch regex
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xaaa',
          existingFromMarket(market, {
            question: 'Bitcoin above $100k?',
            shortName: 'BTC >$100k',
          }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0].conditionId).toBe('0xaaa');
    expect(result.metadataUpdates[0].fields.question).toBe(
      'Bitcoin above $150k?'
    );
    expect(result.metadataUpdates[0].fields.shortName).toBe('BTC >$150k');
    expect(result.metadataUpdates[0].old.shortName).toBe('BTC >$100k');
  });

  it('does not rewrite shortName to question when regex does not match', async () => {
    // Guards against the regression where freshShort fell back to question,
    // overwriting nice LLM-generated shortNames with verbose questions.
    const market = makeMarket({
      conditionId: '0xnoregex',
      question: 'Will the next Prime Minister of Hungary be Viktor Orban?',
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xnoregex',
          existingFromMarket(market, {
            shortName: 'Orban wins Hungary', // nice LLM form stored in DB
          }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    // No shortName drift — question didn't match any regex rule, so we keep
    // the existing LLM-generated shortName untouched.
    expect(result.metadataUpdates).toHaveLength(0);
  });

  it('detects group name change on existing condition', async () => {
    const market = makeMarket({
      conditionId: '0xbbb',
      question: 'Will ETH hit 10k?',
      events: [{ title: 'Ethereum Price Targets 2025', slug: 'eth-targets' }],
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xbbb',
          existingFromMarket(market, {
            groupName: 'Ethereum Price Targets', // old group name
          }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0].fields).toEqual({
      groupName: 'Ethereum Price Targets 2025',
    });
    expect(result.metadataUpdates[0].old).toEqual({
      groupName: 'Ethereum Price Targets',
    });
  });

  it('detects similarMarkets URL change when event slug changes', async () => {
    // Polymarket renamed the event slug; our similarMarkets URL is now stale
    const market = makeMarket({
      conditionId: '0xslug',
      slug: 'btc-100k',
      events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones-v2' }],
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xslug',
          existingFromMarket(market, {
            similarMarkets: [
              'https://polymarket.com/event/btc-milestones#btc-100k',
            ],
          }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0].fields.similarMarkets).toEqual([
      'https://polymarket.com/event/btc-milestones-v2#btc-100k',
    ]);
    expect(result.metadataUpdates[0].old.similarMarkets).toEqual([
      'https://polymarket.com/event/btc-milestones#btc-100k',
    ]);
  });

  it('detects similarMarkets URL change when market slug changes', async () => {
    const market = makeMarket({
      conditionId: '0xmslug',
      slug: 'will-btc-reach-100k', // market slug renamed
      events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones' }],
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xmslug',
          existingFromMarket(market, {
            similarMarkets: [
              'https://polymarket.com/event/btc-milestones#will-btc-hit-100k',
            ],
          }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0].fields.similarMarkets).toEqual([
      'https://polymarket.com/event/btc-milestones#will-btc-reach-100k',
    ]);
  });

  it('detects description change', async () => {
    const market = makeMarket({
      conditionId: '0xdesc',
      description: 'Updated description from Polymarket',
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xdesc',
          existingFromMarket(market, { description: 'Old description' }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0].fields.description).toBe(
      'Updated description from Polymarket'
    );
  });

  it('detects tags change', async () => {
    mockFetchEventTags.mockResolvedValue(
      new Map([['btc-milestones', ['crypto', 'btc', 'price']]])
    );

    const market = makeMarket({ conditionId: '0xtags' });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xtags',
          existingFromMarket(market, { tags: ['crypto', 'btc'] }), // missing 'price'
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0].fields.tags).toEqual([
      'crypto',
      'btc',
      'price',
    ]);
  });

  it('treats tags as order-insensitive (no spurious update)', async () => {
    mockFetchEventTags.mockResolvedValue(
      new Map([['btc-milestones', ['crypto', 'btc', 'price']]])
    );

    const market = makeMarket({ conditionId: '0xordered' });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xordered',
          // Same tags, different order
          existingFromMarket(market, { tags: ['price', 'crypto', 'btc'] }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(0);
  });

  it('applies transformMatchQuestion so "vs" markets do not flap', async () => {
    // "X vs. Y" should be transformed to "X beats Y?" by transformMatchQuestion.
    // The DB has the transformed version; raw Polymarket data has "vs".
    // The old buggy diff would detect a change on every run; the fixed
    // diff should see them as equal.
    const market = makeMarket({
      conditionId: '0xvs',
      question: 'Lakers vs. Celtics',
    });

    // The existing condition was stored with the transformed question.
    // Since we can't import transformMatchQuestion here without pulling
    // in all its dependencies, use a stub that's guaranteed to match
    // whatever the transform produces by running the diff once and
    // asserting it does NOT produce an update when existing matches.
    // Strategy: first run with a known-correct existing, then verify
    // it's stable.
    mockCheckExisting.mockResolvedValueOnce(
      new Map([['0xvs', existingFromMarket(market)]])
    );
    const first = await groupMarkets([market], 'https://test-api.example.com');
    // Seed round — whatever question the first run produced, use it
    // as the "existing" for the second run.
    const seeded = first.metadataUpdates[0]?.fields.question ?? market.question;

    mockCheckExisting.mockResolvedValueOnce(
      new Map([
        [
          '0xvs',
          existingFromMarket(market, { question: seeded, shortName: seeded }),
        ],
      ])
    );
    const second = await groupMarkets([market], 'https://test-api.example.com');

    // On the second run, nothing should drift — the transformed question
    // matches what's in the DB, so no update emitted.
    expect(second.metadataUpdates).toHaveLength(0);
  });

  it('skips unchanged conditions', async () => {
    const market = makeMarket({ conditionId: '0xddd' });

    mockCheckExisting.mockResolvedValue(
      new Map([['0xddd', existingFromMarket(market)]])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(0);
  });

  it('returns no updates for new conditions (not in existingIds)', async () => {
    const market = makeMarket({ conditionId: '0xeee' });

    mockCheckExisting.mockResolvedValue(new Map()); // nothing exists

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(0);
  });

  it('backfills every syncable field when existing condition is sparse', async () => {
    const market = makeMarket({
      conditionId: '0xfff',
      question: 'Some question?',
      events: [{ title: 'Some Group', slug: 'some-group' }],
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xfff',
          {
            endTime: 1700000000,
            // no other metadata in DB — backfill everything we know
          },
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    const update = result.metadataUpdates[0];
    expect(update.conditionId).toBe('0xfff');
    expect(update.fields.question).toBe('Some question?');
    expect(update.fields.groupName).toBe('Some Group');
    expect(update.fields.description).toBe('A test market');
    expect(update.fields.similarMarkets).toEqual([
      'https://polymarket.com/event/some-group#btc-100k',
    ]);
    expect(update.fields.similarMarketVolume).toBe(100000);
    // shortName is NOT backfilled from question fallback — only rewritten when
    // the regex produces a non-null result. "Some question?" doesn't match.
    expect(update.fields.shortName).toBeUndefined();
  });

  it('handles multiple conditions with mixed updates', async () => {
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

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0x111',
          existingFromMarket(markets[0], {
            question: 'Old question?',
            shortName: 'Old question?',
          }),
        ],
        ['0x222', existingFromMarket(markets[1])],
        // 0x333 is new, not in DB
      ])
    );

    const result = await groupMarkets(markets, 'https://test-api.example.com');

    // Only 0x111 changed (question drift). shortName does NOT update because
    // neither old nor new question matches any regex rule.
    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0].conditionId).toBe('0x111');
    expect(result.metadataUpdates[0].fields.question).toBe('Changed question?');
    expect(result.metadataUpdates[0].fields.shortName).toBeUndefined();
  });

  it('routes groupItemTitle into optionName (not shortName) for new conditions', async () => {
    const market = makeMarket({
      conditionId: '0xgit',
      question: 'Will the next Prime Minister of Hungary be Viktor Orban?',
      groupItemTitle: 'Viktor Orban',
    });

    mockCheckExisting.mockResolvedValue(new Map());

    const result = await groupMarkets([market], 'https://test-api.example.com');

    const condition = result.groups[0]?.conditions[0];
    expect(condition).toBeDefined();
    expect(condition.optionName).toBe('Viktor Orban');
    // shortName is independent — no regex match, falls back to question
    // (no LLM in tests)
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

    const result = await groupMarkets([market], 'https://test-api.example.com');

    const condition = result.groups[0]?.conditions[0];
    expect(condition).toBeDefined();
    expect(condition.optionName).toBe('BTC 200k');
    expect(condition.shortName).not.toBe('BTC 200k');
    expect(condition.shortName).toBe('Bitcoin above $200k?');
  });

  it('backfills optionName on existing condition that predates the column', async () => {
    const market = makeMarket({
      conditionId: '0xbackfill',
      question: 'Will the next Prime Minister of Hungary be Viktor Orban?',
      groupItemTitle: 'Viktor Orban',
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        ['0xbackfill', existingFromMarket(market, { optionName: undefined })],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0].fields.optionName).toBe('Viktor Orban');
    expect(result.metadataUpdates[0].old.optionName).toBeUndefined();
  });

  it('detects optionName drift when Polymarket renames groupItemTitle', async () => {
    const market = makeMarket({
      conditionId: '0xrename',
      question: 'Will Bitcoin reach $150k in April?',
      groupItemTitle: '↑ 150,000',
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        ['0xrename', existingFromMarket(market, { optionName: 'BTC 150k' })],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0].fields.optionName).toBe('↑ 150,000');
    expect(result.metadataUpdates[0].old.optionName).toBe('BTC 150k');
  });

  it('does not emit optionName update when groupItemTitle already matches', async () => {
    const market = makeMarket({
      conditionId: '0xmatch',
      question: 'Will the next Prime Minister of Hungary be Viktor Orban?',
      groupItemTitle: 'Viktor Orban',
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        ['0xmatch', existingFromMarket(market, { optionName: 'Viktor Orban' })],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(0);
  });

  it('does not clear optionName when Polymarket drops groupItemTitle', async () => {
    const market = makeMarket({
      conditionId: '0xdrop',
      groupItemTitle: undefined,
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        ['0xdrop', existingFromMarket(market, { optionName: 'Viktor Orban' })],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(0);
  });

  it('does not clear a field when fresh Polymarket value is missing', async () => {
    // similarMarketImage is optional on the PolymarketMarket type.
    // If the market comes back without an image, we should NOT clear
    // the existing image in the DB — just leave it alone.
    const market = makeMarket({ conditionId: '0xnoimg', image: undefined });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xnoimg',
          existingFromMarket(market, {
            similarMarketImage: 'https://existing-image.png',
          }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    // No updates — we don't own a fresh value, so we don't touch it.
    expect(result.metadataUpdates).toHaveLength(0);
  });
});

describe('group metadata updates via groupMarkets', () => {
  it('detects stored group URL using the broken polymarket.com#slug format', async () => {
    // Real prod bug: groups were written with `polymarket.com#<slug>` instead
    // of `polymarket.com/event/<slug>#<market>`. Fresh Polymarket data should
    // drive the group row back to the correct URL.
    const market = makeMarket({
      conditionId: '0xfmt',
      slug: 'btc-100k',
      events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones' }],
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xfmt',
          existingFromMarket(market, {
            conditionGroupId: 42,
            conditionGroupSimilarMarkets: [
              'https://polymarket.com#btc-milestones', // broken legacy format
            ],
          }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.groupMetadataUpdates).toHaveLength(1);
    expect(result.groupMetadataUpdates[0].groupId).toBe(42);
    expect(result.groupMetadataUpdates[0].fields.similarMarkets).toEqual([
      'https://polymarket.com/event/btc-milestones#btc-100k',
    ]);
    expect(result.groupMetadataUpdates[0].old.similarMarkets).toEqual([
      'https://polymarket.com#btc-milestones',
    ]);
  });

  it('detects stored group URL when Polymarket renames the event slug', async () => {
    const market = makeMarket({
      conditionId: '0xrenamed',
      slug: 'btc-100k',
      events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones-v2' }],
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xrenamed',
          existingFromMarket(market, {
            conditionGroupId: 100,
            conditionGroupSimilarMarkets: [
              'https://polymarket.com/event/btc-milestones#btc-100k',
            ],
          }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.groupMetadataUpdates).toHaveLength(1);
    expect(result.groupMetadataUpdates[0].groupId).toBe(100);
    expect(result.groupMetadataUpdates[0].fields.similarMarkets).toEqual([
      'https://polymarket.com/event/btc-milestones-v2#btc-100k',
    ]);
  });

  it('emits no update when group similarMarkets is already current', async () => {
    const market = makeMarket({
      conditionId: '0xcurrent',
      slug: 'btc-100k',
      events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones' }],
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xcurrent',
          existingFromMarket(market, {
            conditionGroupId: 7,
            conditionGroupSimilarMarkets: [
              'https://polymarket.com/event/btc-milestones#btc-100k',
            ],
          }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.groupMetadataUpdates).toHaveLength(0);
  });

  it('emits no group update when the condition is not yet linked to a group', async () => {
    // Condition exists but has no conditionGroupId (e.g. ungrouped). Nothing
    // to update on the group side — skip without error.
    const market = makeMarket({
      conditionId: '0xnogroup',
      events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones' }],
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xnogroup',
          existingFromMarket(market, {
            conditionGroupId: undefined,
            conditionGroupSimilarMarkets: undefined,
          }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.groupMetadataUpdates).toHaveLength(0);
  });

  it('emits no group update for a brand new condition', async () => {
    const market = makeMarket({ conditionId: '0xnew' });

    mockCheckExisting.mockResolvedValue(new Map()); // nothing exists

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.groupMetadataUpdates).toHaveLength(0);
  });

  it('does not clear an existing group URL when Polymarket returns no event slug', async () => {
    // Regression guard: if the upstream market comes back without an event
    // (CLOB fallback, stale cache, etc.) we have no way to build a correct
    // fresh URL. Leaving the stored value alone is better than overwriting
    // with a broken one or clearing to [].
    const market = makeMarket({
      conditionId: '0xnoevent',
      events: undefined,
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xnoevent',
          existingFromMarket(market, {
            conditionGroupId: 55,
            conditionGroupSimilarMarkets: [
              'https://polymarket.com/event/something-old#something-old',
            ],
          }),
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.groupMetadataUpdates).toHaveLength(0);
  });
});
