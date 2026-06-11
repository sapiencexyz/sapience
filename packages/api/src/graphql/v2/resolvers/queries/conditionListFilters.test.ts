import { describe, expect, it } from 'vitest';

import {
  buildConditionListFilters,
  type ConditionListFilterResult,
  type ConditionOrderField,
} from './conditionListFilters';

/**
 * `buildConditionListFilters` is a pure function over the v2
 * `conditions(filter:)` args — no prisma mock needed. The generated
 * `ConditionFilter` arg type gains `categorySlugs` / `ungrouped` at the
 * next codegen run; the loose call signature below keeps the suite
 * independent of that regen.
 */
const build = buildConditionListFilters as unknown as (
  args: { filter?: Record<string, unknown> | null },
  orderField: ConditionOrderField
) => ConditionListFilterResult;

/** Raw SQL text of the combined fragment (`?`-placeholder form). */
const sqlText = (result: ConditionListFilterResult): string =>
  (result.whereSql as unknown as { sql: string }).sql;
const sqlValues = (result: ConditionListFilterResult): unknown[] =>
  (result.whereSql as unknown as { values: unknown[] }).values;

describe('buildConditionListFilters (v2)', () => {
  it('categorySlugs filters by slug IN-set on both the Prisma where and the SQL fragment', () => {
    const result = build(
      { filter: { categorySlugs: ['sports', 'crypto'] } },
      'createdAt'
    );

    expect(result.where.category).toEqual({
      is: { slug: { in: ['sports', 'crypto'] } },
    });
    expect(result.needsCategoryJoin).toBe(true);
    expect(sqlText(result)).toContain('cat.slug IN');
    expect(sqlValues(result)).toEqual(
      expect.arrayContaining(['sports', 'crypto'])
    );
  });

  it('categorySlugs supersedes the single categorySlug when both are given', () => {
    const result = build(
      { filter: { categorySlugs: ['sports'], categorySlug: 'crypto' } },
      'createdAt'
    );

    expect(result.where.category).toEqual({
      is: { slug: { in: ['sports'] } },
    });
    expect(sqlValues(result)).not.toContain('crypto');
  });

  it('ungrouped: true restricts to conditions with no parent group', () => {
    const result = build({ filter: { ungrouped: true } }, 'createdAt');

    expect(result.where.conditionGroupId).toBeNull();
    expect(sqlText(result)).toContain('"conditionGroupId" IS NULL');
  });

  it('ungrouped: false restricts to grouped conditions', () => {
    const result = build({ filter: { ungrouped: false } }, 'createdAt');

    expect(result.where.conditionGroupId).toEqual({ not: null });
    expect(sqlText(result)).toContain('"conditionGroupId" IS NOT NULL');
  });

  it('search ORs across question, shortName, and description in BOTH the Prisma where and the SQL fragment', () => {
    const result = build({ filter: { search: 'cle/tor' } }, 'createdAt');

    expect(result.where.OR).toEqual([
      { question: { contains: 'cle/tor', mode: 'insensitive' } },
      { shortName: { contains: 'cle/tor', mode: 'insensitive' } },
      { description: { contains: 'cle/tor', mode: 'insensitive' } },
    ]);
    expect(sqlText(result)).toContain('"shortName" ILIKE');
  });

  it('ungrouped omitted leaves conditionGroupId unconstrained', () => {
    const result = build({ filter: {} }, 'createdAt');

    expect(result.where.conditionGroupId).toBeUndefined();
    expect(sqlText(result)).not.toContain('conditionGroupId');
  });
});
