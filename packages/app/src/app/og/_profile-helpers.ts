// Profile-specific helpers for OG image generation

import { isAddress } from 'viem';
import { formatUnits } from './_prediction-helpers';
import { getGraphQLEndpoint } from '~/lib/data/graphql';
import { mainnetClient } from '~/lib/utils/util';
import { getEnsAvatarUrlForAddress } from '~/lib/ens/avatar.server';
import { SCHEMA_UID } from '~/lib/constants';

// ---------- GraphQL queries ----------

const PROFIT_RANK_QUERY = `
  query ProfileProfitRank($address: Address!) {
    account(address: $address) {
      ranking(metric: PNL) {
        rank
        pnlFormatted
      }
    }
    leaderboard(metric: PNL, first: 0) {
      totalCount
    }
  }
`;

const ACCURACY_RANK_QUERY = `
  query ProfileAccuracyRank($address: Address!) {
    account(address: $address) {
      ranking(metric: ACCURACY) {
        rank
        accuracy
      }
    }
    leaderboard(metric: ACCURACY, first: 0) {
      totalCount
    }
  }
`;

const TRADING_VOLUME_QUERY = `
  query TradingVolume($address: Address!) {
    account(address: $address) {
      stats {
        totalVolume
      }
    }
  }
`;

const FORECASTS_COUNT_QUERY = `
  query ProfileForecastsCount($attester: Address!, $schemaId: String!) {
    forecasts(filter: { attester: $attester, schemaId: $schemaId }, first: 0) {
      totalCount
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

// Server-side `account.ranking(metric: PNL)` ranks over the FULL
// population (the legacy path sorted the fetched top-100 client-side, so
// ranks beyond 100 were null and totalParticipants was capped at 100).
async function fetchProfitRank(address: string): Promise<{
  totalPnL: number | null;
  rank: number | null;
  totalParticipants: number;
}> {
  const data = await gqlFetch<{
    account: {
      ranking: { rank: number; pnlFormatted: string } | null;
    } | null;
    leaderboard: { totalCount: number } | null;
  }>(PROFIT_RANK_QUERY, { address: address.toLowerCase() });

  const ranking = data?.account?.ranking ?? null;
  return {
    totalPnL: ranking ? parseFloat(ranking.pnlFormatted) : null,
    rank: ranking?.rank ?? null,
    totalParticipants: data?.leaderboard?.totalCount ?? 0,
  };
}

async function fetchAccuracyRank(address: string): Promise<{
  accuracyScore: number | null;
  rank: number | null;
  totalForecasters: number;
}> {
  const data = await gqlFetch<{
    account: {
      ranking: { rank: number; accuracy: number | null } | null;
    } | null;
    leaderboard: { totalCount: number } | null;
  }>(ACCURACY_RANK_QUERY, { address: address.toLowerCase() });

  const ranking = data?.account?.ranking ?? null;
  const totalForecasters = data?.leaderboard?.totalCount ?? 0;
  if (!ranking) return { accuracyScore: null, rank: null, totalForecasters };
  return {
    // Ranking.accuracy carries the SAME raw avg(twError) scale as the legacy
    // accuracyScore (parity-verified identity; the SDL's old "0-1" doc was
    // wrong) — pass through unscaled; the OG route Math.rounds it as before.
    accuracyScore: ranking.accuracy != null ? ranking.accuracy : 0,
    rank: ranking.rank,
    totalForecasters,
  };
}

async function fetchVolume(address: string): Promise<string | null> {
  const data = await gqlFetch<{
    account: { stats: { totalVolume: string | number } } | null;
  }>(TRADING_VOLUME_QUERY, { address: address.toLowerCase() });

  const volumeWei = String(data?.account?.stats?.totalVolume ?? '0');
  const formatted = formatUnits(volumeWei, 18);
  const num = Number(formatted);
  if (!Number.isFinite(num) || num === 0) return null;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function fetchForecastsCount(address: string): Promise<number | null> {
  // `forecasts` is a Relay connection; `first: 0` is a legal count-only
  // query. Unlike the legacy `take: 100` page fetch, the count is exact (not
  // capped at 100). The Address scalar canonicalizes to lowercase.
  const data = await gqlFetch<{
    forecasts: { totalCount: number } | null;
  }>(FORECASTS_COUNT_QUERY, {
    attester: address.toLowerCase(),
    schemaId: SCHEMA_UID,
  });

  const count = data?.forecasts?.totalCount;
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
