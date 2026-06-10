/**
 * Build the API's GraphQLSchema from the hand-written SDL under
 * `sdl/schema/` and the typed resolver map under `sdl/resolvers/`.
 *
 * Replaces the type-graphql `buildSchema` call that used to assemble
 * the schema from decorated resolver classes. The wire contract is
 * gated by the contract test suite in `test/contract/` — Phase 5 of
 * the SDL-first migration regenerated only the SDL+introspection
 * snapshots; all 39 data-dependent operation+orphan snapshots stayed
 * byte-identical.
 *
 * When `emitSchemaFile: true`, emits `schema.graphql` at the package
 * root with lexicographically-sorted types — same behaviour the old
 * type-graphql path provided via its own emitSchemaFile option. The
 * frontend `generate-types` chain reads that file.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  lexicographicSortSchema,
  printSchema,
  type GraphQLSchema,
} from 'graphql';
import { resolvers } from './sdl/resolvers';

export interface BuildApiSchemaOptions {
  emitSchemaFile?: boolean;
}

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const sdlPath = resolve(packageRoot, 'src', 'graphql', 'sdl', 'schema');
const schemaOutPath = resolve(packageRoot, 'schema.graphql');

const loadTypeDefs = (): string =>
  readFileSync(resolve(sdlPath, 'schema.graphql'), 'utf8');

let cachedSchema: GraphQLSchema | undefined;

export const buildApiSchema = async (
  options: BuildApiSchemaOptions = {}
): Promise<GraphQLSchema> => {
  if (!cachedSchema) {
    cachedSchema = makeExecutableSchema({
      typeDefs: loadTypeDefs(),
      // Cast is necessary because makeExecutableSchema's IResolvers
      // shape is slightly looser than graphql-codegen's
      // `Resolvers<ApolloContext>` — field resolver function types
      // overlap structurally but not by TS identity.
      resolvers: resolvers as Parameters<
        typeof makeExecutableSchema
      >[0]['resolvers'],
    });
  }
  if (options.emitSchemaFile) {
    const sdl = printSchema(lexicographicSortSchema(cachedSchema));
    writeFileSync(schemaOutPath, `${sdl}\n`, 'utf8');
  }
  return cachedSchema;
};
