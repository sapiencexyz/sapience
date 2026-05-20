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
  /**
   * Post-write fixup for the Omit / Pick collision that happens
   * because our SDL has a top-level `Pick` type (prediction pick) —
   * see scripts/fixResolverTypesOmit.cjs for the rationale.
   */
  hooks: {
    afterOneFileWrite: ['node src/scripts/fixResolverTypesOmit.cjs'],
  },
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
          // Prisma hands us Date objects; graphql-js's serialize step
          // converts to ISO strings at the edge. Clients send ISO
          // strings but graphql-js parses them before the resolver
          // sees them, so `input: Date` is also correct.
          DateTimeISO: 'Date',
          Decimal: 'string',
          BigInt: 'bigint',
          UnixSeconds: 'number',
        },
        // Resolver types accept both plain return values and Promises
        // so resolvers can be `async` without being forced to wrap.
        asyncResolverTypes: true,
        // Map each model-backed GraphQL type to its Prisma row at
        // the resolver-parent level. This lets us return `prisma.x
        // .findMany()` rows directly without TS complaining that
        // relation fields (attestations, predictions, conditions,
        // etc.) are missing — those are filled by field resolvers at
        // runtime.
        mappers: {
          Account: '../../../../generated/prisma#User as PrismaUserRow',
          Attestation:
            '../../../../generated/prisma#Attestation as PrismaAttestationRow',
          AttestationScore:
            '../../../../generated/prisma#AttestationScore as PrismaAttestationScoreRow',
          Category:
            '../../../../generated/prisma#Category as PrismaCategoryRow',
          Condition:
            '../../../../generated/prisma#Condition as PrismaConditionRow',
          ConditionGroup:
            '../../../../generated/prisma#ConditionGroup as PrismaConditionGroupRow',
          ReferralCode:
            '../../../../generated/prisma#ReferralCode as PrismaReferralCodeRow',
          User: '../../../../generated/prisma#User as PrismaUserRow',
        },
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
