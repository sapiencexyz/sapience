import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2 } from '../relay/nodeRegistry';

const mockPrisma = vi.hoisted(() => ({
  condition: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  category: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
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
    mockPrisma.$queryRaw.mockResolvedValue([]);
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

  it('resolver lowercases the Prisma `resolver` column', () => {
    expect(
      callResolver<string>(Condition.resolver)(
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

  it('conditions() defaults to public-only when no public/id filter is given', async () => {
    await callResolver(conditions)(null, { first: 50 }, {}, null);
    expect(mockPrisma.condition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ public: true }),
      })
    );
  });

  it('conditions(filter: { public: false }) honors the explicit visibility filter', async () => {
    await callResolver(conditions)(
      null,
      { first: 50, filter: { public: false } },
      {},
      null
    );
    expect(mockPrisma.condition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ public: false }),
      })
    );
  });

  it('conditions(filter: { conditionIds }) does not force public — by-id lookups bypass the default', async () => {
    await callResolver(conditions)(
      null,
      { first: 50, filter: { conditionIds: [CONDITION_ID] } },
      {},
      null
    );
    const where = mockPrisma.condition.findMany.mock.calls[0]?.[0]?.where as {
      public?: boolean;
    };
    expect(where.public).toBeUndefined();
  });

  it('conditions(orderBy: DISPLAY_ORDER) restricts to non-null displayOrder so the keyset stays sound', async () => {
    await callResolver(conditions)(
      null,
      { first: 50, orderBy: { field: 'DISPLAY_ORDER', direction: 'ASC' } },
      {},
      null
    );
    const where = mockPrisma.condition.findMany.mock.calls[0]?.[0]?.where as {
      displayOrder?: unknown;
    };
    expect(where.displayOrder).toEqual({ not: null });
  });

  it('conditions(orderBy: END_TIME) leaves displayOrder unconstrained (non-null column)', async () => {
    await callResolver(conditions)(
      null,
      { first: 50, orderBy: { field: 'END_TIME', direction: 'ASC' } },
      {},
      null
    );
    const where = mockPrisma.condition.findMany.mock.calls[0]?.[0]?.where as {
      displayOrder?: unknown;
    };
    expect(where.displayOrder).toBeUndefined();
  });

  it('conditions(orderBy: OPEN_INTEREST) routes through a raw ::numeric query, not findMany', async () => {
    await callResolver(conditions)(
      null,
      { first: 50, orderBy: { field: 'OPEN_INTEREST', direction: 'DESC' } },
      {},
      null
    );

    // OI ordering must use the raw numeric-cast path, never the
    // lexicographic Prisma findMany on the VarChar column.
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.condition.findMany).not.toHaveBeenCalled();

    // `$queryRaw` is invoked as a tagged template, so the first arg is the
    // TemplateStringsArray; the literal `::numeric` cast lives in the static
    // SQL text (not in an interpolated value).
    const [strings] = mockPrisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(strings.join('')).toContain('::numeric');
  });

  it('conditions(orderBy: CREATED_AT) uses findMany and never touches the raw query', async () => {
    await callResolver(conditions)(
      null,
      { first: 50, orderBy: { field: 'CREATED_AT', direction: 'DESC' } },
      {},
      null
    );
    expect(mockPrisma.condition.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });
});
