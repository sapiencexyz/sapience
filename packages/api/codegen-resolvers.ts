/**
 * Codegen config for the SERVER-SIDE resolver types.
 *
 * Reads the hand-written SDL under src/graphql/sdl/schema/ and emits
 * `Resolvers<ApolloContext>` plus per-type aliases into
 * src/graphql/sdl/__generated__/resolvers.ts. Each resolver file in
 * src/graphql/sdl/resolvers/ imports its slice and gets full type
 * safety without a runtime schema builder.
 *
 * Separate from the frontend codegen (codegen.ts) — that one reads
 * the emitted schema.graphql and generates TypeScript types for the
 * SDK/app. This one reads the hand-written SDL and generates types
 * for the resolver map.
 */

import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './src/graphql/sdl/schema/**/*.graphql',
  generates: {
    './src/graphql/sdl/__generated__/resolvers.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        // Point resolver `contextType` at our ApolloContext so every
        // resolver's `ctx` parameter is typed without us writing
        // per-file generics.
        contextType: '../../startApolloServer#ApolloContext',
        // Map SDL scalars to their TS runtime types. The deployed
        // schema uses DateTimeISO (serialized as ISO-8601 strings on
        // the wire, Date objects at the resolver boundary) rather
        // than a plain DateTime scalar.
        scalars: {
          DateTimeISO: { input: 'Date | string', output: 'Date | string' },
          Decimal: 'string',
          BigInt: 'bigint',
        },
        // Resolver types accept both plain return values and Promises
        // so resolvers can be `async` without being forced to wrap.
        asyncResolverTypes: true,
        // Don't shadow Prisma types by default — each model-backed
        // GraphQL type gets a Mappers entry in a follow-up commit
        // that points at the Prisma row shape. For now, mappers stay
        // empty; resolvers will receive the Prisma row at runtime and
        // TS falls back to the codegen-generated model type.
        avoidOptionals: false,
        enumsAsTypes: false,
        // Let `makeExecutableSchema` do the typename work at runtime
        // via prisma-model mappers; we don't need __resolveType here
        // unless we introduce a union/interface later in the port.
      },
    },
  },
};

export default config;
