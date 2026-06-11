import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2 } from '../relay/nodeRegistry';
import { encodeCursor } from '../relay/cursor';

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

  it('settled/resolvedToYes/nonDecisive derive from outcome (v1-compat conveniences)', () => {
    // Unsettled: outcome === null → all three false.
    const unsettled = {
      settled: false,
      resolvedToYes: false,
      nonDecisive: false,
    };
    expect(
      callResolver<boolean>(Condition.settled)(unsettled, {}, {}, null)
    ).toBe(false);
    expect(
      callResolver<boolean>(Condition.resolvedToYes)(unsettled, {}, {}, null)
    ).toBe(false);
    expect(
      callResolver<boolean>(Condition.nonDecisive)(unsettled, {}, {}, null)
    ).toBe(false);

    // Settled YES: outcome === YES.
    const yes = { settled: true, resolvedToYes: true, nonDecisive: false };
    expect(callResolver<boolean>(Condition.settled)(yes, {}, {}, null)).toBe(
      true
    );
    expect(
      callResolver<boolean>(Condition.resolvedToYes)(yes, {}, {}, null)
    ).toBe(true);
    expect(
      callResolver<boolean>(Condition.nonDecisive)(yes, {}, {}, null)
    ).toBe(false);

    // Settled NO: outcome === NO.
    const no = { settled: true, resolvedToYes: false, nonDecisive: false };
    expect(callResolver<boolean>(Condition.settled)(no, {}, {}, null)).toBe(
      true
    );
    expect(
      callResolver<boolean>(Condition.resolvedToYes)(no, {}, {}, null)
    ).toBe(false);
    expect(callResolver<boolean>(Condition.nonDecisive)(no, {}, {}, null)).toBe(
      false
    );

    // Settled NON_DECISIVE: outcome === NON_DECISIVE.
    const nd = { settled: true, resolvedToYes: false, nonDecisive: true };
    expect(callResolver<boolean>(Condition.settled)(nd, {}, {}, null)).toBe(
      true
    );
    expect(
      callResolver<boolean>(Condition.resolvedToYes)(nd, {}, {}, null)
    ).toBe(false);
    expect(callResolver<boolean>(Condition.nonDecisive)(nd, {}, {}, null)).toBe(
      true
    );
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

  it('flat similarMarketVolume* mirrors return the matching nested similarMarket value', () => {
    const parent = {
      similarMarketVolume: 100,
      similarMarketVolume1h: 1,
      similarMarketVolume4h: 4,
      similarMarketVolume24h: 24,
      similarMarketVolume7d: 7,
      similarMarketVolumeFiltered1h: 11,
      similarMarketVolumeFiltered4h: 44,
      similarMarketVolumeFiltered24h: 244,
      similarMarketVolumeFiltered7d: 77,
    };
    const flat = (field: keyof typeof parent) =>
      callResolver<number>(Condition[field as keyof typeof Condition])(
        parent,
        {},
        {},
        null
      );
    expect(flat('similarMarketVolume')).toBe(100);
    expect(flat('similarMarketVolume1h')).toBe(1);
    expect(flat('similarMarketVolume4h')).toBe(4);
    expect(flat('similarMarketVolume24h')).toBe(24);
    expect(flat('similarMarketVolume7d')).toBe(7);
    expect(flat('similarMarketVolumeFiltered1h')).toBe(11);
    expect(flat('similarMarketVolumeFiltered4h')).toBe(44);
    expect(flat('similarMarketVolumeFiltered24h')).toBe(244);
    expect(flat('similarMarketVolumeFiltered7d')).toBe(77);
  });

  it('flat similarMarketVolume* mirrors are 0 when similarMarket is null (no signal present)', () => {
    // A condition with no Polymarket linkage — `similarMarket` resolves to
    // null, and every flat mirror must read 0 rather than null for v1
    // string-index compatibility.
    const parent = {
      similarMarketImage: null,
      similarMarkets: [],
      similarMarketVolume: null,
      similarMarketVolume1h: null,
      similarMarketVolume4h: null,
      similarMarketVolume24h: null,
      similarMarketVolume7d: null,
      similarMarketVolumeFiltered1h: null,
      similarMarketVolumeFiltered4h: null,
      similarMarketVolumeFiltered24h: null,
      similarMarketVolumeFiltered7d: null,
    };
    // Guard: this parent really does produce a null nested similarMarket.
    expect(
      callResolver<unknown>(Condition.similarMarket)(parent, {}, {}, null)
    ).toBeNull();

    const fields = [
      'similarMarketVolume',
      'similarMarketVolume1h',
      'similarMarketVolume4h',
      'similarMarketVolume24h',
      'similarMarketVolume7d',
      'similarMarketVolumeFiltered1h',
      'similarMarketVolumeFiltered4h',
      'similarMarketVolumeFiltered24h',
      'similarMarketVolumeFiltered7d',
    ] as const;
    for (const field of fields) {
      expect(
        callResolver<number>(Condition[field as keyof typeof Condition])(
          parent,
          {},
          {},
          null
        )
      ).toBe(0);
    }
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

  it('conditions(filter: { resolvers }) is a case-insensitive IN over the lowercase resolver column', async () => {
    await callResolver(conditions)(
      null,
      {
        first: 50,
        filter: {
          resolvers: [
            '0xABCDEF0000000000000000000000000000000000',
            '0x1111111111111111111111111111111111111111',
          ],
        },
      },
      {},
      null
    );
    expect(mockPrisma.condition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          resolver: {
            in: [
              '0xabcdef0000000000000000000000000000000000',
              '0x1111111111111111111111111111111111111111',
            ],
          },
        }),
      })
    );
  });

  it('conditions(filter: { resolvers }, orderBy: OPEN_INTEREST) carries the resolver IN into the raw SQL path', async () => {
    await callResolver(conditions)(
      null,
      {
        first: 50,
        orderBy: { field: 'OPEN_INTEREST', direction: 'DESC' },
        filter: { resolvers: ['0xABCDEF0000000000000000000000000000000000'] },
      },
      {},
      null
    );
    // OI ordering routes through the raw numeric query; the resolver filter
    // is interpolated as a lowercased bind value on the nested whereSql
    // fragment, not lost.
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    const rawArgs = mockPrisma.$queryRaw.mock.calls[0] as unknown[];
    const boundValues = rawArgs.flatMap((arg) =>
      arg &&
      typeof arg === 'object' &&
      Array.isArray((arg as { values?: unknown[] }).values)
        ? (arg as { values: unknown[] }).values
        : []
    );
    expect(boundValues).toContain('0xabcdef0000000000000000000000000000000000');
  });

  it('conditions(filter: { search }) ORs across question, shortName, and description', async () => {
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
            { shortName: { contains: 'btc', mode: 'insensitive' } },
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

  it('conditions(after:) totalCount counts the full filtered set, not just rows after the cursor', async () => {
    const after = encodeCursor({ k: '2026-01-01T00:00:00.000Z', id: '0xabc' });
    const result = (await callResolver(conditions)(
      null,
      { first: 10, after, orderBy: { field: 'CREATED_AT', direction: 'DESC' } },
      {},
      null
    )) as { totalCount: unknown };

    // totalCount is a lazy thunk — invoke it to trigger the count query.
    const total = result.totalCount;
    if (typeof total === 'function') await (total as () => Promise<number>)();

    // The page query positions via Prisma's native id cursor — createdAt is
    // Timestamp(6), so a JS-Date ms keyset would duplicate same-millisecond
    // rows; the cursor lives in `cursor`/`skip`, not the where...
    expect(mockPrisma.condition.findMany.mock.calls[0]?.[0]?.cursor).toEqual({
      id: '0xabc',
    });
    expect(mockPrisma.condition.findMany.mock.calls[0]?.[0]?.skip).toBe(1);
    // ...but the COUNT must use only the base where, so totalCount is the full
    // filtered count and stays stable across pages — not "rows after the cursor".
    expect(mockPrisma.condition.count.mock.calls[0]?.[0]?.where).toEqual({
      public: true,
    });
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
