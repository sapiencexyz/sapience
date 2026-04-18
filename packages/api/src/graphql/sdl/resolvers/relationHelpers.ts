/**
 * Shared primitives for SDL-first relation resolvers.
 *
 * Every model's relation field resolver follows the same pattern:
 *
 *   1. Check if the relation was eagerly loaded on the parent row via
 *      Prisma `include` (driven by the root resolver's
 *      `buildPrismaInclude(info)`). If so, return it directly — no
 *      second round-trip.
 *   2. Otherwise, fall back to a fresh `prisma.<parent>.findUniqueOrThrow
 *      ({ where: { id } }).<relation>(args)` — the standard
 *      typegraphql-prisma-equivalent shape.
 *
 * This is the same semantic typegraphql-prisma's generated
 * RelationResolvers implement, just written explicitly so the SDL-first
 * stack doesn't need their codegen.
 */

import type { PrismaClient } from '../../../../generated/prisma';
import prisma from '../../../db';

type AnyRecord = Record<string, unknown>;

/** A `prisma.<model>` delegate (findUniqueOrThrow + relation getters). */
type Delegate = {
  findUniqueOrThrow: (args: {
    where: unknown;
  }) => Record<string, (args?: unknown) => Promise<unknown>> & {
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
