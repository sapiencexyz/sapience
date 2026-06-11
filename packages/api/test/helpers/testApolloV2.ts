/**
 * In-process ApolloServer for the /v2/graphql surface — the v2 twin of
 * `testApollo.ts`, used by the v1↔v2 parity suite (`test/contract/parity/`).
 *
 * Same lazy-singleton pattern: one v2 Apollo per test process, started on
 * first use. The v1 and v2 instances coexist in the same fork (both schemas
 * are plain SDL builds — no decorators, no global type registry) and share
 * the prisma singleton, so a parity pair queries the same database state.
 *
 * Context mirrors the production `/v2/graphql` mount in `core/server.ts`:
 * `{ prisma, loaders: createLoaders(prisma) }`. Loaders are created fresh
 * per operation — same lifetime as the per-request wiring in production —
 * so DataLoader caches never leak across tests. (`req` is omitted; it only
 * feeds request-id logging.) No complexity/depth/cache plugins are attached:
 * parity tests resolver output, not middleware.
 */

import type { GraphQLFormattedError } from 'graphql';
import { ApolloServer } from '@apollo/server';
import { buildV2Schema } from '../../src/graphql/v2/buildSchema';
import type { ApolloContext } from '../../src/graphql/startApolloServer';
import { createLoaders } from '../../src/graphql/sdl/resolvers/loaders';
import prisma from '../../src/core/db';

export interface OperationResult<TData = unknown> {
  data: TData | null;
  errors: readonly GraphQLFormattedError[] | undefined;
}

let apolloV2Promise: Promise<ApolloServer<ApolloContext>> | undefined;

const getApolloV2 = async (): Promise<ApolloServer<ApolloContext>> => {
  if (!apolloV2Promise) {
    apolloV2Promise = (async () => {
      const schema = await buildV2Schema({ emitSchemaFile: false });
      const apollo = new ApolloServer<ApolloContext>({
        schema,
        introspection: true,
      });
      await apollo.start();
      return apollo;
    })();
  }
  return apolloV2Promise;
};

export const executeOperationV2 = async <TData = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  operationName?: string
): Promise<OperationResult<TData>> => {
  const apollo = await getApolloV2();
  const response = await apollo.executeOperation<TData>(
    { query, variables, operationName },
    { contextValue: { prisma, loaders: createLoaders(prisma) } }
  );
  if (response.body.kind !== 'single') {
    throw new Error(
      `Unexpected incremental response from parity test Apollo — ` +
        `the parity suite only issues single-operation queries.`
    );
  }
  return {
    data: (response.body.singleResult.data ?? null) as TData | null,
    errors: response.body.singleResult.errors,
  };
};
