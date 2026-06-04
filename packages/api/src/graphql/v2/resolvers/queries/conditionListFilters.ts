/**
 * Shared filter construction for `conditions(...)` — builds both the
 * Prisma `where` (for count / non-OI findMany) and parallel SQL fragments
 * for numeric open-interest ordering.
 */

import { Prisma } from '../../../../../generated/prisma';
import type { Prisma as PrismaTypes } from '../../../../../generated/prisma';
import type { QueryConditionsArgs } from '../../__generated__/resolvers';

type ConditionsArgs = QueryConditionsArgs;

export type ConditionOrderField =
  | 'createdAt'
  | 'endTime'
  | 'displayOrder'
  | 'openInterest';

export type ConditionListFilterResult = {
  where: PrismaTypes.ConditionWhereInput;
  whereSql: Prisma.Sql;
  needsCategoryJoin: boolean;
};

const sqlAnd = (parts: Prisma.Sql[]): Prisma.Sql =>
  parts.length === 0 ? Prisma.sql`TRUE` : Prisma.join(parts, ' AND ');

export const projectOutcomeFilter = (
  outcome?: 'YES' | 'NO' | 'NON_DECISIVE' | null,
  settled?: boolean | null
): PrismaTypes.ConditionWhereInput => {
  if (outcome != null) {
    const base: PrismaTypes.ConditionWhereInput = { settled: true };
    if (outcome === 'YES')
      return { ...base, resolvedToYes: true, nonDecisive: false };
    if (outcome === 'NO')
      return { ...base, resolvedToYes: false, nonDecisive: false };
    return { ...base, nonDecisive: true };
  }
  if (settled === true) return { settled: true };
  if (settled === false) return { settled: false };
  return {};
};

const projectOutcomeSql = (
  outcome?: 'YES' | 'NO' | 'NON_DECISIVE' | null,
  settled?: boolean | null
): Prisma.Sql[] => {
  if (outcome != null) {
    const base = [Prisma.sql`c.settled = true`];
    if (outcome === 'YES')
      return [
        ...base,
        Prisma.sql`c."resolvedToYes" = true`,
        Prisma.sql`c."nonDecisive" = false`,
      ];
    if (outcome === 'NO')
      return [
        ...base,
        Prisma.sql`c."resolvedToYes" = false`,
        Prisma.sql`c."nonDecisive" = false`,
      ];
    return [...base, Prisma.sql`c."nonDecisive" = true`];
  }
  if (settled === true) return [Prisma.sql`c.settled = true`];
  if (settled === false) return [Prisma.sql`c.settled = false`];
  return [];
};

export const buildConditionListFilters = (
  args: ConditionsArgs,
  orderField: ConditionOrderField
): ConditionListFilterResult => {
  const sqlParts = projectOutcomeSql(
    args.filter?.outcome,
    args.filter?.settled
  );
  let needsCategoryJoin = false;

  const where: PrismaTypes.ConditionWhereInput = {
    ...projectOutcomeFilter(args.filter?.outcome, args.filter?.settled),
  };

  if (args.filter?.conditionIds?.length) {
    const ids = args.filter.conditionIds.map((id) => id.toLowerCase());
    where.id = { in: ids };
    sqlParts.push(Prisma.sql`c.id IN (${Prisma.join(ids)})`);
  }
  if (args.filter?.resolvers?.length) {
    // `resolver` is stored lowercase, so a case-insensitive IN is just an IN
    // over the lowercased inputs — mirrors v1's QuestionFilter.resolvers
    // (`resolver: { in: [...] }` / `c."resolver" = ANY(...)`).
    const resolvers = args.filter.resolvers.map((r) => r.toLowerCase());
    where.resolver = { in: resolvers };
    sqlParts.push(Prisma.sql`c."resolver" IN (${Prisma.join(resolvers)})`);
  }
  if (args.filter?.chainId != null) {
    where.chainId = args.filter.chainId;
    sqlParts.push(Prisma.sql`c."chainId" = ${args.filter.chainId}`);
  }
  if (args.filter?.categorySlug) {
    needsCategoryJoin = true;
    where.category = { is: { slug: args.filter.categorySlug } };
    sqlParts.push(Prisma.sql`cat.slug = ${args.filter.categorySlug}`);
  }

  if (args.filter?.public != null) {
    where.public = args.filter.public;
    sqlParts.push(Prisma.sql`c.public = ${args.filter.public}`);
  } else if (!args.filter?.conditionIds?.length) {
    where.public = true;
    sqlParts.push(Prisma.sql`c.public = true`);
  }

  if (args.filter?.tags?.length) {
    where.tags = { hasSome: args.filter.tags };
    sqlParts.push(
      Prisma.sql`c.tags && ARRAY[${Prisma.join(args.filter.tags)}]::text[]`
    );
  }

  if (args.filter?.search?.trim()) {
    const q = args.filter.search.trim();
    const pattern = `%${q}%`;
    where.OR = [
      { question: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ];
    sqlParts.push(
      Prisma.sql`(c.question ILIKE ${pattern} OR c.description ILIKE ${pattern})`
    );
  }

  if (args.filter?.endTime) {
    const r: PrismaTypes.IntFilter = {};
    if (args.filter.endTime.gte != null) {
      r.gte = args.filter.endTime.gte;
      sqlParts.push(Prisma.sql`c."endTime" >= ${args.filter.endTime.gte}`);
    }
    if (args.filter.endTime.lte != null) {
      r.lte = args.filter.endTime.lte;
      sqlParts.push(Prisma.sql`c."endTime" <= ${args.filter.endTime.lte}`);
    }
    where.endTime = r;
  }

  if (orderField === 'displayOrder') {
    where.displayOrder = { not: null };
    sqlParts.push(Prisma.sql`c."displayOrder" IS NOT NULL`);
  }

  return {
    where,
    whereSql: sqlAnd(sqlParts),
    needsCategoryJoin,
  };
};
