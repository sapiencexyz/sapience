import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityType } from '../../__generated__/resolvers';

const mockPrisma = vi.hoisted(() => ({
  pick: { findMany: vi.fn() },
  picks: { findMany: vi.fn() },
  prediction: { findMany: vi.fn(), count: vi.fn() },
  secondaryTrade: { findMany: vi.fn(), count: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import { decodeCursor } from '../../../relay/cursor';
import { Activity, ActivitySource } from '../Activity';
import { activity } from './activity';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult>;

const predictionRow = (id: string, createdAt: Date) => ({
  id: 1,
  predictionId: id,
  chainId: 13374202,
  marketAddress: '0xmarket',
  predictor: '0xaaa',
  counterparty: '0xbbb',
  predictorCollateral: '10',
  counterpartyCollateral: '10',
  collateralDeposited: true,
  collateralDepositedAt: Math.floor(createdAt.getTime() / 1000),
  settled: false,
  settledAt: null,
  result: 'UNRESOLVED',
  predictorClaimable: null,
  counterpartyClaimable: null,
  createdAt,
  createTxHash: '0xcreate',
  settleTxHash: null,
  refCode: null,
  isLegacy: false,
  pickConfiguration: {
    id: 'pc1',
    chainId: 13374202,
    marketAddress: '0xmarket',
    totalPredictorCollateral: '10',
    totalCounterpartyCollateral: '10',
    claimedPredictorCollateral: '0',
    claimedCounterpartyCollateral: '0',
    resolved: false,
    result: 'UNRESOLVED',
    resolvedAt: null,
    predictorToken: '0xtokena',
    counterpartyToken: '0xtokenb',
    endsAt: null,
    isLegacy: false,
    picks: [],
  },
});

const tradeRow = (id: number, executedAt: number) => ({
  id,
  chainId: 13374202,
  tradeHash: `0xtrade${id}`,
  seller: '0xccc',
  buyer: '0xaaa',
  token: '0xtokena',
  collateral: '5',
  tokenAmount: '1',
  price: '5',
  refCode: null,
  executedAt,
  txHash: `0xtx${id}`,
  blockNumber: 1,
});

describe('activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.pick.findMany.mockResolvedValue([]);
    mockPrisma.picks.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    mockPrisma.prediction.count.mockResolvedValue(0);
    mockPrisma.secondaryTrade.count.mockResolvedValue(0);
  });

  it('treats an empty type filter as an explicit zero-result query', async () => {
    const result = await callResolver<{ nodes: unknown[] }>(activity)(
      null,
      { first: 10, filter: { types: [] } },
      {},
      null
    );

    expect(result.nodes).toEqual([]);
    expect(mockPrisma.prediction.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.secondaryTrade.findMany).not.toHaveBeenCalled();
  });

  it('interleaves prediction and trade sources and exposes union typenames', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([
      predictionRow('100', new Date('2026-01-02T00:00:00Z')),
    ]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      tradeRow(7, Date.parse('2026-01-01T00:00:00Z') / 1000),
    ]);

    const result = await callResolver<{
      nodes: Array<{ source: Record<string, unknown> }>;
      edges: Array<{ cursor: string }>;
    }>(activity)(null, { first: 10 }, {}, null);

    expect(result.nodes).toHaveLength(2);
    expect(
      ActivitySource.__resolveType?.(
        result.nodes[0].source as never,
        {} as never,
        {} as never
      )
    ).toBe('Prediction');
    expect(
      ActivitySource.__resolveType?.(
        result.nodes[1].source as never,
        {} as never,
        {} as never
      )
    ).toBe('Trade');
    expect(decodeCursor(result.edges[0].cursor)).toMatchObject({
      k: '2026-01-02T00:00:00.000Z',
      id: 'PREDICTION:100',
    });
  });

  it('applies account scope as OR across prediction roles and trade sides', async () => {
    await callResolver(activity)(
      null,
      {
        first: 10,
        filter: {
          account: '0xAAA',
          types: [ActivityType.Prediction, ActivityType.Trade],
        },
      },
      {},
      null
    );

    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ predictor: '0xaaa' }, { counterparty: '0xaaa' }] },
      })
    );
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ buyer: '0xaaa' }, { seller: '0xaaa' }] },
      })
    );
  });

  it('uses seller as the Activity.account actor when the scoped account sold the trade', async () => {
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      {
        ...tradeRow(7, Date.parse('2026-01-01T00:00:00Z') / 1000),
        seller: '0xaaa',
        buyer: '0xbbb',
      },
    ]);

    const result = await callResolver<{
      nodes: Array<{
        account: { address: string };
        source: Record<string, unknown>;
      }>;
    }>(activity)(
      null,
      { first: 10, filter: { account: '0xAAA', types: [ActivityType.Trade] } },
      {},
      null
    );

    expect(result.nodes[0].account.address).toBe('0xaaa');
    const accountResolver = Activity.account as unknown as (
      parent: unknown,
      args: Record<string, unknown>,
      ctx: unknown,
      info: unknown
    ) => unknown;
    expect(accountResolver(result.nodes[0], {}, {}, {})).toEqual(
      expect.objectContaining({ address: '0xaaa' })
    );
  });

  it('pushes activity keyset cursors into both source queries before taking rows', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([
      predictionRow('100', new Date('2026-01-02T00:00:00Z')),
    ]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      tradeRow(7, Date.parse('2026-01-01T00:00:00Z') / 1000),
    ]);

    const firstPage = await callResolver<{ edges: Array<{ cursor: string }> }>(
      activity
    )(null, { first: 1 }, {}, null);

    await callResolver(activity)(
      null,
      { first: 1, after: firstPage.edges[0].cursor },
      {},
      null
    );

    expect(mockPrisma.prediction.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ AND: expect.any(Array) }),
      })
    );
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ AND: expect.any(Array) }),
      })
    );
  });
});
