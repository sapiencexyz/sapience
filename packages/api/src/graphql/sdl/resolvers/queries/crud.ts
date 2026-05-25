/* eslint-disable @typescript-eslint/no-explicit-any */
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
import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { TtlCache } from '../../../../lib/ttlCache';
import { logDeprecatedHit } from '../../../../lib/deprecationTelemetry';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import { registerNodeType } from '../../../relay/globalId';
import { synthesizeAccount } from '../accountSynthesis';
import { buildConnection, clampTake } from './pagination';

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
  type: 'Account',
  loader: async (id, ctx) => {
    const address = id.toLowerCase();
    const loaders = (
      ctx as {
        loaders?: {
          userByAddress?: {
            load: (address: string) => Promise<unknown | null>;
          };
        };
      }
    ).loaders;
    const row = loaders?.userByAddress
      ? await loaders.userByAddress.load(address)
      : await prisma.user.findUnique({ where: { address } });
    return row ?? synthesizeAccount(address);
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
  { id, where }
) => {
  if (id != null) {
    return prisma.condition.findUnique({
      where: { id: id.toLowerCase() },
    });
  }
  if (where == null) {
    throw new Error('condition: must pass `id:` or `where:`');
  }
  logDeprecatedHit('condition.where');
  return prisma.condition.findUnique({
    where: asPrismaArgs<Prisma.ConditionWhereUniqueInput>(where),
  });
};

export const category = (async (_parent: unknown, { id }: { id: number }) =>
  prisma.category.findUnique({ where: { id } })) as unknown as NonNullable<
  QueryResolvers['category']
>;

export const forecast: NonNullable<QueryResolvers['forecast']> = async (
  _parent,
  { uid }
) => {
  const row = await prisma.attestation.findUnique({ where: { uid } });
  if (!row) return null;
  return mapForecast(row) as unknown as never;
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

export const account = (async (
  _parent: unknown,
  { address }: any,
  ctx: any
) => {
  const addressLc = address.toLowerCase();
  const row = await ctx.loaders!.userByAddress.load(addressLc);
  return (row ?? synthesizeAccount(addressLc)) as never;
}) as any as NonNullable<QueryResolvers['account']>;

/**
 * Keyset cursor predicate for accounts ordered by `(createdAt, id)`.
 * Stable across pages: `createdAt` alone collides, `id` alone shifts under
 * inserts. Direction is parameterized for forward (`desc`) and ascending
 * (`asc`) orderings.
 */
const buildAccountCursorPredicate = (
  k: string,
  cursorId: string,
  direction: 'asc' | 'desc'
): Prisma.UserWhereInput => {
  const op = direction === 'desc' ? 'lt' : 'gt';
  const createdAt = new Date(k);
  const id = Number(cursorId);
  return {
    OR: [
      { createdAt: { [op]: createdAt } },
      {
        AND: [{ createdAt: { equals: createdAt } }, { id: { [op]: id } }],
      },
    ],
  } as Prisma.UserWhereInput;
};

/**
 * Relay-shaped connection over `Account` rows (User table). Accounts
 * without a User row aren't returned — synthesis only happens at the
 * single-lookup level (`account(address:)`). Default order is
 * `CREATED_AT DESC`; `filter.search` substring-matches the wallet
 * address case-insensitively.
 */
export const accountsConnection = (async (
  _parent: unknown,
  { first, after, filter, orderBy }: any
) => {
  const cappedFirst = clampTake(first ?? 50, { defaultTake: 50, maxTake: 100 });
  const direction: 'asc' | 'desc' =
    String(orderBy?.direction).toLowerCase() === 'asc' ? 'asc' : 'desc';
  const search = (filter?.search as string | null | undefined)?.trim();
  const baseWhere: Prisma.UserWhereInput = search
    ? { address: { contains: search.toLowerCase(), mode: 'insensitive' } }
    : {};
  const cursorPayload = after ? decodeCursor(after) : null;
  const cursorWhere = cursorPayload
    ? buildAccountCursorPredicate(cursorPayload.k, cursorPayload.id, direction)
    : null;
  const pageWhere: Prisma.UserWhereInput = cursorWhere
    ? { AND: [baseWhere, cursorWhere] }
    : baseWhere;

  const [rows, totalCount] = await Promise.all([
    prisma.user.findMany({
      where: pageWhere,
      orderBy: [{ createdAt: direction }, { id: direction }],
      take: cappedFirst + 1,
    }),
    prisma.user.count({ where: baseWhere }),
  ]);

  return buildConnection({
    rows,
    first: cappedFirst,
    totalCount,
    getCursor: (row) =>
      encodeCursor({
        k: row.createdAt.toISOString(),
        id: String(row.id),
      }),
  });
}) as any as NonNullable<QueryResolvers['accountsConnection']>;

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
  const conditionIdsFilter = (
    filter as { conditionIds?: string[] | null } | null | undefined
  )?.conditionIds;
  if (conditionIdsFilter?.length)
    where.conditionId = {
      in: conditionIdsFilter.map((id) => id.toLowerCase()),
    };
  const conditionGroupId = (
    filter as { conditionGroupId?: string | number | null } | null | undefined
  )?.conditionGroupId;
  if (conditionGroupId != null) {
    const conditions = await prisma.condition.findMany({
      where: { conditionGroupId: Number(conditionGroupId) },
      select: { id: true },
    });
    const conditionIds = conditions.map((condition) =>
      condition.id.toLowerCase()
    );
    if (conditionIds.length === 0) {
      return {
        edges: [],
        nodes: [],
        totalCount: 0,
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
      };
    }
    where.conditionId = { in: conditionIds };
  }
  if (filter?.schemaId) where.schemaId = filter.schemaId;
  if (filter?.recipient) where.recipient = filter.recipient;
  if (filter?.attestedAt) {
    where.time = filter.attestedAt as Prisma.IntFilter;
  }

  const orderField = orderBy?.field ?? ForecastOrderField.AttestedAt;
  const direction = orderBy?.direction ?? OrderDirection.Desc;
  const prismaDir = String(direction).toLowerCase() === 'asc' ? 'asc' : 'desc';
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

  return buildConnection({
    rows: rawRows,
    first: cappedFirst,
    totalCount,
    getNode: mapForecast,
    getCursor: (row) =>
      encodeCursor({
        k:
          orderField === ForecastOrderField.CreatedAt
            ? row.createdAt.toISOString()
            : String(row.time),
        id: row.uid,
      }),
  });
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
  {
    first,
    after,
    filter,
  }: {
    first?: number | null;
    after?: string | null;
    filter?: { search?: string | null } | null;
  }
) => {
  const cappedTake = clampTake(first ?? undefined, { defaultTake: 100 });
  const cursor = after ? decodeCursor(after) : null;
  const searchWhere = filter?.search
    ? { name: { contains: filter.search, mode: 'insensitive' as const } }
    : undefined;
  const where = cursor
    ? searchWhere
      ? {
          AND: [searchWhere, buildCategoryCursorPredicate(cursor.k, cursor.id)],
        }
      : buildCategoryCursorPredicate(cursor.k, cursor.id)
    : searchWhere;
  const [rawRows, totalCount] = await Promise.all([
    prisma.category.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: cappedTake + 1,
    }),
    prisma.category.count({ where: searchWhere }),
  ]);
  return buildConnection({
    rows: rawRows,
    first: cappedTake,
    totalCount,
    getCursor: (row) => encodeCursor({ k: row.name, id: String(row.id) }),
  });
}) as unknown as NonNullable<QueryResolvers['categoriesConnection']>;
