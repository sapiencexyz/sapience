import { useQuery } from '@tanstack/react-query';
import {
  fetchCategories,
  type CategoryQueryResult,
} from '@sapience/sdk/queries';
import type { Category as CategoryType } from '@sapience/sdk/types/graphql';

export const useCategories = () => {
  return useQuery<CategoryType[], Error>({
    queryKey: ['categories'],
    queryFn: async (): Promise<CategoryType[]> => {
      try {
        const categories = await fetchCategories();
        return categories as unknown as CategoryType[];
      } catch (err) {
        console.error('Error fetching categories:', err);
        throw err instanceof Error
          ? err
          : new Error('An unknown error occurred while fetching categories');
      }
    },
  });
};

export type { CategoryQueryResult };
