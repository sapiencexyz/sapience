// Shared GraphQL endpoint resolution, delegated to the SDK client. A Settings
// override in localStorage wins; otherwise the endpoint follows the app's
// active network (the resolver registered in registerGraphqlResolver) rather
// than any `NEXT_PUBLIC_FOIL_*` env var. Sapience serves the schema at
// `/v2/graphql`; Meridian (Robinhood, the default network) exposes it at
// `/graphql`.

import '~/lib/config/registerGraphqlResolver';
import { getGraphQLEndpoint } from '~/lib/sdk/queries/client/graphqlClient';

export { getGraphQLEndpoint };

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
