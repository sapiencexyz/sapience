import { graphqlRequest } from './client/graphqlClient';
import { toEpochOrNull } from './client/timeArgs';

/** Protocol-wide stats snapshot — no vault scoping. */
export interface ProtocolStat {
  timestamp: number;
  cumulativeVolume: string;
  cumulativeTradeCount: number;
  periodTradeCount: number;
  periodVolume: string;
  openInterest: string;
  escrowBalance: string;
}

/** Vault-specific stats snapshot for a single vault address. */
export interface VaultStat {
  timestamp: number;
  balance: string;
  availableAssets: string;
  deployed: string;
  cumulativePnL: string;
  positionsWon: number;
  positionsLost: number;
  deposits: string;
  withdrawals: string;
  airdropGains: string;
  secondaryBought: string;
  secondarySold: string;
  unredeemedClaim: string;
  periodPnL: string;
}

export const GET_PROTOCOL_STATS = /* GraphQL */ `
  query ProtocolStats($from: Int, $to: Int) {
    protocol {
      stats(filter: { timestamp: { gte: $from, lte: $to } }) {
        nodes {
          timestamp
          cumulativeVolume
          cumulativeTradeCount
          periodTradeCount
          periodVolume
          openInterest
          escrowBalance
        }
      }
    }
  }
`;

export const GET_VAULT_STATS = /* GraphQL */ `
  query VaultStats($vaultAddress: Address!, $from: Int, $to: Int) {
    vaultsConnection(filter: { address: $vaultAddress }, first: 1) {
      nodes {
        stats(filter: { timestamp: { gte: $from, lte: $to } }) {
          nodes {
            timestamp
            balance
            availableAssets
            deployed
            cumulativePnL
            positionsWon
            positionsLost
            deposits
            withdrawals
            airdropGains
            secondaryBought
            secondarySold
            unredeemedClaim
            periodPnL
          }
        }
      }
    }
  }
`;

export async function fetchProtocolStats(params?: {
  from?: Date | string | number | null;
  to?: Date | string | number | null;
}): Promise<ProtocolStat[]> {
  const data = await graphqlRequest<{
    protocol?: { stats?: { nodes?: ProtocolStat[] } | null } | null;
  }>(GET_PROTOCOL_STATS, {
    from: toEpochOrNull(params?.from),
    to: toEpochOrNull(params?.to),
  });
  return data?.protocol?.stats?.nodes ?? [];
}

export async function fetchVaultStats(params: {
  vaultAddress: string;
  from?: Date | string | number | null;
  to?: Date | string | number | null;
}): Promise<VaultStat[]> {
  const data = await graphqlRequest<{
    vaultsConnection?: {
      nodes?: Array<{ stats?: { nodes?: VaultStat[] } | null } | null> | null;
    } | null;
  }>(GET_VAULT_STATS, {
    vaultAddress: params.vaultAddress,
    from: toEpochOrNull(params.from),
    to: toEpochOrNull(params.to),
  });
  return data?.vaultsConnection?.nodes?.[0]?.stats?.nodes ?? [];
}

export interface CategoryOpenInterest {
  category: {
    id: string;
    name: string;
    slug: string;
  };
  /** Open interest in wei (decimal string). */
  openInterest: string;
}

export const GET_OPEN_INTEREST_BY_CATEGORY = /* GraphQL */ `
  query OpenInterestByCategory {
    protocol {
      openInterestByCategory {
        category {
          id
          name
          slug
        }
        openInterest
      }
    }
  }
`;

export async function fetchOpenInterestByCategory(): Promise<
  CategoryOpenInterest[]
> {
  const data = await graphqlRequest<{
    protocol?: {
      openInterestByCategory?: CategoryOpenInterest[] | null;
    } | null;
  }>(GET_OPEN_INTEREST_BY_CATEGORY);
  return data?.protocol?.openInterestByCategory ?? [];
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
    protocol {
      openInterestByTimeToResolution {
        bucket
        label
        openInterest
        predictionCount
      }
    }
  }
`;

export async function fetchOpenInterestByTimeToResolution(): Promise<
  TimeToResolutionBucket[]
> {
  const data = await graphqlRequest<{
    protocol?: {
      openInterestByTimeToResolution?: TimeToResolutionBucket[] | null;
    } | null;
  }>(GET_OPEN_INTEREST_BY_TIME_TO_RESOLUTION);
  return data?.protocol?.openInterestByTimeToResolution ?? [];
}
