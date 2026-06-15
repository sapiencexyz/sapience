import { vi, describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGraphqlRequest = vi.fn();
const mockGraphqlRequestV2 = vi.fn();

vi.mock('@sapience/sdk/queries/client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
  graphqlRequestV2: (...args: unknown[]) => mockGraphqlRequestV2(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

async function getModule() {
  return import('../useAccountActivity');
}

// ─── v2 wire fixtures ────────────────────────────────────────────────────────

function makePickConfigNode(overrides: Record<string, unknown> = {}) {
  return {
    pickConfigId: '0xpc1',
    chainId: 8453,
    escrow: '0xescrow',
    totalPredictorCollateral: '1000',
    totalCounterpartyCollateral: '2000',
    claimedPredictorCollateral: '0',
    claimedCounterpartyCollateral: '0',
    resolved: false,
    result: null,
    resolvedAt: null,
    predictorToken: '0xpredictortoken',
    counterpartyToken: '0xcounterpartytoken',
    endsAt: 1760000000,
    isLegacy: false,
    picks: [
      {
        conditionId: '0xcond1',
        resolver: '0xresolver',
        predictedOutcome: 'YES',
        condition: {
          conditionId: '0xcond1',
          shortName: 'ETH 5k',
          optionName: null,
          question: 'Will ETH hit 5k?',
          description: null,
          endTime: 1760000000,
          resolver: '0xresolver',
          settled: false,
          resolvedToYes: false,
          nonDecisive: false,
          estimatedPrice: 0.42,
          category: { slug: 'crypto' },
        },
      },
    ],
    ...overrides,
  };
}

function makePredictionNode(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Prediction',
    predictionId: '0xpred1',
    chainId: 8453,
    escrow: '0xescrow',
    predictor: '0xaaa',
    counterparty: '0xbbb',
    predictorToken: '0xpredictortoken',
    counterpartyToken: '0xcounterpartytoken',
    predictorCollateral: '1000',
    counterpartyCollateral: '2000',
    collateralDeposited: null,
    collateralDepositedAt: null,
    settled: false,
    settledAt: null,
    settleTxHash: null,
    result: null,
    predictorClaimable: null,
    counterpartyClaimable: null,
    createTxHash: '0xtx1',
    createdAt: '2026-06-01T00:00:00.000Z',
    refCode: null,
    isLegacy: false,
    pickConfig: makePickConfigNode(),
    ...overrides,
  };
}

function makeTradeNode(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Trade',
    tradeHash: '0xtrade1',
    chainId: 8453,
    token: '0xpredictortoken',
    collateral: '0xcollateral',
    seller: '0xseller',
    buyer: '0xbuyer',
    // BigInt scalar can serialize small values as numbers — mapper must
    // normalize to string.
    tokenAmount: 1000,
    price: '250',
    txHash: '0xtx2',
    blockNumber: 42,
    executedAt: 1700000000,
    pickConfig: makePickConfigNode(),
    ...overrides,
  };
}

function makeConnection(
  edges: { timestamp: number; node: Record<string, unknown> }[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
    hasNextPage: false,
    endCursor: null,
  }
) {
  return {
    activity: {
      totalCount: edges.length,
      pageInfo,
      edges,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockRejectedValue(
    new Error('v1 transport must not be used')
  );
  mockGraphqlRequestV2.mockResolvedValue(makeConnection([]));
});

// ─── Document shape ──────────────────────────────────────────────────────────

describe('v2 activity document', () => {
  it('queries the v2 activity connection with edge timestamps and inline fragments', async () => {
    const mod = await getModule();
    const doc = mod.ACCOUNT_ACTIVITY_QUERY as string;
    expect(doc).toContain('activity(');
    expect(doc).toContain('edges {');
    expect(doc).toContain('timestamp');
    expect(doc).toContain('pageInfo');
    expect(doc).toContain('hasNextPage');
    expect(doc).toContain('endCursor');
    expect(doc).toContain('... on Prediction');
    expect(doc).toContain('... on Trade');
    expect(doc).toContain('__typename');
    // v1 envelope is gone
    expect(doc).not.toContain('accountActivity');
    // untagged document — app graphql-eslint validates tagged docs against v1
    expect(doc).not.toContain('GraphQL */');
  });
});

// ─── Hook behavior ───────────────────────────────────────────────────────────

describe('useAccountActivity', () => {
  it('runs the v2 query for the global feed with null filters', async () => {
    const mod = await getModule();

    renderHook(() => mod.useAccountActivity({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(1);
    });
    expect(mockGraphqlRequest).not.toHaveBeenCalled();

    const [, variables] = mockGraphqlRequestV2.mock.calls[0];
    expect(variables).toMatchObject({
      account: null,
      conditionIds: null,
      pickConfigId: null,
      types: null,
      first: 20,
      after: null,
    });
  });

  it('maps a Prediction edge through the shared pickConfig adapter', async () => {
    const mod = await getModule();

    mockGraphqlRequestV2.mockResolvedValue(
      makeConnection([{ timestamp: 1700000123, node: makePredictionNode() }])
    );

    const { result } = renderHook(() => mod.useAccountActivity({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.items.length).toBe(1);
    });

    const item = result.current.items[0];
    expect(item.type).toBe('prediction');
    // ActivityEdge.timestamp (epoch seconds) is THE time, x1000 for ms
    expect(item.timestamp).toBe(1700000123 * 1000);
    if (item.type !== 'prediction') throw new Error('expected prediction');
    expect(item.prediction.predictionId).toBe('0xpred1');
    // marketAddress := escrow
    expect(item.prediction.marketAddress).toBe('0xescrow');
    // result ?? 'UNRESOLVED'
    expect(item.prediction.result).toBe('UNRESOLVED');
    expect(item.prediction.isLegacy).toBe(false);
    // pickConfig mapped via shared adapter
    expect(item.pickConfig?.id).toBe('0xpc1');
    expect(item.pickConfig?.marketAddress).toBe('0xescrow');
    expect(item.pickConfig?.result).toBe('UNRESOLVED');
    const pick = item.pickConfig?.picks[0];
    expect(pick?.conditionResolver).toBe('0xresolver');
    expect(pick?.predictedOutcome).toBe(1);
    // condition id := conditionId (hash under stable `id` name)
    expect(pick?.condition?.id).toBe('0xcond1');
    // no account → defaults to predictor side
    expect(item.isPredictorSide).toBe(true);
  });

  it('maps a Trade edge with BigInt normalization and edge-level timestamp', async () => {
    const mod = await getModule();

    // edge timestamp deliberately differs from executedAt to pin the edge
    // as the single source of time
    mockGraphqlRequestV2.mockResolvedValue(
      makeConnection([{ timestamp: 1700009999, node: makeTradeNode() }])
    );

    const { result } = renderHook(
      () =>
        mod.useAccountActivity({
          account: '0xBUYER' as `0x${string}`,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.items.length).toBe(1);
    });

    const item = result.current.items[0];
    expect(item.type).toBe('trade');
    expect(item.timestamp).toBe(1700009999 * 1000);
    if (item.type !== 'trade') throw new Error('expected trade');
    expect(item.trade.tradeHash).toBe('0xtrade1');
    expect(item.trade.tokenAmount).toBe('1000');
    expect(item.trade.price).toBe('250');
    expect(item.trade.executedAt).toBe(1700000000);
    expect(item.pickConfig?.id).toBe('0xpc1');
    // '0xBUYER'.toLowerCase() === '0xbuyer'
    expect(item.isBuyer).toBe(true);
  });

  it('respects enabled=false override', async () => {
    const mod = await getModule();

    renderHook(() => mod.useAccountActivity({ enabled: false }), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(mockGraphqlRequestV2).not.toHaveBeenCalled();
  });

  it('maps the filter surface to v2 ActivityFilter variables', async () => {
    const mod = await getModule();

    renderHook(
      () =>
        mod.useAccountActivity({
          account:
            '0xABCDEF0000000000000000000000000000000001' as `0x${string}`,
          pickConfigId: '0xpc1',
          conditionId: '0xc1',
          activityType: 'trade',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(1);
    });

    const [, variables] = mockGraphqlRequestV2.mock.calls[0];
    expect(variables).toMatchObject({
      account: '0xABCDEF0000000000000000000000000000000001',
      pickConfigId: '0xpc1',
      conditionIds: ['0xc1'],
      types: ['TRADE'],
    });
  });

  it("maps activityType 'prediction' to types [PREDICTION] and 'all' to null", async () => {
    const mod = await getModule();
    const wrapper = createWrapper();

    renderHook(() => mod.useAccountActivity({ activityType: 'prediction' }), {
      wrapper,
    });
    await waitFor(() => {
      expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(1);
    });
    expect(mockGraphqlRequestV2.mock.calls[0][1]).toMatchObject({
      types: ['PREDICTION'],
    });

    renderHook(() => mod.useAccountActivity({ activityType: 'all' }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(2);
    });
    expect(mockGraphqlRequestV2.mock.calls[1][1]).toMatchObject({
      types: null,
    });
  });

  it('paginates by threading pageInfo.endCursor into after', async () => {
    const mod = await getModule();

    mockGraphqlRequestV2
      .mockResolvedValueOnce(
        makeConnection(
          [{ timestamp: 1700000002, node: makePredictionNode() }],
          { hasNextPage: true, endCursor: 'CUR1' }
        )
      )
      .mockResolvedValueOnce(
        makeConnection(
          [
            {
              timestamp: 1700000001,
              node: makePredictionNode({ predictionId: '0xpred2' }),
            },
          ],
          { hasNextPage: false, endCursor: null }
        )
      );

    const { result } = renderHook(
      () => mod.useAccountActivity({ pageSize: 1 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.items.map((i) => i.timestamp)).toEqual([
        1700000002 * 1000,
      ]);
    });
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.fetchMore();
    });

    await waitFor(() => {
      expect(result.current.items.map((i) => i.timestamp)).toEqual([
        1700000002 * 1000,
        1700000001 * 1000,
      ]);
    });

    expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequestV2.mock.calls[0][1]).toMatchObject({
      first: 1,
      after: null,
    });
    expect(mockGraphqlRequestV2.mock.calls[1][1]).toMatchObject({
      first: 1,
      after: 'CUR1',
    });
    expect(result.current.hasMore).toBe(false);
  });

  it('dedupes items across pages on the domain id', async () => {
    const mod = await getModule();

    mockGraphqlRequestV2
      .mockResolvedValueOnce(
        makeConnection(
          [
            { timestamp: 1700000003, node: makePredictionNode() },
            { timestamp: 1700000002, node: makeTradeNode() },
          ],
          { hasNextPage: true, endCursor: 'CUR1' }
        )
      )
      .mockResolvedValueOnce(
        makeConnection(
          [
            // duplicate of page 1's prediction (cursor-boundary overlap)
            { timestamp: 1700000003, node: makePredictionNode() },
            {
              timestamp: 1700000001,
              node: makeTradeNode({ tradeHash: '0xtrade2' }),
            },
          ],
          { hasNextPage: false, endCursor: null }
        )
      );

    const { result } = renderHook(
      () => mod.useAccountActivity({ pageSize: 2 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.items.length).toBe(2);
    });

    await act(async () => {
      result.current.fetchMore();
    });

    await waitFor(() => {
      expect(result.current.items.length).toBe(3);
    });

    const keys = result.current.items.map((i) =>
      i.type === 'prediction' ? i.prediction.predictionId : i.trade.tradeHash
    );
    expect(keys).toEqual(['0xpred1', '0xtrade1', '0xtrade2']);
  });
});
