/**
 * Build the v2 GraphQLSchema from its standalone SDL + resolver map.
 *
 * Mirrors the structure of `../buildSchema.ts` (v1) but keeps a separate
 * cached schema instance. When `emitSchemaFile: true`, writes a printed
 * copy to `packages/api/schema.v2.graphql` alongside v1's
 * `packages/api/schema.graphql` — both feed `graphql-codegen` into the
 * SDK's typed clients.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { printSchema, type GraphQLSchema } from 'graphql';
import { resolvers } from './resolvers';

export interface BuildV2SchemaOptions {
  emitSchemaFile?: boolean;
}

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);
const sdlPath = resolve(packageRoot, 'src', 'graphql', 'v2', 'schema');
const schemaOutPath = resolve(packageRoot, 'schema.v2.graphql');

const loadTypeDefs = (): string =>
  readFileSync(resolve(sdlPath, 'schema.graphql'), 'utf8');

let cachedSchema: GraphQLSchema | undefined;

export const buildV2Schema = async (
  options: BuildV2SchemaOptions = {}
): Promise<GraphQLSchema> => {
  if (!cachedSchema) {
    cachedSchema = makeExecutableSchema({
      typeDefs: loadTypeDefs(),
      resolvers: resolvers as Parameters<
        typeof makeExecutableSchema
      >[0]['resolvers'],
    });
  }
  if (options.emitSchemaFile) {
    const sdl = printSchema(cachedSchema).replace(/[ \t]+$/gm, '');
    writeFileSync(schemaOutPath, `${sdl}\n`, 'utf8');
  }
  return cachedSchema;
};
