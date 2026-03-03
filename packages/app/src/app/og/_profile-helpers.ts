// Profile-specific helpers for OG image generation

import { isAddress, getAddress } from 'viem';
import { mainnetClient } from '~/lib/utils/util';
import { getEnsAvatarUrlForAddress } from '~/lib/ens/avatar';
import { getGraphQLEndpoint, formatUnits } from './_prediction-helpers';
import { SCHEMA_UID } from '~/lib/constants';

// ---------- GraphQL queries ----------

const ALL_TIME_PROFIT_LEADERBOARD_QUERY = `
  query ProfitLeaderboard($limit: Int) {
    profitLeaderboard(limit: $limit) {
      address
      totalPnL
    }
  }
`;

const ACCURACY_RANK_QUERY = `
  query AccountAccuracyRank($address: String!) {
    accountAccuracyRank(address: $address) {
      address
      accuracyScore
      rank
      totalForecasters
    }
  }
`;

const TRADING_VOLUME_QUERY = `
  query TradingVolume($address: String!) {
    accountTotalVolume(address: $address)
  }
`;

const ATTESTATIONS_COUNT_QUERY = `
  query FindAttestations($where: AttestationWhereInput!, $take: Int!) {
    attestations(where: $where, orderBy: { time: desc }, take: $take) {
      id
    }
  }
`;

// ---------- Types ----------

export interface ProfileOGData {
  totalPnL: number | null;
  profitRank: number | null;
  totalParticipants: number;
  accuracyScore: number | null;
  accuracyRank: number | null;
  totalForecasters: number;
  volumeDisplay: string | null;
  forecastsCount: number | null;
}

export interface EnsInfo {
  name: string | null;
  avatarUrl: string | null;
}

// ---------- Helpers ----------

async function gqlFetch<T>(query: string, variables?: object): Promise<T> {
  const res = await fetch(getGraphQLEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status}`);
  const json = await res.json();
  return json.data as T;
}

// ---------- Data fetchers ----------

async function fetchProfitRank(address: string): Promise<{
  totalPnL: number | null;
  rank: number | null;
  totalParticipants: number;
}> {
  const data = await gqlFetch<{
    profitLeaderboard: Array<{ address: string; totalPnL: string }>;
  }>(ALL_TIME_PROFIT_LEADERBOARD_QUERY, { limit: 100 });

  const entries = data?.profitLeaderboard || [];
  const sorted = entries.sort(
    (a, b) => parseFloat(b.totalPnL) - parseFloat(a.totalPnL)
  );
  const addressLc = address.toLowerCase();
  const idx = sorted.findIndex((e) => e.address.toLowerCase() === addressLc);
  const entry = idx >= 0 ? sorted[idx] : null;

  return {
    totalPnL: entry ? parseFloat(entry.totalPnL) : null,
    rank: idx >= 0 ? idx + 1 : null,
    totalParticipants: sorted.length,
  };
}

async function fetchAccuracyRank(address: string): Promise<{
  accuracyScore: number | null;
  rank: number | null;
  totalForecasters: number;
}> {
  const data = await gqlFetch<{
    accountAccuracyRank: {
      accuracyScore: number;
      rank: number | null;
      totalForecasters: number;
    };
  }>(ACCURACY_RANK_QUERY, { address: address.toLowerCase() });

  const r = data?.accountAccuracyRank;
  if (!r) return { accuracyScore: null, rank: null, totalForecasters: 0 };
  return {
    accuracyScore: r.accuracyScore ?? null,
    rank: r.rank,
    totalForecasters: r.totalForecasters ?? 0,
  };
}

async function fetchVolume(address: string): Promise<string | null> {
  const data = await gqlFetch<{ accountTotalVolume: string }>(
    TRADING_VOLUME_QUERY,
    { address: address.toLowerCase() }
  );

  const volumeWei = data?.accountTotalVolume || '0';
  const formatted = formatUnits(volumeWei, 18);
  const num = Number(formatted);
  if (!Number.isFinite(num) || num === 0) return null;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function fetchForecastsCount(address: string): Promise<number | null> {
  // Normalize address for the attester filter
  let normalizedAddress = address;
  try {
    normalizedAddress = getAddress(address);
  } catch {
    // keep original
  }

  const data = await gqlFetch<{
    attestations: Array<{ id: string }>;
  }>(ATTESTATIONS_COUNT_QUERY, {
    where: {
      schemaId: { equals: SCHEMA_UID },
      AND: [{ attester: { equals: normalizedAddress } }],
    },
    take: 100,
  });

  const count = data?.attestations?.length;
  return count != null ? count : null;
}

// ---------- Public API ----------

export async function fetchProfileData(
  address: string
): Promise<ProfileOGData> {
  const [profitResult, accuracyResult, volumeResult, forecastsResult] =
    await Promise.allSettled([
      fetchProfitRank(address),
      fetchAccuracyRank(address),
      fetchVolume(address),
      fetchForecastsCount(address),
    ]);

  const profit =
    profitResult.status === 'fulfilled'
      ? profitResult.value
      : { totalPnL: null, rank: null, totalParticipants: 0 };
  const accuracy =
    accuracyResult.status === 'fulfilled'
      ? accuracyResult.value
      : { accuracyScore: null, rank: null, totalForecasters: 0 };
  const volume =
    volumeResult.status === 'fulfilled' ? volumeResult.value : null;
  const forecastsCount =
    forecastsResult.status === 'fulfilled' ? forecastsResult.value : null;

  return {
    totalPnL: profit.totalPnL,
    profitRank: profit.rank,
    totalParticipants: profit.totalParticipants,
    accuracyScore: accuracy.accuracyScore,
    accuracyRank: accuracy.rank,
    totalForecasters: accuracy.totalForecasters,
    volumeDisplay: volume,
    forecastsCount,
  };
}

export async function resolveEnsInfo(address: string): Promise<EnsInfo> {
  if (!isAddress(address)) return { name: null, avatarUrl: null };

  const timeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
    Promise.race([
      promise,
      new Promise<null>((r) => setTimeout(() => r(null), ms)),
    ]);

  try {
    const name = await timeout(
      mainnetClient.getEnsName({ address: address }),
      3000
    );
    if (!name) return { name: null, avatarUrl: null };

    const avatarUrl = await timeout(getEnsAvatarUrlForAddress(address), 3000);

    return { name, avatarUrl };
  } catch {
    return { name: null, avatarUrl: null };
  }
}
