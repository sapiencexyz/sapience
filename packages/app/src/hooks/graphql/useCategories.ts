import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { useQuery } from '@tanstack/react-query';
import type { Category as CategoryType } from '@sapience/sdk/types/graphql';

// GraphQL query to fetch categories
const GET_CATEGORIES = /* GraphQL */ `
  query Categories {
    categories {
      id
      name
      slug
    }
  }
`;

// Custom hook to fetch categories using Tanstack Query
export const useCategories = () => {
  return useQuery<CategoryType[], Error>({
    queryKey: ['categories'],
    queryFn: async (): Promise<CategoryType[]> => {
      try {
        type CategoriesQueryResult = {
          categories: CategoryType[];
        };

        const data =
          await graphqlRequest<CategoriesQueryResult>(GET_CATEGORIES);

        if (!data || !Array.isArray(data.categories)) {
          console.error(
            'Unexpected API response structure for categories:',
            data
          );
          throw new Error(
            'Failed to fetch categories: Invalid response structure'
          );
        }

        return data.categories;
      } catch (err) {
        console.error('Error fetching categories:', err);
        throw err instanceof Error
          ? err
          : new Error('An unknown error occurred while fetching categories');
      }
    },
  });
};
