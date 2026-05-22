import { graphqlRequest } from './client/graphqlClient';

export type CategoryQueryResult = {
  id: string;
  name: string;
  slug: string;
};

export const GET_CATEGORIES = /* GraphQL */ `
  query Categories {
    categoriesConnection(first: 100) {
      nodes {
        id
        name
        slug
      }
    }
  }
`;

export async function fetchCategories(): Promise<CategoryQueryResult[]> {
  type CategoriesResponse = {
    categoriesConnection: { nodes: CategoryQueryResult[] };
  };

  const data = await graphqlRequest<CategoriesResponse>(GET_CATEGORIES);

  if (!data || !Array.isArray(data.categoriesConnection?.nodes)) {
    throw new Error('Failed to fetch categories: Invalid response structure');
  }

  return data.categoriesConnection.nodes;
}
