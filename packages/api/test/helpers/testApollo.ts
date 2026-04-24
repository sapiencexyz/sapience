/**
 * In-process ApolloServer for contract tests.
 *
 * Before the SDL-first migration this file shelled out to a `tsx`
 * subprocess and drove queries via fetch over HTTP, because the
 * type-graphql resolver classes relied on `reflect-metadata` + the
 * `emitDecoratorMetadata` TS flag, which Vite's transform pipeline
 * didn't honour. With decorators gone, the schema builds cleanly in
 * any Node runtime, so tests talk to Apollo directly via
 * `apollo.executeOperation()` — no subprocess, no HTTP, no port.
 *
 * The Apollo instance is a module-scoped lazy singleton. One per test
 * process; vitest runs globalSetup once before tests, which handles
 * DB migration and fixture loading (see `globalSetup.ts`).
 */

import type { GraphQLFormattedError } from 'graphql';
import { ApolloServer } from '@apollo/server';
import { buildApiSchema } from '../../src/graphql/buildSchema';
import type { ApolloContext } from '../../src/graphql/startApolloServer';
import prisma from '../../src/db';

export interface OperationResult<TData = unknown> {
  data: TData | null;
  errors: readonly GraphQLFormattedError[] | undefined;
}

let apolloPromise: Promise<ApolloServer<ApolloContext>> | undefined;

const getApollo = async (): Promise<ApolloServer<ApolloContext>> => {
  if (!apolloPromise) {
    apolloPromise = (async () => {
      const schema = await buildApiSchema({ emitSchemaFile: false });
      const apollo = new ApolloServer<ApolloContext>({
        schema,
        introspection: true,
      });
      await apollo.start();
      return apollo;
    })();
  }
  return apolloPromise;
};

export const executeOperation = async <TData = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  operationName?: string
): Promise<OperationResult<TData>> => {
  const apollo = await getApollo();
  const response = await apollo.executeOperation<TData>(
    { query, variables, operationName },
    { contextValue: { prisma } }
  );
  if (response.body.kind !== 'single') {
    throw new Error(
      `Unexpected incremental response from contract test Apollo — ` +
        `the contract suite only issues single-operation queries.`
    );
  }
  return {
    data: (response.body.singleResult.data ?? null) as TData | null,
    errors: response.body.singleResult.errors,
  };
};

export const introspect = async (): Promise<unknown> => {
  const { getIntrospectionQuery } = await import('graphql');
  const result = await executeOperation<unknown>(
    getIntrospectionQuery({ descriptions: true })
  );
  if (result.errors && result.errors.length > 0) {
    throw new Error(`Introspection failed: ${JSON.stringify(result.errors)}`);
  }
  return result.data;
};
