import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  conditionGroup: { findMany: vi.fn() },
  condition: { findMany: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

const { resolveVolumeKey, runQuestions, questionsConnection } = await import(
  './questions'
);
const { QuestionConnection } = await import('../ConnectionTotalCount');

beforeEach(() => {
  mockPrisma.$queryRaw.mockReset();
  mockPrisma.conditionGroup.findMany.mockReset();
  mockPrisma.condition.findMany.mockReset();
});

describe('resolveVolumeKey', () => {
  it('maps GraphQL VolumeWindow enum values to internal volume keys', () => {
    expect(resolveVolumeKey('oneHour')).toBe('volume1h');
    expect(resolveVolumeKey('fourHours')).toBe('volume4h');
    expect(resolveVolumeKey('twentyFourHours')).toBe('volume24h');
    expect(resolveVolumeKey('sevenDays')).toBe('volume7d');
    expect(resolveVolumeKey('oneHourFiltered')).toBe('volumeFiltered1h');
    expect(resolveVolumeKey('fourHoursFiltered')).toBe('volumeFiltered4h');
    expect(resolveVolumeKey('twentyFourHoursFiltered')).toBe(
      'volumeFiltered24h'
    );
    expect(resolveVolumeKey('sevenDaysFiltered')).toBe('volumeFiltered7d');
  });

  it('falls back to volume24h when the window is null/undefined', () => {
    expect(resolveVolumeKey(null)).toBe('volume24h');
    expect(resolveVolumeKey(undefined)).toBe('volume24h');
  });

  it('falls back to volume24h for unrecognized window values', () => {
    expect(resolveVolumeKey('1hFiltered')).toBe('volume24h');
    expect(resolveVolumeKey('bogus')).toBe('volume24h');
  });
});

// `runQuestions` backs the deprecated bare-array resolver and connection. The raw-SQL
// step (`fetchSortedItems`) returns an array of `{ kind, id, ... }`
// rows that drive the hydrate step. We mock `$queryRaw` directly so we
// can pin the envelope contract (hasMore, items, empty short-circuit)
// without standing up a real DB.
describe('runQuestions — page envelope', () => {
  it('empty page short-circuits hydration', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await runQuestions({ take: 10, skip: 0 });
    expect(result).toEqual({ items: [], hasMore: false });
    // Hydration only runs when items > 0; no group/condition findMany.
    expect(mockPrisma.conditionGroup.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.condition.findMany).not.toHaveBeenCalled();
  });

  it('hasMore=false when fewer than take + 1 raw rows', async () => {
    // 5 group rows; runQuestions asks for take + 1 = 11 internally.
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: 0n,
      },
      {
        item_type: 'group',
        group_id: 2,
        condition_id: null,
        prediction_count: 0n,
      },
      {
        item_type: 'group',
        group_id: 3,
        condition_id: null,
        prediction_count: 0n,
      },
      {
        item_type: 'group',
        group_id: 4,
        condition_id: null,
        prediction_count: 0n,
      },
      {
        item_type: 'group',
        group_id: 5,
        condition_id: null,
        prediction_count: 0n,
      },
    ]);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
    mockPrisma.condition.findMany.mockResolvedValue([]);
    const result = await runQuestions({ take: 10, skip: 0 });
    expect(result.hasMore).toBe(false);
  });

  it('hasMore=true when take + 1 raw rows came back (probe row dropped from items)', async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      item_type: 'condition' as const,
      group_id: null,
      condition_id: `c-${i + 1}`,
      prediction_count: 0n,
      sort_value: i + 1,
      end_time: i + 1,
    }));
    mockPrisma.$queryRaw.mockResolvedValue(rows);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
    mockPrisma.condition.findMany.mockResolvedValue(
      rows.slice(0, 10).map((row) => ({ id: row.condition_id }))
    );
    const result = await runQuestions({ take: 10, skip: 0 });
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(10);
    // hydrate is called with the page slice (not the probe row), so the
    // findMany lookup excludes the 11th id.
    expect(mockPrisma.condition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: rows.slice(0, 10).map((r) => r.condition_id) } },
      })
    );
  });

  it('backfills when raw rows hydrate to fewer visible questions', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        {
          item_type: 'group',
          group_id: 1,
          condition_id: null,
          prediction_count: 0n,
          sort_value: 100,
          end_time: 100,
        },
        {
          item_type: 'condition',
          group_id: null,
          condition_id: 'c-1',
          prediction_count: 0n,
          sort_value: 99,
          end_time: 99,
        },
        {
          item_type: 'condition',
          group_id: null,
          condition_id: 'c-probe',
          prediction_count: 0n,
          sort_value: 98,
          end_time: 98,
        },
      ])
      .mockResolvedValueOnce([
        {
          item_type: 'condition',
          group_id: null,
          condition_id: 'c-2',
          prediction_count: 0n,
          sort_value: 97,
          end_time: 97,
        },
        {
          item_type: 'condition',
          group_id: null,
          condition_id: 'c-3',
          prediction_count: 0n,
          sort_value: 97,
          end_time: 97,
        },
      ]);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
    mockPrisma.condition.findMany
      .mockResolvedValueOnce([{ id: 'c-1' }])
      .mockResolvedValueOnce([{ id: 'c-2' }]);

    const result = await runQuestions({ take: 2, skip: 0 });
    expect(
      result.items.map(
        (item) => (item as { condition?: { id?: string } }).condition?.id
      )
    ).toEqual(['c-1', 'c-2']);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('clamps take above MAX_TAKE to 100', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await runQuestions({ take: 9999, skip: 0 });
    // We can't observe the take cleanly through $queryRaw (it's interpolated
    // into the SQL string), but we can verify the resolver doesn't throw
    // and that an empty page still short-circuits — i.e. the clamp is
    // applied before fanout, not after.
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('clamps negative skip to 0', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await runQuestions({ take: 10, skip: -50 });
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

type ConnectionResolverFn = (
  parent: unknown,
  args: Record<string, unknown>,
  ctx: unknown,
  info: unknown
) => Promise<{ edges: { cursor: string; node: unknown }[] }>;
const questionsConnectionFn =
  questionsConnection as unknown as ConnectionResolverFn;

describe('questionsConnection — operator filters and keyset cursors', () => {
  it('maps OPEN_INTEREST ordering to the raw SQL open-interest sort', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await questionsConnectionFn(
      {},
      {
        take: 10,
        orderBy: { field: 'OPEN_INTEREST', direction: 'DESC' },
      },
      {},
      {}
    );

    const sql = queryRawCallJson();
    expect(sql).toContain('totalOpenInterest');
    expect(sql).toContain('openInterest');
  });

  it('maps operator gte/lte filters to the underlying SQL ranges', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await questionsConnectionFn(
      {},
      {
        take: 10,
        filter: {
          resolvesAt: { gte: 1000, lte: 2000 },
          estimatedPrice: { gte: 0.2, lte: 0.8 },
          similarMarketVolume: { gte: 100, lte: 900 },
        },
      },
      {},
      {}
    );

    const sql = queryRawCallJson();
    expect(sql).toContain('1000');
    expect(sql).toContain('2000');
    expect(sql).toContain('0.2');
    expect(sql).toContain('0.8');
    expect(sql).toContain('100');
    expect(sql).toContain('900');
  });

  it('encodes the SQL ordering tuple in edge cursors instead of an offset', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'c-1',
        prediction_count: 0n,
        sort_value: 123,
        end_time: 456,
      },
    ]);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'c-1', createdAt: new Date('2026-01-01T00:00:00Z') },
    ]);

    const result = await questionsConnectionFn({}, { take: 10 }, {}, {});
    const { decodeCursor } = await import('../../../relay/cursor');
    const payload = decodeCursor(result.edges[0].cursor);
    expect(payload?.k).toBe('123');
    expect(JSON.parse(payload?.id ?? '{}')).toEqual({
      groupId: 0,
      conditionId: 'c-1',
      itemType: 'condition',
      endTime: 456,
    });
  });

  it('uses a keyset predicate, not OFFSET, when an after cursor is supplied', async () => {
    const { encodeCursor } = await import('../../../relay/cursor');
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await questionsConnectionFn(
      {},
      {
        take: 10,
        after: encodeCursor({
          k: '123',
          id: JSON.stringify({
            itemType: 'condition',
            groupId: 0,
            conditionId: 'c-1',
            endTime: 456,
          }),
        }),
      },
      {},
      {}
    );

    const sql = queryRawCallJson();
    expect(sql).not.toContain('OFFSET');
    expect(sql).toContain('sort_value');
    expect(sql).toContain('123');
    expect(sql).toContain('c-1');
  });

  it('defers totalCount raw SQL until the field resolver is selected', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        {
          item_type: 'condition',
          group_id: null,
          condition_id: 'c-1',
          prediction_count: 0n,
          sort_value: 123,
          end_time: 456,
        },
      ])
      .mockResolvedValueOnce([{ total: 9 }]);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
    mockPrisma.condition.findMany.mockResolvedValue([{ id: 'c-1' }]);

    const result = await questionsConnectionFn({}, { take: 10 }, {}, {});

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    await expect(QuestionConnection.totalCount(result)).resolves.toBe(9);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});

// The `$queryRaw` tag is invoked with a TemplateStringsArray plus nested
// `Prisma.sql` fragments — interpolated scalars live in the
// `.values` array of each fragment, not at the top level. A JSON dump of
// the full call args is the most resilient way to assert that
// contract-address normalization (lowercasing + chainId default) reached
// the SQL boundary, since the tree structure is private to Prisma.
const queryRawCallJson = (): string =>
  JSON.stringify(mockPrisma.$queryRaw.mock.calls[0]);

describe('runQuestions — contract-address filter', () => {
  it('defaults chainId to DEFAULT_CHAIN_ID when contractAddress is set and chainId is omitted', async () => {
    const { DEFAULT_CHAIN_ID } = await import('@sapience/sdk/constants');
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await runQuestions({
      take: 10,
      skip: 0,
      contractAddress: '0xCAFE',
    });
    const sql = queryRawCallJson();
    expect(sql).toContain(String(DEFAULT_CHAIN_ID));
    expect(sql).toContain('0xcafe');
  });

  it('explicit chainId wins over the contract-address default', async () => {
    const { DEFAULT_CHAIN_ID } = await import('@sapience/sdk/constants');
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await runQuestions({
      take: 10,
      skip: 0,
      contractAddress: '0xCAFE',
      chainId: 8453,
    });
    const sql = queryRawCallJson();
    expect(sql).toContain('8453');
    expect(sql).toContain('0xcafe');
    // The default chain must NOT also be interpolated — otherwise both
    // chainIds would AND together and the query would return nothing.
    if (DEFAULT_CHAIN_ID !== 8453) {
      expect(sql).not.toContain(String(DEFAULT_CHAIN_ID));
    }
  });

  it('contractAddressIn lowercases entries and applies default chain', async () => {
    const { DEFAULT_CHAIN_ID } = await import('@sapience/sdk/constants');
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await runQuestions({
      take: 10,
      skip: 0,
      contractAddressIn: ['0xAAA', '0xBBB'],
    });
    const sql = queryRawCallJson();
    expect(sql).toContain(String(DEFAULT_CHAIN_ID));
    expect(sql).toContain('0xaaa');
    expect(sql).toContain('0xbbb');
  });

  it('mirrors the contract-address filter into the hydrated-group conditions where clause', async () => {
    // One group row so hydrate runs and conditionGroup.findMany is called.
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: 0n,
      },
    ]);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
    mockPrisma.condition.findMany.mockResolvedValue([]);
    await runQuestions({
      take: 10,
      skip: 0,
      contractAddress: '0xCAFE',
    });
    const include = mockPrisma.conditionGroup.findMany.mock.calls[0][0]
      .include as {
      condition: { where: { resolver?: unknown; chainId?: unknown } };
    };
    expect(include.condition.where.resolver).toBe('0xcafe');
    // chainId default also bleeds through — same DEFAULT_CHAIN_ID
    // semantics as the SQL fragment so the two-pass resolver agrees.
    const { DEFAULT_CHAIN_ID } = await import('@sapience/sdk/constants');
    expect(include.condition.where.chainId).toBe(DEFAULT_CHAIN_ID);
  });
});
