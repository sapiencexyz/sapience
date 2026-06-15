// Shared GraphQL endpoint resolution

export function getGraphQLEndpoint(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/graphql`;
  } catch {
    return 'https://api.sapience.xyz/graphql';
  }
}

// v2 transport: same origin resolution as v1, but targets `/v2/graphql`.
export function getGraphQLEndpointV2(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/v2/graphql`;
  } catch {
    return 'https://api.sapience.xyz/v2/graphql';
  }
}
