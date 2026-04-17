/**
 * Phase 0 spike: build a GraphQLSchema from hand-written SDL + typed
 * resolvers using only `graphql`'s built-ins. The minimum proof that:
 *   1. A hand-written SDL assembles into a working GraphQLSchema.
 *   2. `buildPrismaInclude` threads GraphQL selection sets into Prisma
 *      queries (the thing `@pothos/plugin-prisma` was doing for us).
 *   3. Responses match what the deployed type-graphql API returns
 *      (gated by the existing contract snapshots).
 *
 * Intentionally avoids `@graphql-tools/schema` for now — it's a peer of
 * graphql-js and pnpm + Vitest can resolve two separate instances,
 * which trips graphql's duplicate-modules check. Phase 1 will add
 * graphql-tools back with a proper Vitest alias or by switching the
 * server runtime to Yoga, whichever is cleaner.
 *
 * Throwaway code — replaced in Phase 1 by the real schema + resolver
 * map.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildSchema,
  type GraphQLSchema,
  type GraphQLResolveInfo,
  type GraphQLFieldResolver,
} from 'graphql';
import prisma from '../../../db';
import { buildPrismaInclude } from '../buildPrismaInclude';

const typeDefs = readFileSync(
  fileURLToPath(new URL('./schema.graphql', import.meta.url)),
  'utf8'
);

export const rootValue = {
  categories: async (
    _source: unknown,
    _args: unknown,
    _ctx: unknown,
    info: GraphQLResolveInfo
  ) => prisma.category.findMany(buildPrismaInclude(info, 'Category')),
};

/**
 * When a resolver isn't at root scope (`rootValue`), graphql-js falls
 * back to a default resolver that reads `source[fieldName]`. That's
 * what we want for scalar fields on Category — Prisma returns rows
 * whose keys already match the SDL field names for id/name/slug.
 */
export const fieldResolver: GraphQLFieldResolver<unknown, unknown> = (
  source,
  args,
  ctx,
  info
) => {
  if (source && typeof source === 'object') {
    const value = (source as Record<string, unknown>)[info.fieldName];
    if (typeof value === 'function') {
      return (value as GraphQLFieldResolver<unknown, unknown>)(
        source,
        args,
        ctx,
        info
      );
    }
    return value;
  }
  return undefined;
};

export const buildSpikeSchema = (): GraphQLSchema => buildSchema(typeDefs);
