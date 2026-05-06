import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PolymarketMarket } from '../types';
import type { SapienceOutput } from '../types/sapience';
import { RELIST_FORWARD_DAYS } from '../constants';

// Mock all external dependencies before importing main
vi.mock('../utils', () => ({
  validatePrivateKey: vi.fn(() => '0x' + 'a'.repeat(64)),
  confirmProductionAccess: vi.fn(),
  log: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../relist/market', () => ({
  fetchPastEndDateMarkets: vi.fn(),
}));

vi.mock('../generate/pipeline', () => ({
  checkExistingConditions: vi.fn(),
}));

vi.mock('../generate/grouping', () => ({
  groupMarkets: vi.fn(),
  exportJSON: vi.fn(),
}));

vi.mock('../generate/api', () => ({
  printDryRun: vi.fn(),
  submitToAPI: vi.fn(),
}));

import { main } from '../relist/index';
import { fetchPastEndDateMarkets } from '../relist/market';
import { checkExistingConditions } from '../generate/pipeline';
import { groupMarkets } from '../generate/grouping';
import { submitToAPI } from '../generate/api';
import { log } from '../utils';

const mockFetch = vi.mocked(fetchPastEndDateMarkets);
const mockCheckExisting = vi.mocked(checkExistingConditions);
const mockGroupMarkets = vi.mocked(groupMarkets);
const mockSubmitToAPI = vi.mocked(submitToAPI);
const mockLog = vi.mocked(log);

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
    endDate: '2025-01-01T00:00:00Z',
    description: 'Test market',
    slug: 'test-market',
    category: 'politics',
    active: true,
    closed: false,
    ...overrides,
  };
}

const emptySapienceOutput: SapienceOutput = {
  metadata: {
    generatedAt: '',
    source: 'test',
    totalConditions: 0,
    totalGroups: 0,
    binaryConditions: 0,
  },
  groups: [],
  ungroupedConditions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SAPIENCE_API_URL = 'https://test-api.example.com';
  process.env.ADMIN_PRIVATE_KEY = 'a'.repeat(64);
  process.argv = ['node', 'relist.ts', '--dry-run'];
});

describe('relist main()', () => {
  it('exits early when no markets are fetched from Polymarket', async () => {
    mockFetch.mockResolvedValue([]);

    await main();

    expect(mockCheckExisting).not.toHaveBeenCalled();
    expect(mockGroupMarkets).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining('No past-endDate markets found')
    );
  });

  it('skips already-listed markets and only processes new ones', async () => {
    const markets = [
      makeMarket({ conditionId: '0x1' }),
      makeMarket({ conditionId: '0x2' }),
      makeMarket({ conditionId: '0x3' }),
    ];
    mockFetch.mockResolvedValue(markets);
    mockCheckExisting.mockResolvedValue(
      new Map([
        ['0x1', { endTime: 1700000000 }],
        ['0x3', { endTime: 1700000000 }],
      ])
    );
    mockGroupMarkets.mockResolvedValue(emptySapienceOutput);

    await main();

    const passedMarkets = mockGroupMarkets.mock.calls[0][0];
    expect(passedMarkets).toHaveLength(1);
    expect(passedMarkets[0].conditionId).toBe('0x2');
  });

  it('overrides endDate to now+RELIST_FORWARD_DAYS on new markets', async () => {
    const markets = [
      makeMarket({ conditionId: '0x1', endDate: '2020-01-01T00:00:00Z' }),
    ];
    mockFetch.mockResolvedValue(markets);
    mockCheckExisting.mockResolvedValue(new Map());
    mockGroupMarkets.mockResolvedValue(emptySapienceOutput);

    const before = Date.now();
    await main();
    const after = Date.now();

    const passedMarkets = mockGroupMarkets.mock.calls[0][0];
    const newEndDate = new Date(passedMarkets[0].endDate).getTime();
    const forwardMs = RELIST_FORWARD_DAYS * 24 * 60 * 60 * 1000;

    expect(newEndDate).toBeGreaterThanOrEqual(before + forwardMs - 5000);
    expect(newEndDate).toBeLessThanOrEqual(after + forwardMs + 5000);
  });

  it('exits early when all markets already exist in Sapience', async () => {
    const markets = [
      makeMarket({ conditionId: '0x1' }),
      makeMarket({ conditionId: '0x2' }),
    ];
    mockFetch.mockResolvedValue(markets);
    mockCheckExisting.mockResolvedValue(
      new Map([
        ['0x1', { endTime: 1700000000 }],
        ['0x2', { endTime: 1700000000 }],
      ])
    );

    await main();

    expect(mockGroupMarkets).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining('No new markets to create')
    );
  });

  it('does not submit in dry-run mode', async () => {
    mockFetch.mockResolvedValue([makeMarket({ conditionId: '0x1' })]);
    mockCheckExisting.mockResolvedValue(new Map());
    mockGroupMarkets.mockResolvedValue(emptySapienceOutput);

    await main();

    expect(mockSubmitToAPI).not.toHaveBeenCalled();
  });

  it('never extends endTime on existing conditions', async () => {
    const markets = [
      makeMarket({ conditionId: '0x1' }), // existing, endTime far in past
      makeMarket({ conditionId: '0x2' }), // new
    ];
    mockFetch.mockResolvedValue(markets);
    mockCheckExisting.mockResolvedValue(new Map([['0x1', { endTime: 1000 }]]));
    mockGroupMarkets.mockResolvedValue(emptySapienceOutput);

    await main();

    const passedMarkets = mockGroupMarkets.mock.calls[0][0];
    expect(passedMarkets).toHaveLength(1);
    expect(passedMarkets[0].conditionId).toBe('0x2');
    // No log about extending
    const logCalls = mockLog.mock.calls.map((c) => String(c[0]));
    expect(logCalls.every((msg) => !msg.includes('Extending'))).toBe(true);
  });
});
