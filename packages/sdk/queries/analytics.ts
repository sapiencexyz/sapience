import { graphqlRequest } from './client/graphqlClient';

export interface ProtocolStat {
  timestamp: number;
  cumulativeVolume: string;
  totalTradeCount: number;
  periodTradeCount: number;
  openInterest: string;
  vaultAvailableAssets: string;
  escrowBalance: string;
  periodVolume: string;
}

export interface VaultStat {
  timestamp: number;
  vaultBalance: string;
  vaultAvailableAssets: string;
  vaultDeployed: string;
  vaultCumulativePnL: string;
  vaultPositionsWon: number;
  vaultPositionsLost: number;
  vaultDeposits: string;
  vaultWithdrawals: string;
  vaultAirdropGains: string;
  vaultSecondaryBought: string;
  vaultSecondarySold: string;
  vaultUnredeemedClaim: string;
  periodPnL: string;
}

export const GET_PROTOCOL_STATS = /* GraphQL */ `
  query ProtocolStats {
    protocolStats {
      timestamp
      cumulativeVolume
      totalTradeCount
      periodTradeCount
      openInterest
      vaultAvailableAssets
      escrowBalance
      periodVolume
    }
  }
`;

export const GET_VAULT_STATS = /* GraphQL */ `
  query VaultStats($vaultAddress: String!) {
    vaultStats(vaultAddress: $vaultAddress) {
      timestamp
      vaultBalance
      vaultAvailableAssets
      vaultDeployed
      vaultCumulativePnL
      vaultPositionsWon
      vaultPositionsLost
      vaultDeposits
      vaultWithdrawals
      vaultAirdropGains
      vaultSecondaryBought
      vaultSecondarySold
      vaultUnredeemedClaim
      periodPnL
    }
  }
`;

export async function fetchProtocolStats(): Promise<ProtocolStat[]> {
  const data = await graphqlRequest<{
    protocolStats: ProtocolStat[];
  }>(GET_PROTOCOL_STATS);
  return data?.protocolStats ?? [];
}

export async function fetchVaultStats(
  vaultAddress: string
): Promise<VaultStat[]> {
  const data = await graphqlRequest<{
    vaultStats: VaultStat[];
  }>(GET_VAULT_STATS, { vaultAddress });
  return data?.vaultStats ?? [];
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
