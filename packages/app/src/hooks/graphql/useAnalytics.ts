import { useQuery } from '@tanstack/react-query';
import { fetchProtocolStats, type ProtocolStat } from '@sapience/sdk/queries';

const CACHE_TIME_MS = 60 * 1000;

export function useProtocolStats() {
  return useQuery<ProtocolStat[]>({
    queryKey: ['protocolStats'],
    queryFn: fetchProtocolStats,
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export type { ProtocolStat };
