import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  fetchPickConfigurations,
  GET_PICK_CONFIGURATIONS,
} from '../pickConfigurations';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchPickConfigurations', () => {
  test('uses default take=10 and skip=0 when no opts provided', async () => {
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurationsPage: { items: [], hasMore: false },
    });
    await fetchPickConfigurations();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      GET_PICK_CONFIGURATIONS,
      expect.objectContaining({ take: 10, skip: 0 })
    );
  });

  test('passes custom take, skip, and chainId', async () => {
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurationsPage: { items: [], hasMore: false },
    });
    await fetchPickConfigurations({ take: 50, skip: 5, chainId: 42161 });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      GET_PICK_CONFIGURATIONS,
      expect.objectContaining({ take: 50, skip: 5, chainId: 42161 })
    );
  });

  test('passes resolved param when provided', async () => {
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurationsPage: { items: [], hasMore: false },
    });
    await fetchPickConfigurations({ resolved: false });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      GET_PICK_CONFIGURATIONS,
      expect.objectContaining({ resolved: false })
    );
  });

  test('does not send resolved key when not provided', async () => {
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurationsPage: { items: [], hasMore: false },
    });
    await fetchPickConfigurations({ take: 5 });
    const vars = mockGraphqlRequest.mock.calls[0][1];
    expect(vars.resolved).toBeUndefined();
  });

  test('returns pickConfigurations from response', async () => {
    const configs = [
      {
        id: 'pc-1',
        chainId: 1,
        totalPredictorCollateral: '100',
        totalCounterpartyCollateral: '200',
        resolved: false,
        picks: [
          { conditionId: 'c1', conditionResolver: 'r1', predictedOutcome: 1 },
        ],
      },
    ];
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurationsPage: { items: configs, hasMore: false },
    });
    const result = await fetchPickConfigurations();
    expect(result).toEqual(configs);
  });

  test('returns empty array when response pickConfigurations is null', async () => {
    mockGraphqlRequest.mockResolvedValue({ pickConfigurationsPage: null });
    const result = await fetchPickConfigurations();
    expect(result).toEqual([]);
  });
});
