import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { useQuery } from '@tanstack/react-query';

interface ProtocolStat {
  timestamp: string;
  cumulativeVolume: string;
  openInterest: string;
  vaultBalance: string;
  vaultAvailableAssets: string;
  vaultDeployed: string;
  escrowBalance: string;
  vaultCumulativePnL: string;
  vaultPositionsWon: number;
  vaultPositionsLost: number;
  vaultDeposits: string;
  vaultWithdrawals: string;
  vaultAirdropGains: string;
}

interface DailyVolume {
  timestamp: string;
  volume: string;
}

const GET_PROTOCOL_STATS = /* GraphQL */ `
  query ProtocolStats {
    protocolStats {
      timestamp
      cumulativeVolume
      openInterest
      vaultBalance
      vaultAvailableAssets
      vaultDeployed
      escrowBalance
      vaultCumulativePnL
      vaultPositionsWon
      vaultPositionsLost
      vaultDeposits
      vaultWithdrawals
      vaultAirdropGains
    }
  }
`;

const GET_DAILY_VOLUMES = /* GraphQL */ `
  query DailyVolumes {
    dailyVolumes {
      timestamp
      volume
    }
  }
`;

const CACHE_TIME_MS = 60 * 1000;

export function useProtocolStats() {
  return useQuery<ProtocolStat[]>({
    queryKey: ['protocolStats'],
    queryFn: async () => {
      const data = await graphqlRequest<{
        protocolStats: ProtocolStat[];
      }>(GET_PROTOCOL_STATS);
      return data?.protocolStats ?? [];
    },
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export function useDailyVolumes() {
  return useQuery<DailyVolume[]>({
    queryKey: ['dailyVolumes'],
    queryFn: async () => {
      const data = await graphqlRequest<{
        dailyVolumes: DailyVolume[];
      }>(GET_DAILY_VOLUMES);
      return data?.dailyVolumes ?? [];
    },
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export type { ProtocolStat, DailyVolume };
