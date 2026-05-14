/**
 * Live CRUD-style queries that share a TtlCache with their deprecated
 * passthroughs:
 *
 *   - `categories` (deprecated, but stays here so it shares the
 *     `categoriesCache` with `categoriesPage`)
 *   - `categoriesPage` (live)
 *
 * Plus the live point-lookups (`condition(where:)`, `user(where:)`) and
 * the paginated `attestationsPage` runner. The other typegraphql-prisma-
 * style passthroughs that don't share state with a live path live in
 * `./deprecated/crud.ts`.
 */

import type {
  QueryResolvers,
  QueryAttestationsPageArgs,
  QueryCategoriesPageArgs,
} from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { TtlCache } from '../../../../lib/ttlCache';
import { logDeprecatedHit } from '../../../../lib/deprecationTelemetry';
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

export const categories: NonNullable<QueryResolvers['categories']> = async (
  _parent,
  { where, orderBy, cursor, take, skip, distinct }
) => {
  logDeprecatedHit('categories');
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
