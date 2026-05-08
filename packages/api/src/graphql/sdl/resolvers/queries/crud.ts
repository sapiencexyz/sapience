/**
 * Live CRUD-style resolvers:
 *
 *   - condition / user — single-row lookups (still used by app + integrators)
 *   - attestationsPage / categoriesPage — paginated, purpose-built filters
 *
 * The deprecated bare-array forms (`attestations`, `categories`,
 * `conditionGroup`, `conditionGroups`, `users`) live in `./deprecated/crud.ts`
 * and import the cache + helper exports below so a hot path through
 * either form warms a single TtlCache instance.
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
export const categoriesCache = new TtlCache<string, CategoryRow>({
  ttlMs: 60 * 60 * 1000,
});
export const CATEGORIES_CACHE_KEY = 'categories:v1';

/** Test-only: clear cache between test cases. */
export const __clearCategoriesCache = () => categoriesCache.clear();

/**
 * Structural cast used only by the deprecated bare-array wrappers in
 * ./deprecated/crud.ts, which still accept the Prisma-derived input
 * shapes (where/orderBy/cursor/distinct). graphql-codegen emits
 * Maybe<T>/optional shapes that don't overlap cleanly with Prisma's
 * required shapes; the runtime values are correct in either form.
 *
 * The live `condition` and `user` resolvers no longer need it — they
 * take flat scalar args (`id: String!`, `address: String!`).
 */
export const asPrismaArgs = <T>(value: unknown): T => value as T;

export const categoriesPage: NonNullable<
  QueryResolvers['categoriesPage']
> = async (_parent, { take, skip }: QueryCategoriesPageArgs) => {
  const cappedTake = clampTake(take, { defaultTake: 100, maxTake: 500 });
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

export const attestationsPage: NonNullable<
  QueryResolvers['attestationsPage']
> = async (
  _parent,
  {
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
  }: QueryAttestationsPageArgs
) => {
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
  return { items: rawRows.slice(0, cappedTake), hasMore };
};

export const condition: NonNullable<QueryResolvers['condition']> = async (
  _parent,
  { id },
  ctx
) => {
  const lowered = id.toLowerCase();
  if (ctx?.loaders) return ctx.loaders.conditionById.load(lowered);
  return prisma.condition.findUnique({
    where: { id: lowered },
    include: { category: true },
  });
};

export const user: NonNullable<QueryResolvers['user']> = async (
  _parent,
  { address },
  ctx
) => {
  const lowered = address.toLowerCase();
  if (ctx?.loaders) return ctx.loaders.userByAddress.load(lowered);
  return prisma.user.findUnique({ where: { address: lowered } });
};
