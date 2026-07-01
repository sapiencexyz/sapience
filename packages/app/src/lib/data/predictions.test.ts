import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PREDICTION_BY_ID_QUERY,
  toPredictionData,
  fetchPredictionWithConditions,
} from './predictions';

function makePredictionNode(overrides: Record<string, unknown> = {}) {
  return {
    predictionId: '0xpred1',
    chainId: 8453,
    escrow: '0xescrow',
    predictor: '0xaaa',
    counterparty: '0xbbb',
    predictorToken: '0xpredictortoken',
    counterpartyToken: null,
    predictorCollateral: 1000, // BigInt scalar may serialize as number
    counterpartyCollateral: '2000',
    settled: false,
    settledAt: null,
    result: null,
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
      endsAt: 1760000000,
      isLegacy: false,
      picks: [
        {
          conditionId: '0xcond1',
          resolver: '0xresolver',
          predictedOutcome: 'YES',
        },
      ],
    },
    ...overrides,
  };
}

describe('PREDICTION_BY_ID_QUERY (GraphQL)', () => {
  it('looks up by predictionId with the GraphQL field names', () => {
    expect(PREDICTION_BY_ID_QUERY).toContain(
      'prediction(predictionId: $predictionId)'
    );
    expect(PREDICTION_BY_ID_QUERY).toContain('escrow');
    expect(PREDICTION_BY_ID_QUERY).toContain('pickConfigId');
    expect(PREDICTION_BY_ID_QUERY).not.toContain('marketAddress');
    // slim picks: condition metadata comes from the separate conditions leg
    expect(PREDICTION_BY_ID_QUERY).not.toContain('condition {');
  });
});

describe('toPredictionData', () => {
  it('maps the GraphQL node to the SSR PredictionData shape', () => {
    const mapped = toPredictionData(
      makePredictionNode() as Parameters<typeof toPredictionData>[0]
    );
    expect(mapped.predictionId).toBe('0xpred1');
    expect(mapped.marketAddress).toBe('0xescrow');
    expect(mapped.predictorCollateral).toBe('1000');
    expect(mapped.counterpartyCollateral).toBe('2000');
    expect(mapped.result).toBe('UNRESOLVED');
    expect(mapped.counterpartyToken).toBeNull();
    expect(mapped.pickConfig?.id).toBe('0xpc1');
    expect(mapped.pickConfig?.marketAddress).toBe('0xescrow');
    expect(mapped.pickConfig?.picks[0]?.conditionResolver).toBe('0xresolver');
    expect(mapped.pickConfig?.picks[0]?.conditionId).toBe('0xcond1');
    expect(mapped.pickConfig?.picks[0]?.predictedOutcome).toBe(1);
  });

  it('keeps a terminal result and null pickConfig as-is', () => {
    const mapped = toPredictionData(
      makePredictionNode({
        result: 'COUNTERPARTY_WINS',
        settled: true,
        settledAt: 1700000000,
        pickConfig: null,
      }) as Parameters<typeof toPredictionData>[0]
    );
    expect(mapped.result).toBe('COUNTERPARTY_WINS');
    expect(mapped.settled).toBe(true);
    expect(mapped.pickConfig).toBeNull();
  });
});

describe('fetchPredictionWithConditions', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts both legs to the GraphQL endpoint and maps the prediction', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { prediction: makePredictionNode() } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            conditions: {
              nodes: [
                {
                  id: '0xcond1',
                  question: 'Will ETH hit 5k?',
                  settled: false,
                },
              ],
            },
          },
        }),
      });

    const result = await fetchPredictionWithConditions('0xpred1');

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [predUrl, predInit] = fetchMock.mock.calls[0];
    expect(String(predUrl)).toContain('/graphql');
    expect(JSON.parse(predInit.body).variables).toEqual({
      predictionId: '0xpred1',
    });

    const [condUrl, condInit] = fetchMock.mock.calls[1];
    expect(String(condUrl)).toContain('/graphql');
    expect(JSON.parse(condInit.body).variables).toEqual({
      ids: ['0xcond1'],
    });

    expect(result.prediction?.marketAddress).toBe('0xescrow');
    expect(result.prediction?.result).toBe('UNRESOLVED');
    expect(result.conditions).toEqual([
      { id: '0xcond1', question: 'Will ETH hit 5k?', settled: false },
    ]);
  });

  it('chunks the conditions leg into <=25-id requests and merges them', async () => {
    // 30 picks → one full page of 25 + a second page of 5.
    const picks = Array.from({ length: 30 }, (_, i) => ({
      conditionId: `0xcond${i}`,
      resolver: '0xresolver',
      predictedOutcome: 'YES',
    }));
    const node = makePredictionNode({
      pickConfig: {
        ...makePredictionNode().pickConfig,
        picks,
      },
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { prediction: node } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            conditions: {
              nodes: picks
                .slice(0, 25)
                .map((p) => ({ id: p.conditionId, settled: false })),
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            conditions: {
              nodes: picks
                .slice(25)
                .map((p) => ({ id: p.conditionId, settled: false })),
            },
          },
        }),
      });

    const result = await fetchPredictionWithConditions('0xpred1');

    // 1 prediction leg + 2 chunked conditions legs.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstChunkIds = JSON.parse(fetchMock.mock.calls[1][1].body).variables
      .ids;
    const secondChunkIds = JSON.parse(fetchMock.mock.calls[2][1].body).variables
      .ids;
    expect(firstChunkIds).toHaveLength(25);
    expect(secondChunkIds).toHaveLength(5);

    // Every returned condition is preserved (nothing truncated at the 25 cap).
    expect(result.conditions).toHaveLength(30);
    expect(result.conditions.map((c) => c.id)).toEqual(
      picks.map((p) => p.conditionId)
    );
  });

  it('returns null prediction without a conditions round trip when not found', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { prediction: null } }),
    });

    const result = await fetchPredictionWithConditions('0xmissing');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ prediction: null, conditions: [] });
  });
});
