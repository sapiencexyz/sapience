import { GraphQLClient } from 'graphql-request';

// Build the GraphQL endpoint URL with optional client-side override via localStorage
const getGraphQLEndpoint = () => {
  try {
    if (typeof window !== 'undefined') {
      const override = window.localStorage.getItem('sapience.settings.graphqlEndpoint');
      if (override) return override;
    }
  } catch {
    /* noop */
  }
  const baseUrl = process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/graphql`;
  } catch {
    return 'https://api.sapience.xyz/graphql';
  }
};

// Create client factory to ensure overrides apply without reload
const createClient = () => new GraphQLClient(getGraphQLEndpoint());

// Generic request function (current implementation)
export async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  try {
    const client = createClient();
    return await client.request<T>(query, variables);
  } catch (error) {
    console.error('GraphQL request failed:', error);
    throw error;
  }
}

// Enhanced typed client for fully generated queries
export async function typedGraphqlRequest<
  TQuery,
  TVariables extends Record<string, any> = Record<string, never>
>(
  query: string,
  variables?: TVariables
): Promise<TQuery> {
  try {
    const client = createClient();
    return await client.request<TQuery>(query, variables);
  } catch (error) {
    console.error('GraphQL request failed:', error);
    throw error;
  }
}

// Legacy API functions
export const foilApi = {
  get: async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  },
  post: async (url: string, data: any) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  },
};
