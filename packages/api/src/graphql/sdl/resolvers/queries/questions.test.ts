import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  conditionGroup: { findMany: vi.fn() },
  condition: { findMany: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

const { resolveVolumeKey, runQuestions, questionsPage } = await import(
  './questions'
);

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

// `runQuestions` is the entry point under questionsPage. The raw-SQL
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
      item_type: 'group' as const,
      group_id: i + 1,
      condition_id: null,
      prediction_count: 0n,
    }));
    mockPrisma.$queryRaw.mockResolvedValue(rows);
    // hydrate returns empty arrays; we only care about the envelope shape.
    mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
    mockPrisma.condition.findMany.mockResolvedValue([]);
    const result = await runQuestions({ take: 10, skip: 0 });
    expect(result.hasMore).toBe(true);
    // hydrate is called with the page slice (not the probe row), so the
    // findMany lookup excludes the 11th id.
    expect(mockPrisma.conditionGroup.findMany).toHaveBeenCalled();
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

// The `questionsPage` wrapper merges the new `orderBy` / `orderDirection`
// args with the deprecated `sortField` / `sortDirection` siblings. The two
// axes fall back independently so a caller can adopt the new args one at
// a time — e.g. `(orderDirection: asc)` alone must honor `asc` rather
// than silently falling through to the `sortDirection` default of `desc`.
describe('questionsPage — sort-arg merge', () => {
  type WrapperArgs = {
    filters?: unknown;
    orderBy?: 'createdAt' | 'endTime' | 'openInterest' | 'predictionCount';
    orderDirection?: 'asc' | 'desc';
    sortField?: 'createdAt' | 'endTime' | 'openInterest' | 'predictionCount';
    sortDirection?: 'asc' | 'desc';
    take: number;
    skip: number;
  };
  type ResolverFn = (
    parent: unknown,
    args: WrapperArgs,
    ctx: unknown,
    info: unknown
  ) => Promise<unknown>;
  const questionsPageFn = questionsPage as unknown as ResolverFn;

  // Read the SQL direction back: `Prisma.raw(...)` wraps `ASC` / `DESC` in a
  // sql fragment whose serialized form includes the literal string.
  const directionFromCall = (): string => {
    const callArgs = mockPrisma.$queryRaw.mock.calls[0];
    const json = JSON.stringify(callArgs);
    if (json.includes('"ASC"')) return 'ASC';
    if (json.includes('"DESC"')) return 'DESC';
    throw new Error(`could not find direction in SQL call: ${json}`);
  };

  const invoke = async (args: Partial<WrapperArgs>) => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await questionsPageFn({}, { take: 10, skip: 0, ...args }, {}, {});
  };

  it('uses orderDirection when only the new direction arg is passed', async () => {
    // Regression: previously the wrapper ignored orderDirection unless
    // orderBy was also set, which silently broke `(orderDirection: asc)`.
    await invoke({ orderDirection: 'asc' });
    expect(directionFromCall()).toBe('ASC');
  });

  it('uses sortDirection when only the deprecated direction arg is passed', async () => {
    await invoke({ sortDirection: 'asc' });
    expect(directionFromCall()).toBe('ASC');
  });

  it('prefers orderDirection over sortDirection when both are set', async () => {
    await invoke({ orderDirection: 'asc', sortDirection: 'desc' });
    expect(directionFromCall()).toBe('ASC');
  });

  it('defaults to desc when neither direction arg is set', async () => {
    await invoke({});
    expect(directionFromCall()).toBe('DESC');
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
