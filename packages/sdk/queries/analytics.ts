import { graphqlRequest } from './client/graphqlClient';

export interface ProtocolStat {
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

export interface DailyVolume {
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

export async function fetchProtocolStats(): Promise<ProtocolStat[]> {
  const data = await graphqlRequest<{
    protocolStats: ProtocolStat[];
  }>(GET_PROTOCOL_STATS);
  return data?.protocolStats ?? [];
}

export async function fetchDailyVolumes(): Promise<DailyVolume[]> {
  const data = await graphqlRequest<{
    dailyVolumes: DailyVolume[];
  }>(GET_DAILY_VOLUMES);
  return data?.dailyVolumes ?? [];
}
