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

vi.mock('../llm', () => ({
  enrichMarketsWithLLM: vi.fn().mockResolvedValue(new Map()),
  enrichEndTimesWithLLM: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('./tags', () => ({
  fetchEventTags: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../generate/tags', () => ({
  fetchEventTags: vi.fn().mockResolvedValue(new Map()),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('metadata updates via groupMarkets', () => {
  it('detects question change on existing condition', async () => {
    const market = makeMarket({
      conditionId: '0xaaa',
      question: 'Will BTC hit 150k?', // new question from Polymarket
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xaaa',
          {
            endTime: 1700000000,
            question: 'Will BTC hit 100k?', // old question in DB
            groupName: 'Bitcoin Milestones',
          },
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0]).toEqual({
      conditionId: '0xaaa',
      fields: { question: 'Will BTC hit 150k?' },
      old: { question: 'Will BTC hit 100k?' },
    });
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
          {
            endTime: 1700000000,
            question: 'Will ETH hit 10k?',
            groupName: 'Ethereum Price Targets', // old group name
          },
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0]).toEqual({
      conditionId: '0xbbb',
      fields: { groupName: 'Ethereum Price Targets 2025' },
      old: { groupName: 'Ethereum Price Targets' },
    });
  });

  it('detects both question and group name changes', async () => {
    const market = makeMarket({
      conditionId: '0xccc',
      question: 'New question?',
      events: [{ title: 'New Group Name', slug: 'new-slug' }],
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xccc',
          {
            endTime: 1700000000,
            question: 'Old question?',
            groupName: 'Old Group Name',
          },
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0]).toEqual({
      conditionId: '0xccc',
      fields: { question: 'New question?', groupName: 'New Group Name' },
      old: { question: 'Old question?', groupName: 'Old Group Name' },
    });
  });

  it('returns no updates when metadata matches', async () => {
    const market = makeMarket({
      conditionId: '0xddd',
      question: 'Same question?',
      events: [{ title: 'Same Group', slug: 'same' }],
    });

    mockCheckExisting.mockResolvedValue(
      new Map([
        [
          '0xddd',
          {
            endTime: 1700000000,
            question: 'Same question?',
            groupName: 'Same Group',
          },
        ],
      ])
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

  it('backfills when existing condition has no question stored in DB', async () => {
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
            // no question or groupName in DB
          },
        ],
      ])
    );

    const result = await groupMarkets([market], 'https://test-api.example.com');

    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0]).toEqual({
      conditionId: '0xfff',
      fields: { question: 'Some question?', groupName: 'Some Group' },
      old: { question: undefined, groupName: undefined },
    });
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
          {
            endTime: 1700000000,
            question: 'Old question?',
            groupName: 'Same Group',
          },
        ],
        [
          '0x222',
          {
            endTime: 1700000000,
            question: 'Unchanged question?',
            groupName: 'Same Group 2',
          },
        ],
        // 0x333 is new, not in DB
      ])
    );

    const result = await groupMarkets(markets, 'https://test-api.example.com');

    // Only 0x111 changed
    expect(result.metadataUpdates).toHaveLength(1);
    expect(result.metadataUpdates[0].conditionId).toBe('0x111');
  });
});
