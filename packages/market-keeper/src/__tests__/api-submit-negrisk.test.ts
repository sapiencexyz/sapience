import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SapienceOutput } from '../types';

const mockFetchWithRetry = vi.fn();
const mockGetAdminAuthHeaders = vi.fn();

vi.mock('../utils', () => ({
  fetchWithRetry: (...args: unknown[]) => mockFetchWithRetry(...args),
  getAdminAuthHeaders: (...args: unknown[]) => mockGetAdminAuthHeaders(...args),
}));

vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    RESOLVER_ADDRESS: '0x' + '11'.repeat(20),
    END_TIME_BUFFER_SECONDS: 0,
  };
});

import { submitToAPI } from '../generate/api';

function condition(
  conditionHash: string,
  overrides: Partial<
    SapienceOutput['groups'][number]['conditions'][number]
  > = {}
): SapienceOutput['groups'][number]['conditions'][number] {
  return {
    conditionHash,
    question: `Question ${conditionHash.slice(2, 6)}?`,
    shortName: `Q ${conditionHash.slice(2, 6)}`,
    categorySlug: 'sports',
    endDate: '2030-01-01T00:00:00Z',
    description: 'desc',
    similarMarkets: [],
    tags: [],
    chainId: 5064014,
    groupTitle: 'NBA winner',
    estimatedPrice: 0.5,
    negRisk: true,
    negRiskMarketId: 'basket-a',
    ...overrides,
  };
}

function response(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

describe('submitToAPI negRisk mismatch recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminAuthHeaders.mockResolvedValue({ Authorization: 'Bearer test' });
  });

  it('fails the whole batch on structured negRisk mismatches', async () => {
    const goodHash = '0x' + 'aa'.repeat(32);
    const badHash = '0x' + 'bb'.repeat(32);
    const data: SapienceOutput = {
      metadata: {
        generatedAt: 'now',
        source: 'test',
        totalConditions: 2,
        totalGroups: 1,
        binaryConditions: 2,
      },
      groups: [
        {
          title: 'NBA winner',
          categorySlug: 'sports',
          description: 'desc',
          similarMarkets: [],
          tags: [],
          negRiskMarketId: 'basket-a',
          conditions: [
            condition(goodHash),
            condition(badHash, { negRiskMarketId: 'basket-b' }),
          ],
        },
      ],
      ungroupedConditions: [],
    };

    mockFetchWithRetry
      .mockResolvedValueOnce(
        response(false, 400, {
          code: 'NEG_RISK_BASKET_MISMATCH',
          mismatches: [
            {
              type: 'EXISTING_GROUP_MISMATCH',
              groupName: 'NBA winner',
              expectedNegRiskMarketId: 'basket-a',
              mismatched: [
                { conditionHash: badHash, actualNegRiskMarketId: 'basket-b' },
              ],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        response(true, 201, { created: 1, skipped: 0, failed: 0 })
      );

    await submitToAPI(
      'https://api.example.com',
      '0x123' as `0x${string}`,
      data
    );

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
  });
});
