import { useQuery } from '@tanstack/react-query';
import { getEnsAvatarUrlForAddress } from '~/lib/ens/avatar';

export function useEnsAvatar(address: string | null | undefined) {
  return useQuery({
    queryKey: ['ensAvatar', (address || '').toLowerCase()],
    queryFn: async () => {
      if (!address) return null;
      return await getEnsAvatarUrlForAddress(address);
    },
    staleTime: 1000 * 60 * 60 * 24, // 24h
  });
}
