import { useQuery } from '@tanstack/react-query';
import { fetchPopularTags } from '@sapience/sdk/queries';

export const usePopularTags = () =>
  useQuery<string[], Error>({
    queryKey: ['popularTags'],
    queryFn: fetchPopularTags,
    staleTime: 5 * 60 * 1000,
  });
