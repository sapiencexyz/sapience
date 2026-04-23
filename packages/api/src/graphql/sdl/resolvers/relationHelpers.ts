/**
 * Shared primitives for SDL-first relation resolvers.
 *
 * Every model's relation field resolver follows the same pattern:
 *
 *   1. If the parent row already carries the relation (e.g. a caller
 *      threaded it in via Prisma `include`), return it directly — no
 *      second round-trip.
 *   2. Otherwise, fall back to a fresh `prisma.<parent>.findUniqueOrThrow
 *      ({ where: { id } }).<relation>(args)`.
 *
 * This matches typegraphql-prisma's generated RelationResolvers: relations
 * are fetched on demand unless something upstream pre-loaded them. No
 * root resolver currently pre-loads via `include`, so in practice every
 * relation field takes the fallback path — a per-row round-trip, same as
 * the deployed stack. If N+1 becomes a bottleneck, add an include at the
 * root resolver and this helper's fast path will start firing.
 */

import type { PrismaClient } from '../../../../generated/prisma';
import prisma from '../../../db';

type AnyRecord = Record<string, unknown>;

/** A `prisma.<model>` delegate (findUniqueOrThrow + relation getters). */
type Delegate = {
  findUniqueOrThrow: (args: { where: unknown }) => Record<
    string,
    (args?: unknown) => Promise<unknown>
  > & {
    then?: unknown;
  };
};

const delegateFor = (modelPrismaKey: keyof PrismaClient): Delegate =>
  prisma[modelPrismaKey] as unknown as Delegate;

interface LoadRelationOptions {
  /** Lowercase prisma delegate key, e.g. `category`, `conditionGroup`. */
  parentModel: keyof PrismaClient;
  /** Where clause that uniquely identifies the parent row, e.g. `{ id }`. */
  parentWhere: unknown;
  /** Prisma relation field name (NOT the GraphQL field name if different). */
  prismaRelationName: string;
  /**
   * Extra args forwarded to the relation fetch (where/orderBy/take/skip/...).
   * Pass `undefined` for scalar-relation followups.
   */
  args?: unknown;
}

/**
 * Read a relation field off an already-loaded parent, or fall back to
 * prisma.<parent>.findUniqueOrThrow({where}).<relation>(args).
 */
export const loadRelation = async <T>(
  parent: AnyRecord,
  prismaKeyOnParent: string,
  opts: LoadRelationOptions
): Promise<T> => {
  const existing = parent[prismaKeyOnParent];
  if (existing !== undefined) return existing as T;
  const delegate = delegateFor(opts.parentModel);
  const promise = delegate.findUniqueOrThrow({ where: opts.parentWhere });
  const relationFetcher = (promise as unknown as AnyRecord)[
    opts.prismaRelationName
  ];
  if (typeof relationFetcher !== 'function') {
    throw new Error(
      `loadRelation: ${String(opts.parentModel)}.${opts.prismaRelationName} is not a function — wrong relation name?`
    );
  }
  return (await relationFetcher.call(promise, opts.args)) as T;
};
