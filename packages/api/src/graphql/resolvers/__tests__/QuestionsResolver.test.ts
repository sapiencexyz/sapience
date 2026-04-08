import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  conditionGroup: {
    findMany: vi.fn(),
  },
  condition: {
    findMany: vi.fn(),
  },
}));

// The resolver imports ConditionGroup, Condition, SortOrder from the generated
// type-graphql package and getPrismaFromContext from its helpers.  These are
// generated at build time and not available to Vitest's Vite resolver, so we
// provide lightweight stubs.
vi.mock('@generated/type-graphql', () => ({
  ConditionGroup: class ConditionGroup {},
  Condition: class Condition {},
  SortOrder: { asc: 'asc', desc: 'desc' },
}));
vi.mock('@generated/type-graphql/helpers', () => ({
  getPrismaFromContext: (ctx: Record<string, unknown>) => ctx.prisma,
}));

import {
  QuestionsResolver,
  QuestionItemType,
  QuestionSortField,
  ResolutionStatus,
} from '../QuestionsResolver';
import type { ApolloContext } from '../../startApolloServer';
import type { SortOrder } from '@generated/type-graphql';

/**
 * Recursively flatten a tagged-template mock call into a single SQL string.
 * Prisma.sql fragments are nested Sql objects ({strings, values}); primitive
 * interpolations are replaced with '?'.
 */
function flattenSql(args: unknown[]): string {
  const strings = args[0] as string[];
  const values = args.slice(1);
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (
        v &&
        typeof v === 'object' &&
        'strings' in (v as Record<string, unknown>)
      ) {
        const sqlObj = v as { strings: string[]; values: unknown[] };
        result += flattenSql([sqlObj.strings, ...sqlObj.values]);
      } else {
        result += '?';
      }
    }
  }
  return result;
}

describe('QuestionsResolver', () => {
  let resolver: QuestionsResolver;

  const callQuestions = (overrides: Record<string, unknown> = {}) =>
    resolver.questions(
      { prisma: mockPrisma } as unknown as ApolloContext,
      (overrides.take as number) ?? 50,
      (overrides.skip as number) ?? 0,
      (overrides.chainId as number) ?? null,
      (overrides.sortField as QuestionSortField) ?? null,
      (overrides.sortDirection as SortOrder) ?? 'desc',
      (overrides.search as string) ?? null,
      (overrides.categorySlugs as string[]) ?? null,
      (overrides.minEndTime as number) ?? null,
      (overrides.resolutionStatus as ResolutionStatus) ?? null,
      (overrides.minEstimatedPrice as number) ?? null,
      (overrides.maxEstimatedPrice as number) ?? null,
      (overrides.tag as string) ?? null
    );

  /** Extract the full SQL text from the first $queryRaw call. */
  const getCapturedSql = () => flattenSql(mockPrisma.$queryRaw.mock.calls[0]);

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new QuestionsResolver();
  });

  it('returns [] when SQL finds no results', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const result = await callQuestions();

    expect(result).toEqual([]);
    expect(mockPrisma.conditionGroup.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.condition.findMany).not.toHaveBeenCalled();
  });

  it('unwraps single-condition groups as standalone conditions', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: BigInt(42),
      },
    ]);

    const fakeGroup = {
      id: 1,
      name: 'Test Group',
      condition: [{ id: 'c1', question: 'Q1' }],
    };
    mockPrisma.conditionGroup.findMany.mockResolvedValue([fakeGroup]);
    mockPrisma.condition.findMany.mockResolvedValue([]);

    const result = await callQuestions();

    expect(result).toHaveLength(1);
    expect(result[0].questionType).toBe(QuestionItemType.condition);
    expect(result[0].condition).toEqual({ id: 'c1', question: 'Q1' });
    expect(result[0].group).toBeNull();
    expect(result[0].predictionCount).toBe(42);
  });

  it('returns multi-condition groups as groups with predictionCount from BigInt', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: BigInt(42),
      },
    ]);

    const fakeGroup = {
      id: 1,
      name: 'Test Group',
      condition: [
        { id: 'c1', question: 'Q1' },
        { id: 'c2', question: 'Q2' },
      ],
    };
    mockPrisma.conditionGroup.findMany.mockResolvedValue([fakeGroup]);
    mockPrisma.condition.findMany.mockResolvedValue([]);

    const result = await callQuestions();

    expect(result).toHaveLength(1);
    expect(result[0].questionType).toBe(QuestionItemType.group);
    expect(result[0].group).toBeTruthy();
    expect(result[0].condition).toBeNull();
    expect(result[0].predictionCount).toBe(42);
  });

  it('assembles condition items with questionType, condition populated, group null', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'cond-abc',
        prediction_count: BigInt(7),
      },
    ]);

    const fakeCondition = { id: 'cond-abc', question: 'Will it rain?' };
    mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
    mockPrisma.condition.findMany.mockResolvedValue([fakeCondition]);

    const result = await callQuestions();

    expect(result).toHaveLength(1);
    expect(result[0].questionType).toBe(QuestionItemType.condition);
    expect(result[0].condition).toBeTruthy();
    expect(result[0].group).toBeNull();
    expect(result[0].predictionCount).toBe(7);
  });

  it('preserves SQL sort order across mixed group/condition results', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'c1',
        prediction_count: BigInt(10),
      },
      {
        item_type: 'group',
        group_id: 2,
        condition_id: null,
        prediction_count: BigInt(20),
      },
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'c2',
        prediction_count: BigInt(5),
      },
    ]);

    mockPrisma.conditionGroup.findMany.mockResolvedValue([
      {
        id: 2,
        name: 'G2',
        condition: [
          { id: 'g2c1', question: 'GQ1' },
          { id: 'g2c2', question: 'GQ2' },
        ],
      },
    ]);
    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'c1', question: 'Q1' },
      { id: 'c2', question: 'Q2' },
    ]);

    const result = await callQuestions();

    expect(result).toHaveLength(3);
    expect(result[0].questionType).toBe(QuestionItemType.condition);
    expect(result[0].condition!.id).toBe('c1');
    expect(result[1].questionType).toBe(QuestionItemType.group);
    expect(result[1].group!.id).toBe(2);
    expect(result[2].questionType).toBe(QuestionItemType.condition);
    expect(result[2].condition!.id).toBe('c2');
  });

  it('preserves SQL sort order even when Prisma returns records in different order', async () => {
    // SQL returns items in sort order: g1, c1, g2, c2, g3
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 10,
        condition_id: null,
        prediction_count: BigInt(100),
      },
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'cA',
        prediction_count: BigInt(50),
      },
      {
        item_type: 'group',
        group_id: 20,
        condition_id: null,
        prediction_count: BigInt(30),
      },
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'cB',
        prediction_count: BigInt(10),
      },
      {
        item_type: 'group',
        group_id: 30,
        condition_id: null,
        prediction_count: BigInt(5),
      },
    ]);

    // Prisma returns groups in REVERSE order (simulating arbitrary DB return order)
    mockPrisma.conditionGroup.findMany.mockResolvedValue([
      {
        id: 30,
        name: 'G30',
        condition: [
          { id: 'g30c1', question: 'Q30a' },
          { id: 'g30c2', question: 'Q30b' },
        ],
      },
      {
        id: 10,
        name: 'G10',
        condition: [
          { id: 'g10c1', question: 'Q10a' },
          { id: 'g10c2', question: 'Q10b' },
        ],
      },
      {
        id: 20,
        name: 'G20',
        condition: [
          { id: 'g20c1', question: 'Q20a' },
          { id: 'g20c2', question: 'Q20b' },
        ],
      },
    ]);
    // Prisma returns conditions in REVERSE order
    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'cB', question: 'Condition B' },
      { id: 'cA', question: 'Condition A' },
    ]);

    const result = await callQuestions();

    // Result must match the SQL order, NOT the Prisma return order
    expect(result).toHaveLength(5);
    expect(result[0].questionType).toBe(QuestionItemType.group);
    expect(result[0].group!.id).toBe(10);
    expect(result[1].questionType).toBe(QuestionItemType.condition);
    expect(result[1].condition!.id).toBe('cA');
    expect(result[2].questionType).toBe(QuestionItemType.group);
    expect(result[2].group!.id).toBe(20);
    expect(result[3].questionType).toBe(QuestionItemType.condition);
    expect(result[3].condition!.id).toBe('cB');
    expect(result[4].questionType).toBe(QuestionItemType.group);
    expect(result[4].group!.id).toBe(30);
  });

  it('unwrapped single-condition groups maintain their SQL position among other items', async () => {
    // SQL order: condition, single-condition-group (will unwrap), multi-condition-group, condition
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'c1',
        prediction_count: BigInt(100),
      },
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: BigInt(80),
      },
      {
        item_type: 'group',
        group_id: 2,
        condition_id: null,
        prediction_count: BigInt(50),
      },
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'c2',
        prediction_count: BigInt(10),
      },
    ]);

    mockPrisma.conditionGroup.findMany.mockResolvedValue([
      // Group 1: single condition -> will be unwrapped
      {
        id: 1,
        name: 'SingleGroup',
        condition: [{ id: 'sg1', question: 'Single Q' }],
      },
      // Group 2: multi condition -> stays as group
      {
        id: 2,
        name: 'MultiGroup',
        condition: [
          { id: 'mg1', question: 'Multi Q1' },
          { id: 'mg2', question: 'Multi Q2' },
        ],
      },
    ]);
    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'c1', question: 'Standalone 1' },
      { id: 'c2', question: 'Standalone 2' },
    ]);

    const result = await callQuestions();

    expect(result).toHaveLength(4);
    // Position 0: standalone condition c1
    expect(result[0].questionType).toBe(QuestionItemType.condition);
    expect(result[0].condition!.id).toBe('c1');
    // Position 1: unwrapped single-condition group -> becomes condition sg1
    expect(result[1].questionType).toBe(QuestionItemType.condition);
    expect(result[1].condition!.id).toBe('sg1');
    // Position 2: multi-condition group stays as group
    expect(result[2].questionType).toBe(QuestionItemType.group);
    expect(result[2].group!.id).toBe(2);
    // Position 3: standalone condition c2
    expect(result[3].questionType).toBe(QuestionItemType.condition);
    expect(result[3].condition!.id).toBe('c2');
  });

  it('skips items when findMany does not return a matching record', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 999,
        condition_id: null,
        prediction_count: BigInt(1),
      },
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'missing',
        prediction_count: BigInt(1),
      },
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'exists',
        prediction_count: BigInt(3),
      },
    ]);

    mockPrisma.conditionGroup.findMany.mockResolvedValue([]); // group 999 not returned
    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'exists', question: 'Found' },
    ]); // 'missing' not returned

    const result = await callQuestions();

    expect(result).toHaveLength(1);
    expect(result[0].questionType).toBe(QuestionItemType.condition);
    expect(result[0].condition!.id).toBe('exists');
  });

  it('only calls conditionGroup.findMany when group IDs present (not condition.findMany)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: BigInt(5),
      },
    ]);

    mockPrisma.conditionGroup.findMany.mockResolvedValue([
      { id: 1, name: 'G1', condition: [] },
    ]);

    await callQuestions();

    expect(mockPrisma.conditionGroup.findMany).toHaveBeenCalledOnce();
    expect(mockPrisma.condition.findMany).not.toHaveBeenCalled();
  });

  it('only calls condition.findMany when condition IDs present (not conditionGroup.findMany)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'c1',
        prediction_count: BigInt(3),
      },
    ]);

    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'c1', question: 'Q1' },
    ]);

    await callQuestions();

    expect(mockPrisma.condition.findMany).toHaveBeenCalledOnce();
    expect(mockPrisma.conditionGroup.findMany).not.toHaveBeenCalled();
  });

  it('maps Prisma condition field to GraphQL conditions on group output', async () => {
    const nestedConditions = [
      { id: 'c1', question: 'Sub Q1' },
      { id: 'c2', question: 'Sub Q2' },
    ];

    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 10,
        condition_id: null,
        prediction_count: BigInt(100),
      },
    ]);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([
      { id: 10, name: 'Multi', condition: nestedConditions },
    ]);

    const result = await callQuestions();

    expect(result).toHaveLength(1);
    const group = result[0].group as unknown as Record<string, unknown>;
    // Prisma returns 'condition' but GraphQL expects 'conditions'
    expect(group.conditions).toEqual(nestedConditions);
  });

  it('skips groups with zero conditions after filtering', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: BigInt(0),
      },
    ]);

    mockPrisma.conditionGroup.findMany.mockResolvedValue([
      { id: 1, name: 'Empty Group', condition: [] },
    ]);
    mockPrisma.condition.findMany.mockResolvedValue([]);

    const result = await callQuestions();

    expect(result).toHaveLength(0);
  });

  // ---------- SQL-structure assertions ----------

  describe('SQL structure', () => {
    beforeEach(() => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
    });

    it('uses denormalized columns (no LATERAL) when no per-condition filters', async () => {
      await callQuestions();
      const sql = getCapturedSql();

      expect(sql).not.toContain('CROSS JOIN LATERAL');
      expect(sql).toContain('cg."totalPredictionCount"');
    });

    it('uses LEFT JOIN + GROUP BY for filtered group aggregates when chainId filter is active', async () => {
      await callQuestions({ chainId: 1 });
      const sql = getCapturedSql();

      expect(sql).toContain('LEFT JOIN condition c ON');
      expect(sql).toContain('GROUP BY cg.id');
      // Should compute aggregates from filtered conditions, not denormalized columns
      expect(sql).toContain('SUM');
    });

    it('uses LEFT JOIN + GROUP BY when resolutionStatus filter is active', async () => {
      await callQuestions({ resolutionStatus: ResolutionStatus.unresolved });
      const sql = getCapturedSql();

      expect(sql).toContain('LEFT JOIN condition c ON');
      expect(sql).toContain('GROUP BY cg.id');
    });

    it('uses LEFT JOIN + GROUP BY when price filter is active', async () => {
      await callQuestions({ minEstimatedPrice: 0.2 });
      const sql = getCapturedSql();

      expect(sql).toContain('LEFT JOIN condition c ON');
      expect(sql).toContain('GROUP BY cg.id');
    });

    it('group search matches individual condition questions and shortNames', async () => {
      await callQuestions({ search: 'Chicago Bulls' });
      const sql = getCapturedSql();

      // Part A search should match condition question/shortName, not just group name
      expect(sql).toContain('c_search.question ILIKE');
      expect(sql).toContain('c_search."shortName" ILIKE');
    });

    it('Part B only fetches ungrouped conditions (no LEFT JOIN, two UNION parts)', async () => {
      await callQuestions();
      const sql = getCapturedSql();

      // Part B no longer needs LEFT JOIN — only ungrouped conditions
      expect(sql).not.toContain('LEFT JOIN condition_group');
      expect(sql).toContain('"conditionGroupId" IS NULL');
      // Should have exactly one UNION ALL (Part A + Part B)
      const unionCount = (sql.match(/UNION ALL/g) || []).length;
      expect(unionCount).toBe(1);
    });

    describe('similarMarketVolume sort field', () => {
      it('uses similarMarketVolume in sort expression for unfiltered groups (subquery path)', async () => {
        await callQuestions({
          sortField: QuestionSortField.similarMarketVolume,
        });
        const sql = getCapturedSql();

        // Unfiltered path: group sort value should use a subquery summing similarMarketVolume
        expect(sql).not.toContain('CROSS JOIN LATERAL');
        expect(sql).toContain('SUM(c."similarMarketVolume")');
        // Ungrouped condition sort value should also reference similarMarketVolume
        expect(sql).toContain('c."similarMarketVolume"');
      });

      it('uses similarMarketVolume in LEFT JOIN sort expression for filtered groups', async () => {
        await callQuestions({
          sortField: QuestionSortField.similarMarketVolume,
          resolutionStatus: ResolutionStatus.unresolved,
        });
        const sql = getCapturedSql();

        // Filtered path: LEFT JOIN + GROUP BY should compute SUM(similarMarketVolume) from filtered conditions
        expect(sql).toContain('LEFT JOIN condition c ON');
        expect(sql).toContain('SUM(c."similarMarketVolume")');
      });

      it('both filtered and unfiltered paths sort by the same column', async () => {
        // Unfiltered
        await callQuestions({
          sortField: QuestionSortField.similarMarketVolume,
        });
        const unfilteredSql = getCapturedSql();

        vi.clearAllMocks();
        mockPrisma.$queryRaw.mockResolvedValue([]);

        // Filtered (chainId triggers LEFT JOIN + GROUP BY)
        await callQuestions({
          sortField: QuestionSortField.similarMarketVolume,
          chainId: 1,
        });
        const filteredSql = getCapturedSql();

        // Both paths must reference the same underlying column for consistency
        const colRef = '"similarMarketVolume"';
        expect(unfilteredSql).toContain(colRef);
        expect(filteredSql).toContain(colRef);

        // Part B (ungrouped conditions) sort expression should be identical in both
        // Extract Part B from each SQL (after UNION ALL)
        const unfilteredPartB = unfilteredSql.split('UNION ALL')[1];
        const filteredPartB = filteredSql.split('UNION ALL')[1];
        expect(unfilteredPartB).toContain(colRef);
        expect(filteredPartB).toContain(colRef);
      });
    });
  });
});
