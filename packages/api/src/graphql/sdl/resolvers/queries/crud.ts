/**
 * Live CRUD-style queries that share a TtlCache with their deprecated
 * passthroughs:
 *
 *   - `categories` (deprecated, but stays here so it shares the
 *     `categoriesCache` with `categoriesPage`)
 *   - `categoriesPage` (live)
 *
 * Plus the live point-lookups (`condition(where:)`, `user(where:)`) and
 * the `forecastsConnection` runner. The other typegraphql-prisma-
 * style passthroughs that don't share state with a live path live in
 * `./deprecated/crud.ts`.
 */

import type {
  QueryResolvers,
  QueryForecastsConnectionArgs,
  QueryCategoriesPageArgs,
} from '../../__generated__/resolvers';
import {
  ForecastOrderField,
  OrderDirection,
} from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { TtlCache } from '../../../../lib/ttlCache';
import { logDeprecatedHit } from '../../../../lib/deprecationTelemetry';
import { clampSkip, clampTake } from './pagination';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';

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
) => {
  logDeprecatedHit('condition');
  return prisma.condition.findUnique({
    where: asPrismaArgs<Prisma.ConditionWhereUniqueInput>(where),
  });
};

export const user: NonNullable<QueryResolvers['user']> = async (
  _parent,
  { where }
) => {
  logDeprecatedHit('user');
  return prisma.user.findUnique({
    where: asPrismaArgs<Prisma.UserWhereUniqueInput>(where),
  });
};

export const account: NonNullable<QueryResolvers['account']> = async (
  _parent,
  { address },
  ctx
) => ctx.loaders!.userByAddress.load(address);

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

const buildForecastCursorPredicate = (
  k: string,
  cursorId: string,
  prismaOrderField: string,
  direction: 'asc' | 'desc'
): Prisma.AttestationWhereInput => {
  const op = direction === 'desc' ? 'lt' : 'gt';
  const keyValue = prismaOrderField === 'createdAt' ? new Date(k) : Number(k);
  return {
    OR: [
      {
        [prismaOrderField]: { [op]: keyValue },
      } as Prisma.AttestationWhereInput,
      {
        AND: [
          {
            [prismaOrderField]: { equals: keyValue },
          } as Prisma.AttestationWhereInput,
          { uid: { [op]: cursorId } } as Prisma.AttestationWhereInput,
        ],
      },
    ],
  };
};

const mapForecast = (
  row: Awaited<ReturnType<typeof prisma.attestation.findMany>>[number]
) => ({
  ...row,
  attestedAt: row.time,
  forecaster: row.attester,
});

export const forecastsConnection: NonNullable<
  QueryResolvers['forecastsConnection']
> = async (
  _parent,
  { first, after, filter, orderBy }: QueryForecastsConnectionArgs
) => {
  const cappedFirst = clampTake(first ?? 50, { defaultTake: 50, maxTake: 100 });
  const where: Prisma.AttestationWhereInput = {};
  if (filter?.uid) where.uid = filter.uid;
  if (filter?.forecaster) where.attester = filter.forecaster;
  if (filter?.conditionId) where.conditionId = filter.conditionId;
  if (filter?.schemaId) where.schemaId = filter.schemaId;
  if (filter?.recipient) where.recipient = filter.recipient;
  if (filter?.attestedAtMin != null) {
    where.time = {
      ...(where.time as object | undefined),
      gte: filter.attestedAtMin,
    };
  }
  if (filter?.attestedAtMax != null) {
    where.time = {
      ...(where.time as object | undefined),
      lte: filter.attestedAtMax,
    };
  }

  const orderField = orderBy?.field ?? ForecastOrderField.AttestedAt;
  const direction = orderBy?.direction ?? OrderDirection.Desc;
  const prismaDir = direction === OrderDirection.Asc ? 'asc' : 'desc';
  const prismaOrderField =
    orderField === ForecastOrderField.CreatedAt ? 'createdAt' : 'time';
  const cursorPayload = after ? decodeCursor(after) : null;
  const cursorWhere = cursorPayload
    ? buildForecastCursorPredicate(
        cursorPayload.k,
        cursorPayload.id,
        prismaOrderField,
        prismaDir
      )
    : null;
  const pageWhere: Prisma.AttestationWhereInput = cursorWhere
    ? { AND: [where, cursorWhere] }
    : where;

  const [rawRows, totalCount] = await Promise.all([
    prisma.attestation.findMany({
      where: pageWhere,
      orderBy: [
        {
          [prismaOrderField]: prismaDir,
        } as Prisma.AttestationOrderByWithRelationInput,
        { uid: prismaDir },
      ],
      take: cappedFirst + 1,
    }),
    prisma.attestation.count({ where }),
  ]);

  const hasNextPage = rawRows.length > cappedFirst;
  const pageRows = hasNextPage ? rawRows.slice(0, cappedFirst) : rawRows;
  const nodes = pageRows.map(mapForecast);
  const edges = nodes.map((node, index) => ({
    node,
    cursor: encodeCursor({
      k:
        orderField === ForecastOrderField.CreatedAt
          ? pageRows[index].createdAt.toISOString()
          : String(pageRows[index].time),
      id: pageRows[index].uid,
    }),
  }));

  return {
    edges,
    nodes,
    totalCount,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};

export const forecastByUid: NonNullable<
  QueryResolvers['forecastByUid']
> = async (_parent, { uid }) => {
  const row = await prisma.attestation.findUnique({ where: { uid } });
  return row ? mapForecast(row) : null;
};
