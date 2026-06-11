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
    // v1 client types — kept RAW: this file is in .prettierignore, so its
    // committed form is unformatted codegen output. No Prettier hook here, or
    // a regen would reformat it against its ignore intent.
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
    // v2 client types — committed Prettier-formatted (NOT in .prettierignore),
    // so format ONLY this output on emit. graphql-codegen appends the written
    // file path to the command, so this runs `prettier --write graphql.v2.ts`;
    // without it every regen produces whitespace-only diffs.
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
      hooks: {
        afterOneFileWrite: ['prettier --write'],
      },
    },
  },
};

export default config;
