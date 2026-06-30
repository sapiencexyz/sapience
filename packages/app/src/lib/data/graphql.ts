// Shared GraphQL endpoint resolution. Sapience serves the schema at
// `/v2/graphql`; Meridian exposes the same schema at `/graphql`.

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

  const baseUrl =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/v2/graphql`;
  } catch {
    return 'https://api.sapience.xyz/v2/graphql';
  }
}
