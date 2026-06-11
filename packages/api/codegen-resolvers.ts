/**
 * Codegen config for the SERVER-SIDE resolver types.
 *
 * Two outputs:
 *
 *   - `src/graphql/sdl/__generated__/resolvers.ts` — v1 resolver
 *     types, generated from the v1 SDL under `src/graphql/sdl/schema/`.
 *   - `src/graphql/v2/__generated__/resolvers.ts` — v2 resolver
 *     types, generated from the v2 SDL under `src/graphql/v2/schema/`.
 *
 * Each resolver file imports its slice and gets full type safety
 * without per-file generics. v1 and v2 keep separate generated
 * modules because the SDLs declare overlapping type names
 * (`Account`, `Connection`, etc.) and we don't want them to merge.
 *
 * Separate from the frontend codegen (codegen.ts), which reads the
 * emitted `schema.graphql` / `schema.v2.graphql` files at the package
 * root and emits SDK-side client types.
 */

import type { CodegenConfig } from '@graphql-codegen/cli';

const v1Output = {
  './src/graphql/sdl/__generated__/resolvers.ts': {
    schema: './src/graphql/sdl/schema/**/*.graphql',
    plugins: ['typescript', 'typescript-resolvers'],
    config: {
      contextType: '../../startApolloServer#ApolloContext',
      scalars: {
        DateTimeISO: 'Date',
        Decimal: 'string',
        BigInt: 'bigint',
        UnixSeconds: 'number',
      },
      asyncResolverTypes: true,
      mappers: {
        Category: '../../../../generated/prisma#Category as PrismaCategoryRow',
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
    },
  },
};

/**
 * v2 resolver types. Same context type as v1 (the Express
 * middleware mounts both endpoints with `createLoaders(prisma)`), but
 * the resolver shape (Relay connections, AddressEntity interface) is
 * specific to v2.
 *
 * Mapped parents: v2 resolver functions are typed against the Prisma
 * row, just like v1. Synthesized types (Vault — derived from the SDK
 * config rather than a row, CollateralBalance — a value snapshot) and
 * union/interface envelopes use the generated `*Type` parent.
 */
const v2Output = {
  './src/graphql/v2/__generated__/resolvers.ts': {
    schema: './src/graphql/v2/schema/**/*.graphql',
    plugins: ['typescript', 'typescript-resolvers'],
    config: {
      // v2 reuses the v1 ApolloContext (same prisma + loaders + req
      // shape per the shared `expressMiddleware` mount in core/server.ts).
      // Path is relative to the generated file at
      // src/graphql/v2/__generated__/resolvers.ts → up two → graphql/.
      contextType: '../../startApolloServer#ApolloContext',
      scalars: {
        DateTimeISO: 'Date',
        BigInt: 'bigint',
        UnixSeconds: 'number',
      },
      asyncResolverTypes: true,
      mappers: {
        Account: '../../../../generated/prisma#User as PrismaUserRow',
        Category: '../../../../generated/prisma#Category as PrismaCategoryRow',
        Condition:
          '../../../../generated/prisma#Condition as PrismaConditionRow',
        ConditionGroup:
          '../../../../generated/prisma#ConditionGroup as PrismaConditionGroupRow',
        Prediction:
          '../../../../generated/prisma#Prediction as PrismaPredictionRow',
        Position: '../../../../generated/prisma#Position as PrismaPositionRow',
        Trade:
          '../../../../generated/prisma#SecondaryTrade as PrismaSecondaryTradeRow',
        Forecast:
          '../../../../generated/prisma#Attestation as PrismaAttestationRow',
        PickConfiguration: '../../../../generated/prisma#Picks as PrismaPicksRow',
        Pick: '../../../../generated/prisma#Pick as PrismaPickRow',
        Claim: '../../../../generated/prisma#Claim as PrismaClaimRow',
        Close: '../../../../generated/prisma#Close as PrismaCloseRow',
        CollateralTransfer:
          '../../../../generated/prisma#CollateralTransfer as PrismaCollateralTransferRow',
        ReferralCode:
          '../../../../generated/prisma#ReferralCode as PrismaReferralCodeRow',
      },
      avoidOptionals: false,
      enumsAsTypes: false,
    },
  },
};

const config: CodegenConfig = {
  hooks: {
    // Same Omit/Pick rename fixup as v1 — `type Pick` collides with the
    // global `Pick<>` utility. The script targets both generated files
    // by extension/path so it covers v2 too.
    afterOneFileWrite: ['node src/scripts/fixResolverTypesOmit.cjs'],
  },
  generates: { ...v1Output, ...v2Output },
};

export default config;
