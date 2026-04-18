/**
 * Emit `schema.graphql` without a database connection.
 *
 * Calls `buildApiSchema({ emitSchemaFile: true })`, which reads the
 * hand-written SDL under `src/graphql/sdl/schema/`, assembles an
 * executable schema via `makeExecutableSchema`, and writes a
 * lexicographically-sorted `schema.graphql` at the package root.
 * Neither the schema build nor the SDL load touches the database.
 *
 * Usage:  pnpm --filter @sapience/api run emit-schema
 */

import { buildApiSchema } from '../graphql/buildSchema';

await buildApiSchema({ emitSchemaFile: true });

console.log('schema.graphql emitted');
process.exit(0);
