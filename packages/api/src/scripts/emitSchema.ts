/**
 * Emit `schema.graphql` and `schema.v2.graphql` without a database
 * connection.
 *
 * Both schemas read their hand-written SDL, assemble executable
 * schemas via `makeExecutableSchema`, and write
 * lexicographically-sorted `schema.graphql` / `schema.v2.graphql` at
 * the package root. Neither touches the database. The emitted files
 * are the inputs to `codegen.ts`'s SDK-side type generation.
 *
 * Usage:  pnpm --filter @sapience/api run emit-schema
 */

import { buildApiSchema } from '../graphql/buildSchema';
import { buildV2Schema } from '../graphql/v2/buildSchema';

await buildApiSchema({ emitSchemaFile: true });
await buildV2Schema({ emitSchemaFile: true });

console.log('schema.graphql + schema.v2.graphql emitted');
process.exit(0);
