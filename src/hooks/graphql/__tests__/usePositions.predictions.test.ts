import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGraphqlRequest = vi.fn();

vi.mock('~/lib/sdk/queries/client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
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
  return import('../usePositions');
}

function makePredictionNode(overrides: Record<string, unknown> = {}) {
  return {
    predictionId: '0xpred1',
    chainId: 8453,
    escrow: '0xescrow',
    predictor: '0xaaa',
    counterparty: '0xbbb',
    predictorToken: '0xpredictortoken',
    counterpartyToken: '0xcounterpartytoken',
    predictorCollateral: 1000, // BigInt scalar may serialize as number
    counterpartyCollateral: '2000',
    collateralDeposited: '3000',
    collateralDepositedAt: 1700000000,
    settled: true,
    settledAt: 1700000100,
    settleTxHash: '0xsettle',
    result: 'PREDICTOR_WINS',
    predictorClaimable: 3000,
    counterpartyClaimable: null,
    createTxHash: '0xtx1',
    createdAt: '2026-06-01T00:00:00.000Z',
    refCode: null,
    isLegacy: false,
    pickConfig: {
      pickConfigId: '0xpc1',
      chainId: 8453,
      escrow: '0xescrow',
      totalPredictorCollateral: '1000',
      totalCounterpartyCollateral: '2000',
      claimedPredictorCollateral: '0',
      claimedCounterpartyCollateral: '0',
      resolved: true,
      result: 'PREDICTOR_WINS',
      resolvedAt: 1700000100,
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
            question: 'Will ETH hit 5k?',
            settled: true,
            resolvedToYes: true,
            nonDecisive: false,
            category: { slug: 'crypto' },
          },
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({ predictions: { nodes: [] } });
});

// ─── Document shapes ─────────────────────────────────────────────────────────

describe('prediction documents', () => {
  it('predictions list query filters by participant with explicit orderBy', async () => {
    const mod = await getModule();
    const doc = mod.PREDICTIONS_QUERY as string;
    expect(doc).toContain(
      'filter: { participant: $participant, chainId: $chainId }'
    );
    expect(doc).toContain('orderBy: { field: CREATED_AT, direction: DESC }');
    expect(doc).toContain('first: $first');
    expect(doc).toContain('nodes {');
    expect(doc).toContain('isLegacy');
    expect(doc).not.toContain('address:');
    expect(doc).not.toContain('take:');
    expect(doc).not.toContain('GraphQL */');
  });

  it('by-condition query filters via conditionIds', async () => {
    const mod = await getModule();
    const doc = mod.PREDICTIONS_BY_CONDITION_QUERY as string;
    expect(doc).toContain('conditionIds: [$conditionId]');
    expect(doc).toContain('orderBy: { field: CREATED_AT, direction: DESC }');
    expect(doc).toContain('first: $first');
    // cursor pagination: after + pageInfo so the hook can loop to exhaustion
    expect(doc).toContain('after: $after');
    expect(doc).toContain('hasNextPage');
    expect(doc).toContain('endCursor');
    // slim projection: no embedded condition objects (complexity budget)
    expect(doc).not.toContain('condition {');
  });

  it('single prediction query looks up by predictionId', async () => {
    const mod = await getModule();
    const doc = mod.PREDICTION_QUERY as string;
    expect(doc).toContain('prediction(predictionId: $predictionId)');
  });

  it('count query is a first: 0 totalCount-only connection', async () => {
    const mod = await getModule();
    const doc = mod.PREDICTIONS_COUNT_QUERY as string;
    expect(doc).toContain('first: 0');
    expect(doc).toContain('totalCount');
    expect(doc).not.toContain('predictionCount');
  });

  it('does not export a POSITION_BALANCES_QUERY document', async () => {
    const mod = await getModule();
    // No standalone POSITION_BALANCES_QUERY export; positions go through POSITIONS_QUERY.
    expect(mod.POSITION_BALANCES_QUERY).toBeUndefined();
  });
});

// ─── Hooks ───────────────────────────────────────────────────────────────────

describe('usePredictions', () => {
  it('maps nodes to the app Prediction shape via the shared adapter', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({
      predictions: { nodes: [makePredictionNode()] },
    });

    const { result } = renderHook(
      () => mod.usePredictions({ address: '0xaaa', chainId: 8453, take: 5 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });

    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables).toMatchObject({
      participant: '0xaaa',
      chainId: 8453,
      first: 5,
    });

    const p = result.current.data[0];
    expect(p.predictionId).toBe('0xpred1');
    expect(p.marketAddress).toBe('0xescrow'); // escrow → marketAddress
    expect(p.predictorCollateral).toBe('1000'); // BigInt normalized
    expect(p.predictorClaimable).toBe('3000');
    expect(p.result).toBe('PREDICTOR_WINS');
    expect(p.settled).toBe(true);
    expect(p.isLegacy).toBe(false);
    expect(p.pickConfig?.id).toBe('0xpc1');
    expect(p.pickConfig?.marketAddress).toBe('0xescrow');
    // legacy pickConfig.predictionId is backfilled from the parent prediction
    expect(p.pickConfig?.predictionId).toBe('0xpred1');
    expect(p.pickConfig?.picks[0]?.conditionResolver).toBe('0xresolver');
    expect(p.pickConfig?.picks[0]?.predictedOutcome).toBe(1);
    expect(p.pickConfig?.picks[0]?.condition?.id).toBe('0xcond1');
  });

  it('maps null result to UNRESOLVED', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({
      predictions: {
        nodes: [
          makePredictionNode({
            result: null,
            settled: false,
            pickConfig: null,
          }),
        ],
      },
    });

    const { result } = renderHook(
      () => mod.usePredictions({ address: '0xaaa' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });
    expect(result.current.data[0].result).toBe('UNRESOLVED');
    expect(result.current.data[0].pickConfig).toBeNull();
  });
});

describe('usePredictionsCount', () => {
  it('reads totalCount from the first: 0 connection', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({
      predictions: { totalCount: 7 },
    });

    const { result } = renderHook(
      () => mod.usePredictionsCount('0xaaa', 8453),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current).toBe(7);
    });
    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables).toMatchObject({ participant: '0xaaa', chainId: 8453 });
  });
});

describe('usePrediction', () => {
  it('fetches a single prediction by predictionId', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({
      prediction: makePredictionNode(),
    });

    const { result } = renderHook(() => mod.usePrediction('0xpred1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });
    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables).toMatchObject({ predictionId: '0xpred1' });
    expect(result.current.data?.marketAddress).toBe('0xescrow');
  });

  it('returns null when the prediction does not exist', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({ prediction: null });

    const { result } = renderHook(() => mod.usePrediction('0xmissing'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    });
    expect(result.current.data).toBeNull();
  });
});

describe('usePredictionsByConditionId', () => {
  it('maps the slim projection for the question-page chart', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({
      predictions: {
        nodes: [
          {
            predictionId: '0xpred1',
            chainId: 8453,
            escrow: '0xescrow',
            predictor: '0xaaa',
            counterparty: '0xbbb',
            predictorCollateral: '1000',
            counterpartyCollateral: 2000,
            collateralDepositedAt: 1700000000,
            createdAt: '2026-06-01T00:00:00.000Z',
            pickConfig: {
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
              predictorToken: null,
              counterpartyToken: null,
              endsAt: null,
              isLegacy: false,
              picks: [
                {
                  conditionId: '0xcond1',
                  resolver: '0xresolver',
                  predictedOutcome: 'NO',
                },
              ],
            },
          },
        ],
      },
    });

    const { result } = renderHook(
      () => mod.usePredictionsByConditionId({ conditionId: '0xcond1' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });

    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables).toMatchObject({ conditionId: '0xcond1', first: 25 });

    const p = result.current.data[0];
    expect(p.marketAddress).toBe('0xescrow');
    expect(p.counterpartyCollateral).toBe('2000');
    expect(p.pickConfig?.picks[0]?.conditionResolver).toBe('0xresolver');
    expect(p.pickConfig?.picks[0]?.predictedOutcome).toBe(0); // NO → 0
  });

  it('loops over 25-row cursor pages until exhausted, accumulating every prediction', async () => {
    const mod = await getModule();
    const slimNode = (predictionId: string) => ({
      predictionId,
      chainId: 8453,
      escrow: '0xescrow',
      predictor: '0xaaa',
      counterparty: '0xbbb',
      predictorCollateral: '1000',
      counterpartyCollateral: '2000',
      collateralDepositedAt: 1700000000,
      createdAt: '2026-06-01T00:00:00.000Z',
      pickConfig: null,
    });

    // Page 1: 25 nodes + hasNextPage → hook must request page 2.
    // Page 2: 5 nodes, hasNextPage false → hook stops.
    mockGraphqlRequest
      .mockResolvedValueOnce({
        predictions: {
          nodes: Array.from({ length: 25 }, (_, i) => slimNode(`0xp1_${i}`)),
          pageInfo: { hasNextPage: true, endCursor: 'CURSOR_25' },
        },
      })
      .mockResolvedValueOnce({
        predictions: {
          nodes: Array.from({ length: 5 }, (_, i) => slimNode(`0xp2_${i}`)),
          pageInfo: { hasNextPage: false, endCursor: 'CURSOR_30' },
        },
      });

    const { result } = renderHook(
      () => mod.usePredictionsByConditionId({ conditionId: '0xcond1' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(30);
    });

    // Exactly two requests: first with after: null, second with the endCursor.
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1]).toMatchObject({
      conditionId: '0xcond1',
      first: 25,
      after: null,
    });
    expect(mockGraphqlRequest.mock.calls[1][1]).toMatchObject({
      conditionId: '0xcond1',
      first: 25,
      after: 'CURSOR_25',
    });
  });

  it('stops after one page when the server reports no more', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({
      predictions: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const { result } = renderHook(
      () => mod.usePredictionsByConditionId({ conditionId: '0xcond1' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    expect(result.current.data.length).toBe(0);
  });
});
