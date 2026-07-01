// Shared GraphQL endpoint resolution. A Settings override in localStorage wins;
// otherwise the endpoint follows the app's active network (see networkDefaults)
// rather than any `NEXT_PUBLIC_FOIL_*` env var. Sapience serves the schema at
// `/v2/graphql`; Meridian (Robinhood, the default network) exposes it at
// `/graphql`.

import { getNetworkEndpointDefaults } from '~/lib/config/networkDefaults';

const GRAPHQL_ENDPOINT_KEY = 'sapience.settings.graphqlEndpoint';
const LEGACY_GRAPHQL_ENDPOINT_KEY = 'sapience.settings.graphqlEndpointV2';

export function getGraphQLEndpoint(): string {
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

  return getNetworkEndpointDefaults().graphqlEndpoint;
}

/**
 * Build a GET URL for a GraphQL query. Apollo (csrfPrevention off) serves
 * queries — not mutations — over GET, which lets the CDN cache the OG/SSR
 * responses that call this. The `query` and JSON-encoded `variables` ride in
 * the query string; callers `fetch()` the result with the default GET method.
 */
export function buildGraphQLGetUrl(query: string, variables?: object): string {
  const endpoint = getGraphQLEndpoint();
  const params = new URLSearchParams({ query });
  if (variables && Object.keys(variables).length > 0) {
    params.set('variables', JSON.stringify(variables));
  }
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}${params.toString()}`;
}
