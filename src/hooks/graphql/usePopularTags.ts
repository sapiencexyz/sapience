import { useQuery } from '@tanstack/react-query';
import { fetchPopularTags } from '~/lib/sdk/queries';

export const usePopularTags = () =>
  useQuery<string[], Error>({
    queryKey: ['popularTags'],
    queryFn: fetchPopularTags,
    staleTime: 5 * 60 * 1000,
  });
