import { GraphQLClient } from 'graphql-request';

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

export const createGraphQLClient = () => new GraphQLClient(getGraphQLEndpoint());

export async function graphqlRequest<T>(query: string, variables?: Record<string, any>): Promise<T> {
  try {
    const client = createGraphQLClient();
    return await client.request<T>(query, variables);
  } catch (error) {
    console.error('GraphQL request failed:', error);
    throw error;
  }
}

export async function typedGraphqlRequest<TQuery, TVariables extends Record<string, any> = Record<string, never>>(
  query: string,
  variables?: TVariables
): Promise<TQuery> {
  try {
    const client = createGraphQLClient();
    return await client.request<TQuery>(query, variables);
  } catch (error) {
    console.error('GraphQL request failed:', error);
    throw error;
  }
}



