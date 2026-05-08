import { graphqlRequest } from './client/graphqlClient';

export type CategoryQueryResult = {
  id: number;
  name: string;
  slug: string;
};

export const GET_CATEGORIES = /* GraphQL */ `
  query Categories {
    categoriesPage(take: 500) {
      hasMore
      items {
        id
        name
        slug
      }
    }
  }
`;

export async function fetchCategories(): Promise<CategoryQueryResult[]> {
  type CategoriesResponse = {
    categoriesPage: { items: CategoryQueryResult[]; hasMore: boolean };
  };

  const data = await graphqlRequest<CategoriesResponse>(GET_CATEGORIES);

  if (!data?.categoriesPage || !Array.isArray(data.categoriesPage.items)) {
    throw new Error('Failed to fetch categories: Invalid response structure');
  }

  return data.categoriesPage.items;
}
