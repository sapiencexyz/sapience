import { graphqlRequest } from './client/graphqlClient';

export interface ProtocolStat {
  timestamp: number;
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
  dailyPnL: string;
  dailyVolume: string;
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
      dailyPnL
      dailyVolume
    }
  }
`;

export async function fetchProtocolStats(): Promise<ProtocolStat[]> {
  const data = await graphqlRequest<{
    protocolStats: ProtocolStat[];
  }>(GET_PROTOCOL_STATS);
  return data?.protocolStats ?? [];
}
