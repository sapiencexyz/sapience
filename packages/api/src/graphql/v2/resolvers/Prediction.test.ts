import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2 } from '../relay/nodeRegistry';

const mockPrisma = vi.hoisted(() => ({
  prediction: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { Prediction } from './Prediction';
import { prediction, predictions } from './queries/prediction';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

const PREDICTION_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000789';

describe('Prediction (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.prediction.count.mockResolvedValue(0);
  });

  it('encodes the global id as v2 Prediction:<predictionId>', async () => {
    const id = await callResolver<string>(Prediction.id)(
      { predictionId: PREDICTION_ID },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({
      type: 'Prediction',
      id: PREDICTION_ID,
    });
  });

  it('predictor / counterparty are lowercased', () => {
    expect(
      callResolver<string>(Prediction.predictor)(
        { predictor: '0xABC' },
        {},
        {},
        null
      )
    ).toBe('0xabc');
  });

  it('pickConfig maps the eager-included pickConfiguration row', () => {
    const eager = { id: PREDICTION_ID, picks: [] };
    expect(
      callResolver<unknown>(Prediction.pickConfig)(
        { pickConfiguration: eager },
        {},
        {},
        null
      )
    ).toBe(eager);
  });

  it('settled is true once the prediction has a terminal result', () => {
    expect(
      callResolver<boolean>(Prediction.settled)(
        { result: 'PREDICTOR_WINS' },
        {},
        {},
        null
      )
    ).toBe(true);
  });

  it('settled is false while the prediction is UNRESOLVED', () => {
    expect(
      callResolver<boolean>(Prediction.settled)(
        { result: 'UNRESOLVED' },
        {},
        {},
        null
      )
    ).toBe(false);
  });

  it('settled tracks the nullable wire result (NON_DECISIVE counts as settled)', () => {
    expect(
      callResolver<boolean>(Prediction.settled)(
        { result: 'NON_DECISIVE' },
        {},
        {},
        null
      )
    ).toBe(true);
  });

  it('predictions(filter: { participant }) ORs across predictor/counterparty', async () => {
    await callResolver(predictions)(
      null,
      { first: 50, filter: { participant: '0xABC' } },
      {},
      null
    );
    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ predictor: '0xabc' }, { counterparty: '0xabc' }],
        }),
      })
    );
  });

  it('predictions(filter: { conditionIds }) routes through the pickConfig join', async () => {
    await callResolver(predictions)(
      null,
      { first: 50, filter: { conditionIds: ['0xCOND_A', '0xCOND_B'] } },
      {},
      null
    );
    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          pickConfiguration: {
            picks: {
              some: {
                conditionId: { in: ['0xcond_a', '0xcond_b'] },
              },
            },
          },
        }),
      })
    );
  });

  it('prediction(predictionId:) eager-includes the pickConfig', async () => {
    await callResolver(prediction)(
      null,
      { predictionId: PREDICTION_ID },
      {},
      null
    );
    expect(mockPrisma.prediction.findUnique).toHaveBeenCalledWith({
      where: { predictionId: PREDICTION_ID },
      include: { pickConfiguration: { include: { picks: true } } },
    });
  });

  it('predictions(orderBy: SETTLED_AT) restricts to non-null settledAt so the keyset stays sound', async () => {
    await callResolver(predictions)(
      null,
      { first: 50, orderBy: { field: 'SETTLED_AT', direction: 'DESC' } },
      {},
      null
    );
    const where = mockPrisma.prediction.findMany.mock.calls[0]?.[0]?.where as {
      settledAt?: unknown;
    };
    // settledAt is nullable; keyset over it would silently drop unsettled rows.
    expect(where.settledAt).toEqual({ not: null });
  });

  it('predictions(orderBy: CREATED_AT) leaves settledAt unconstrained (non-null column)', async () => {
    await callResolver(predictions)(
      null,
      { first: 50, orderBy: { field: 'CREATED_AT', direction: 'DESC' } },
      {},
      null
    );
    const where = mockPrisma.prediction.findMany.mock.calls[0]?.[0]?.where as {
      settledAt?: unknown;
    };
    expect(where.settledAt).toBeUndefined();
  });
});
