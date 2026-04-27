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
  periodPnL: string;
  periodVolume: string;
}

export const GET_PROTOCOL_STATS = /* GraphQL */ `
  query ProtocolStats($vaultAddress: String) {
    protocolStats(vaultAddress: $vaultAddress) {
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
      periodPnL
      periodVolume
    }
  }
`;

export async function fetchProtocolStats(
  vaultAddress?: string
): Promise<ProtocolStat[]> {
  const data = await graphqlRequest<{
    protocolStats: ProtocolStat[];
  }>(GET_PROTOCOL_STATS, { vaultAddress });
  return data?.protocolStats ?? [];
}

export interface CategoryOpenInterest {
  category: {
    id: number;
    name: string;
    slug: string;
  };
  /** Open interest in wei (decimal string). */
  openInterest: string;
}

export const GET_OPEN_INTEREST_BY_CATEGORY = /* GraphQL */ `
  query OpenInterestByCategory {
    openInterestByCategory {
      category {
        id
        name
        slug
      }
      openInterest
    }
  }
`;

export async function fetchOpenInterestByCategory(): Promise<
  CategoryOpenInterest[]
> {
  const data = await graphqlRequest<{
    openInterestByCategory: CategoryOpenInterest[];
  }>(GET_OPEN_INTEREST_BY_CATEGORY);
  return data?.openInterestByCategory ?? [];
}

export interface TimeToResolutionBucket {
  /** Sort order: 1 = soonest. */
  bucket: number;
  /** Display label, e.g. "≤1d", "2-7d". */
  label: string;
  /** Open interest in wei (decimal string). */
  openInterest: string;
  /** Number of predictions in this bucket. */
  predictionCount: number;
}

export const GET_OPEN_INTEREST_BY_TIME_TO_RESOLUTION = /* GraphQL */ `
  query OpenInterestByTimeToResolution {
    openInterestByTimeToResolution {
      bucket
      label
      openInterest
      predictionCount
    }
  }
`;

export async function fetchOpenInterestByTimeToResolution(): Promise<
  TimeToResolutionBucket[]
> {
  const data = await graphqlRequest<{
    openInterestByTimeToResolution: TimeToResolutionBucket[];
  }>(GET_OPEN_INTEREST_BY_TIME_TO_RESOLUTION);
  return data?.openInterestByTimeToResolution ?? [];
}
