import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2 } from '../relay/nodeRegistry';

const mockPrisma = vi.hoisted(() => ({
  condition: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  category: { findUnique: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { Condition } from './Condition';
import { condition, conditions } from './queries/condition';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

const CONDITION_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000123';

describe('Condition (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.condition.findMany.mockResolvedValue([]);
    mockPrisma.condition.count.mockResolvedValue(0);
  });

  it('encodes the global id as v2 Condition:<conditionId>', async () => {
    const id = await callResolver<string>(Condition.id)(
      { id: CONDITION_ID },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({ type: 'Condition', id: CONDITION_ID });
  });

  it('outcome is null until settled, then YES/NO/NON_DECISIVE', () => {
    expect(
      callResolver<unknown>(Condition.outcome)(
        { settled: false, resolvedToYes: false, nonDecisive: false },
        {},
        {},
        null
      )
    ).toBeNull();
    expect(
      callResolver<unknown>(Condition.outcome)(
        { settled: true, resolvedToYes: true, nonDecisive: false },
        {},
        {},
        null
      )
    ).toBe('YES');
    expect(
      callResolver<unknown>(Condition.outcome)(
        { settled: true, resolvedToYes: false, nonDecisive: false },
        {},
        {},
        null
      )
    ).toBe('NO');
    expect(
      callResolver<unknown>(Condition.outcome)(
        { settled: true, resolvedToYes: false, nonDecisive: true },
        {},
        {},
        null
      )
    ).toBe('NON_DECISIVE');
  });

  it('resolverAddress lowercases the Prisma `resolver` column', () => {
    expect(
      callResolver<string>(Condition.resolverAddress)(
        { resolver: '0xABCDEF0000000000000000000000000000000000' },
        {},
        {},
        null
      )
    ).toBe('0xabcdef0000000000000000000000000000000000');
  });

  it('similarMarket is null when no signal is present', () => {
    expect(
      callResolver<unknown>(Condition.similarMarket)(
        {
          similarMarkets: [],
          similarMarketImage: null,
          similarMarketVolume: 0,
        },
        {},
        {},
        null
      )
    ).toBeNull();
  });

  it('similarMarket bundles the flat columns when at least one is present', async () => {
    const result = (await callResolver<{
      volume24h: number;
      image: string;
    } | null>(Condition.similarMarket)(
      {
        similarMarketImage: 'https://img',
        similarMarkets: ['m1'],
        similarMarketVolume: 100,
        similarMarketVolume24h: 50,
      },
      {},
      {},
      null
    )) as { volume24h: number; image: string };
    expect(result.image).toBe('https://img');
    expect(result.volume24h).toBe(50);
  });

  it('conditions(filter: { outcome: YES }) translates to settled + resolvedToYes', async () => {
    await callResolver(conditions)(
      null,
      { first: 50, filter: { outcome: 'YES' } },
      {},
      null
    );
    expect(mockPrisma.condition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          settled: true,
          resolvedToYes: true,
          nonDecisive: false,
        }),
      })
    );
  });

  it('conditions(filter: { search }) ORs across question and description', async () => {
    await callResolver(conditions)(
      null,
      { first: 50, filter: { search: 'btc' } },
      {},
      null
    );
    expect(mockPrisma.condition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { question: { contains: 'btc', mode: 'insensitive' } },
            { description: { contains: 'btc', mode: 'insensitive' } },
          ],
        }),
      })
    );
  });

  it('condition(conditionId:) lowercases the lookup', async () => {
    await callResolver(condition)(
      null,
      { conditionId: CONDITION_ID.toUpperCase() },
      {},
      null
    );
    expect(mockPrisma.condition.findUnique).toHaveBeenCalledWith({
      where: { id: CONDITION_ID },
    });
  });
});
