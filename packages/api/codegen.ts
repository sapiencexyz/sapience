import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * Frontend codegen — reads the emitted `schema.graphql` and
 * `schema.v2.graphql` files at the API package root and generates
 * SDK-side TS types for client operations against each endpoint.
 *
 * Two outputs because v1 and v2 are independent endpoints with
 * independent SDLs; type-name collisions across them (`type Account`,
 * `Connection`, etc.) make a single combined client-types module
 * unsafe. Consumers import from `@sapience/sdk/types/graphql` for v1
 * and `@sapience/sdk/types/graphql.v2` for v2.
 */
const config: CodegenConfig = {
  generates: {
    '../sdk/types/graphql.ts': {
      schema: './schema.graphql',
      plugins: ['typescript', 'typescript-operations'],
      config: {
        avoidOptionals: false,
        dedupeFragments: true,
        enumsAsTypes: true,
        exportFragmentSpreadSubTypes: true,
        skipTypename: false,
      },
    },
    '../sdk/types/graphql.v2.ts': {
      schema: './schema.v2.graphql',
      plugins: ['typescript', 'typescript-operations'],
      config: {
        avoidOptionals: false,
        dedupeFragments: true,
        enumsAsTypes: true,
        exportFragmentSpreadSubTypes: true,
        skipTypename: false,
      },
    },
  },
};

export default config;
