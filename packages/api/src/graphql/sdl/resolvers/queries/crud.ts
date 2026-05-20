/**
 * Live CRUD-style queries that share a TtlCache with their deprecated
 * passthroughs:
 *
 *   - `categories` (deprecated, but stays here so it shares the
 *     `categoriesCache` with `categoriesConnection`)
 *   - `categoriesConnection` (live)
 *
 * Plus the live point-lookups (`condition(where:)`, `user(where:)`) and
 * the `forecastsConnection` runner. The other typegraphql-prisma-
 * style passthroughs that don't share state with a live path live in
 * `./deprecated/crud.ts`.
 */

import type {
  QueryResolvers,
  QueryForecastsConnectionArgs,
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
import { registerNodeType, toGlobalId } from '../../../relay/globalId';

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

registerNodeType({
  type: 'Category',
  loader: async (id) => {
    const numericId = Number(id);
    if (!Number.isInteger(numericId)) return null;
    return prisma.category.findUnique({ where: { id: numericId } });
  },
});

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
  if (filter?.attestedAt) {
    where.time = filter.attestedAt as Prisma.IntFilter;
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

const buildCategoryCursorPredicate = (
  name: string,
  id: string
): Prisma.CategoryWhereInput => ({
  OR: [
    { name: { gt: name } },
    { AND: [{ name: { equals: name } }, { id: { gt: Number(id) } }] },
  ],
});

export const categoriesConnection = (async (
  _parent: unknown,
  { first, after }: { first?: number | null; after?: string | null }
) => {
  const cappedTake = clampTake(first ?? undefined, { defaultTake: 100 });
  const cursor = after ? decodeCursor(after) : null;
  const where = cursor
    ? buildCategoryCursorPredicate(cursor.k, cursor.id)
    : undefined;
  const [rawRows, totalCount] = await Promise.all([
    prisma.category.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: cappedTake + 1,
    }),
    prisma.category.count(),
  ]);
  const pageRows = rawRows.slice(0, cappedTake);
  const nodes = pageRows.map((row) => ({
    ...row,
    id: toGlobalId('Category', row.id),
  }));
  const edges = nodes.map((node, i) => ({
    node,
    cursor: encodeCursor({ k: pageRows[i].name, id: String(pageRows[i].id) }),
  }));
  return {
    edges,
    nodes,
    totalCount,
    pageInfo: {
      hasNextPage: rawRows.length > cappedTake,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges.at(-1)?.cursor ?? null,
    },
  };
}) as unknown as NonNullable<QueryResolvers['categoriesConnection']>;
