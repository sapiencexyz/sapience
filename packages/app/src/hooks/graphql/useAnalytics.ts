import { useQuery } from '@tanstack/react-query';
import {
  fetchProtocolStats,
  fetchDailyVolumes,
  type ProtocolStat,
  type DailyVolume,
} from '@sapience/sdk/queries';

const CACHE_TIME_MS = 60 * 1000;

export function useProtocolStats() {
  return useQuery<ProtocolStat[]>({
    queryKey: ['protocolStats'],
    queryFn: fetchProtocolStats,
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export function useDailyVolumes() {
  return useQuery<DailyVolume[]>({
    queryKey: ['dailyVolumes'],
    queryFn: fetchDailyVolumes,
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export type { ProtocolStat, DailyVolume };
