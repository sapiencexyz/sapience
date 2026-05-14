/**
 * The 7 CRUD passthroughs that typegraphql-prisma auto-generated on
 * the deployed stack (FindMany for Attestation/Category/ConditionGroup/
 * User, FindUnique for Condition/ConditionGroup/User).
 *
 * SDL-first hand-rolls them; each accepts the full Prisma-style
 * where/orderBy/cursor/take/skip/distinct surface and passes through.
 * The generated codegen types for these args come from the SDL blocks
 * we seeded from the deployed schema (*WhereInput, *OrderByWithRelation
 * Input, *ScalarFieldEnum, etc.), so the wire contract stays byte-
 * identical for these queries.
 *
 * We don't list `conditions` here — it has a custom default-public
 * filter (resolvers/queries/conditions.ts).
 */

import type {
  QueryResolvers,
  QueryAttestationsPageArgs,
  QueryCategoriesPageArgs,
} from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { TtlCache } from '../../../../lib/ttlCache';
import { clampSkip, clampTake } from './pagination';

/**
 * Cache only the no-args call (the dominant public path: integrator's
 * GetCategories sends none, in-tree app sends none). Calls with where /
 * orderBy / etc. bypass the cache to avoid cache-key explosion across
 * arbitrary argument combinations.
 *
 * 1h TTL — categories change rarely (admin action). Versioned so old
 * caches invalidate when the resolver shape changes.
 */
type CategoryRow = Awaited<ReturnType<typeof prisma.category.findMany>>;
const categoriesCache = new TtlCache<string, CategoryRow>({
  ttlMs: 60 * 60 * 1000,
});
const CATEGORIES_CACHE_KEY = 'categories:v1';

/** Test-only: clear cache between test cases. */
export const __clearCategoriesCache = () => categoriesCache.clear();

/**
 * The SDL input types mirror Prisma's exactly but graphql-codegen and
 * Prisma have slightly different TS shapes (Maybe<T> vs T | null,
 * optional vs required on the arg object, etc.). A structural cast
 * here is safe — the values themselves are correct shapes at runtime;
 * the TS types just don't overlap cleanly.
 */
const asPrismaArgs = <T>(value: unknown): T => value as T;

export const attestations: NonNullable<QueryResolvers['attestations']> = async (
  _parent,
  { where, orderBy, cursor, take, skip, distinct }
) =>
  prisma.attestation.findMany({
    where: asPrismaArgs<Prisma.AttestationWhereInput | undefined>(
      where ?? undefined
    ),
    orderBy: asPrismaArgs<
      Prisma.AttestationOrderByWithRelationInput[] | undefined
    >(orderBy ?? undefined),
    cursor: asPrismaArgs<Prisma.AttestationWhereUniqueInput | undefined>(
      cursor ?? undefined
    ),
    take: take ?? undefined,
    skip: skip ?? undefined,
    distinct: asPrismaArgs<Prisma.AttestationScalarFieldEnum[] | undefined>(
      distinct ?? undefined
    ),
  });

export const categories: NonNullable<QueryResolvers['categories']> = async (
  _parent,
  { where, orderBy, cursor, take, skip, distinct }
) => {
  const isNoArgsCall =
    where == null &&
    orderBy == null &&
    cursor == null &&
    take == null &&
    skip == null &&
    distinct == null;

  if (isNoArgsCall) {
    const cached = categoriesCache.get(CATEGORIES_CACHE_KEY);
    if (cached) return cached;
  }

  const result = await prisma.category.findMany({
    where: asPrismaArgs<Prisma.CategoryWhereInput | undefined>(
      where ?? undefined
    ),
    orderBy: asPrismaArgs<
      Prisma.CategoryOrderByWithRelationInput[] | undefined
    >(orderBy ?? undefined),
    cursor: asPrismaArgs<Prisma.CategoryWhereUniqueInput | undefined>(
      cursor ?? undefined
    ),
    take: take ?? undefined,
    skip: skip ?? undefined,
    distinct: asPrismaArgs<Prisma.CategoryScalarFieldEnum[] | undefined>(
      distinct ?? undefined
    ),
  });

  if (isNoArgsCall) categoriesCache.set(CATEGORIES_CACHE_KEY, result);
  return result;
};

export const condition: NonNullable<QueryResolvers['condition']> = async (
  _parent,
  { where }
) =>
  prisma.condition.findUnique({
    where: asPrismaArgs<Prisma.ConditionWhereUniqueInput>(where),
  });

export const user: NonNullable<QueryResolvers['user']> = async (
  _parent,
  { where }
) =>
  prisma.user.findUnique({
    where: asPrismaArgs<Prisma.UserWhereUniqueInput>(where),
  });

export const categoriesPage: NonNullable<
  QueryResolvers['categoriesPage']
> = async (_parent, { take, skip }: QueryCategoriesPageArgs) => {
  // Categories is a tiny lookup table (<100 rows). Stick to the
  // default MAX_TAKE = 100; if it ever grows past a single page we'll
  // revisit before lifting the cap.
  const cappedTake = clampTake(take, { defaultTake: 100 });
  const skipVal = clampSkip(skip);
  const isFullPage = skipVal === 0 && cappedTake >= 100;

  if (isFullPage) {
    const cached = categoriesCache.get(CATEGORIES_CACHE_KEY);
    if (cached) {
      return {
        items: cached.slice(0, cappedTake),
        hasMore: cached.length > cappedTake,
      };
    }
  }

  const rawRows = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    take: cappedTake + 1,
    skip: skipVal,
  });
  const hasMore = rawRows.length > cappedTake;
  const items = rawRows.slice(0, cappedTake);

  if (isFullPage && !hasMore) categoriesCache.set(CATEGORIES_CACHE_KEY, items);
  return { items, hasMore };
};

export type AttestationsPageEnvelope = {
  items: Awaited<ReturnType<typeof prisma.attestation.findMany>>;
  hasMore: boolean;
  _countWhere?: Prisma.AttestationWhereInput;
};

export const runAttestations = async ({
  uid,
  attester,
  conditionId,
  schemaId,
  recipient,
  minTime,
  maxTime,
  orderBy,
  orderDirection,
  take,
  skip,
}: QueryAttestationsPageArgs): Promise<AttestationsPageEnvelope> => {
  const cappedTake = clampTake(take, { defaultTake: 50, maxTake: 100 });
  const skipVal = clampSkip(skip);
  const where: Prisma.AttestationWhereInput = {};
  if (uid) where.uid = uid;
  if (attester) where.attester = attester;
  if (conditionId) where.conditionId = conditionId;
  if (schemaId) where.schemaId = schemaId;
  if (recipient) where.recipient = recipient;
  if (minTime !== null && minTime !== undefined) {
    where.time = { ...(where.time as object | undefined), gte: minTime };
  }
  if (maxTime !== null && maxTime !== undefined) {
    where.time = { ...(where.time as object | undefined), lte: maxTime };
  }
  const direction = orderDirection === 'asc' ? 'asc' : 'desc';
  const orderField =
    orderBy === 'CREATED_AT'
      ? ({ createdAt: direction } as const)
      : ({ time: direction } as const);

  const rawRows = await prisma.attestation.findMany({
    where,
    orderBy: orderField,
    take: cappedTake + 1,
    skip: skipVal,
  });
  const hasMore = rawRows.length > cappedTake;
  return {
    items: rawRows.slice(0, cappedTake),
    hasMore,
    _countWhere: where,
  };
};

export const attestationsPage: NonNullable<
  QueryResolvers['attestationsPage']
> = async (_parent, args) => runAttestations(args);

export const users: NonNullable<QueryResolvers['users']> = async (
  _parent,
  { where, orderBy, cursor, take, skip, distinct }
) =>
  prisma.user.findMany({
    where: asPrismaArgs<Prisma.UserWhereInput | undefined>(where ?? undefined),
    orderBy: asPrismaArgs<Prisma.UserOrderByWithRelationInput[] | undefined>(
      orderBy ?? undefined
    ),
    cursor: asPrismaArgs<Prisma.UserWhereUniqueInput | undefined>(
      cursor ?? undefined
    ),
    take: take ?? undefined,
    skip: skip ?? undefined,
    distinct: asPrismaArgs<Prisma.UserScalarFieldEnum[] | undefined>(
      distinct ?? undefined
    ),
  });
