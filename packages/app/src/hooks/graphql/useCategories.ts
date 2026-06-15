import { useQuery } from '@tanstack/react-query';
import {
  fetchCategories,
  type CategoryQueryResult,
} from '@sapience/sdk/queries';

export const useCategories = () => {
  return useQuery<CategoryQueryResult[], Error>({
    queryKey: ['categories'],
    queryFn: async (): Promise<CategoryQueryResult[]> => {
      try {
        return await fetchCategories();
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
