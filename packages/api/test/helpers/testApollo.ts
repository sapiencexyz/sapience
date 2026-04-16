import type { GraphQLFormattedError } from 'graphql';

export interface OperationResult<TData = unknown> {
  data: TData | null;
  errors: readonly GraphQLFormattedError[] | undefined;
}

const getUrl = (): string => {
  const url = process.env.TEST_GRAPHQL_URL;
  if (!url) {
    throw new Error(
      'TEST_GRAPHQL_URL is not set — globalSetup.ts should populate it before tests run.'
    );
  }
  return url;
};

export const executeOperation = async <TData = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  operationName?: string
): Promise<OperationResult<TData>> => {
  const response = await fetch(getUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables, operationName }),
  });
  if (!response.ok) {
    throw new Error(
      `GraphQL HTTP ${response.status}: ${await response.text().catch(() => '')}`
    );
  }
  const json = (await response.json()) as {
    data?: TData | null;
    errors?: readonly GraphQLFormattedError[];
  };
  return {
    data: (json.data ?? null) as TData | null,
    errors: json.errors,
  };
};

export const introspect = async (): Promise<unknown> => {
  const { getIntrospectionQuery } = await import('graphql');
  const result = await executeOperation<unknown>(
    getIntrospectionQuery({ descriptions: true })
  );
  if (result.errors && result.errors.length > 0) {
    throw new Error(
      `Introspection failed: ${JSON.stringify(result.errors)}`
    );
  }
  return result.data;
};
