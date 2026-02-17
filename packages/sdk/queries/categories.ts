import { graphqlRequest } from './client/graphqlClient';

export type CategoryQueryResult = {
  id: number;
  name: string;
  slug: string;
};

const GET_CATEGORIES = /* GraphQL */ `
  query Categories {
    categories {
      id
      name
      slug
    }
  }
`;

export async function fetchCategories(): Promise<CategoryQueryResult[]> {
  type CategoriesResponse = {
    categories: CategoryQueryResult[];
  };

  const data = await graphqlRequest<CategoriesResponse>(GET_CATEGORIES);

  if (!data || !Array.isArray(data.categories)) {
    throw new Error('Failed to fetch categories: Invalid response structure');
  }

  return data.categories;
}
