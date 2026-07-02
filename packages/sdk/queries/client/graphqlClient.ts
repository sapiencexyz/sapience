import { GraphQLClient } from 'graphql-request';

export const GRAPHQL_ENDPOINT_KEY = 'sapience.settings.graphqlEndpoint';
// Legacy key kept only for migration: older sessions stored the endpoint under
// a `graphqlEndpointV2` key before v1/v2 were collapsed into one concept.
export const LEGACY_GRAPHQL_ENDPOINT_KEY =
  'sapience.settings.graphqlEndpointV2';

type GraphQLEndpointResolver = () => string | null | undefined;

let endpointResolver: GraphQLEndpointResolver | null = null;

/**
 * Registers a fallback endpoint resolver consulted after the localStorage
 * override but before the env-var default. The app uses this to point
 * default sessions at its active network's endpoint; consumers that never
 * register a resolver keep the env-derived behavior unchanged.
 */
export const setGraphQLEndpointResolver = (
  resolver: GraphQLEndpointResolver | null
) => {
  endpointResolver = resolver;
};

/**
 * Resolves the GraphQL endpoint used by app queries. Sapience deployments use
 * `/v2/graphql`; Meridian exposes the same schema at `/graphql`, so the setting
 * stores the full endpoint path rather than deriving one from an origin.
 * The localStorage step is inert on the server; server-side resolution is
 * resolver → env default.
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
  if (endpointResolver) {
    try {
      const resolved = endpointResolver();
      if (resolved) return resolved;
    } catch {
      /* fall through to the env default */
    }
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
