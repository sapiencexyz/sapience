// Shared GraphQL endpoint resolution (server/OG contexts). Sapience serves the
// schema at `/v2/graphql`; Meridian exposes the same schema at `/graphql`. This
// env-only resolver returns the default endpoint; client code reads any user
// override via the SDK's `getGraphQLEndpoint`.

export function getGraphQLEndpoint(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/v2/graphql`;
  } catch {
    return 'https://api.sapience.xyz/v2/graphql';
  }
}
