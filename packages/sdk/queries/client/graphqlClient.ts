import { GraphQLClient } from 'graphql-request';

const GRAPHQL_ENDPOINT_KEY = 'sapience.settings.graphqlEndpoint';
// Legacy key kept only for migration: older sessions stored the endpoint under
// a `graphqlEndpointV2` key before v1/v2 were collapsed into one concept.
const LEGACY_GRAPHQL_ENDPOINT_KEY = 'sapience.settings.graphqlEndpointV2';

/**
 * Resolves the GraphQL endpoint used by app queries. Sapience deployments use
 * `/v2/graphql`; Meridian exposes the same schema at `/graphql`, so the setting
 * stores the full endpoint path rather than deriving one from an origin.
 */
export const getGraphQLEndpoint = () => {
  try {
    if (typeof window !== 'undefined') {
      const override =
        window.localStorage.getItem(GRAPHQL_ENDPOINT_KEY) ??
        window.localStorage.getItem(LEGACY_GRAPHQL_ENDPOINT_KEY);
      if (override) return override;
    }
  } catch {
    /* noop */
  }
  const baseUrl =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/v2/graphql`;
  } catch {
    return 'https://api.sapience.xyz/v2/graphql';
  }
};

export const createGraphQLClient = () =>
  new GraphQLClient(getGraphQLEndpoint(), {
    method: 'GET',
    headers: {
      'X-Request-ID':
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().slice(0, 8)
          : Math.random().toString(36).slice(2, 10),
    },
  });

export async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  try {
    const client = createGraphQLClient();
    return await client.request<T>(query, variables);
  } catch (error) {
    console.error('GraphQL request failed:', error);
    throw error;
  }
}

export async function typedGraphqlRequest<
  TQuery,
  TVariables extends Record<string, unknown> = Record<string, never>,
>(query: string, variables?: TVariables): Promise<TQuery> {
  try {
    const client = createGraphQLClient();
    return await client.request<TQuery>(query, variables);
  } catch (error) {
    console.error('GraphQL request failed:', error);
    throw error;
  }
}
