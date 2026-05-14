// Profile-specific helpers for OG image generation

import { isAddress, getAddress } from 'viem';
import {
  fetchAccountAccuracyRank,
  fetchAccountStatsRank,
} from '@sapience/sdk/queries';
import { getGraphQLEndpoint, formatUnits } from './_prediction-helpers';
import { mainnetClient } from '~/lib/utils/util';
import { getEnsAvatarUrlForAddress } from '~/lib/ens/avatar';
import { SCHEMA_UID } from '~/lib/constants';

// ---------- GraphQL queries ----------

const ATTESTATIONS_COUNT_QUERY = `
  query FindAttestationsCount($filters: AttestationFilters, $take: Int!) {
    attestationsPage(
      filters: $filters
      orderBy: ATTESTED_AT
      orderDirection: desc
      take: $take
    ) {
      totalCount
      items {
        id
      }
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
  accuracyTotalParticipants: number;
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

async function fetchProfitAndVolume(address: string): Promise<{
  totalPnL: number | null;
  rank: number | null;
  totalParticipants: number;
  volumeDisplay: string | null;
}> {
  // Single per-address resolver against the same ranked set the analytics
  // leaderboard slices — no top-100 scan, so users outside the top 100 still
  // get a real PnL number. `netPnL` and `volume` are wei; convert for display.
  // Volume comes from the same call so we don't need a second resolver hop.
  const r = await fetchAccountStatsRank({ address, metric: 'NET_PNL' });

  const totalPnL = parseFloat(r.netPnL) / 1e18;
  const volumeNum = Number(formatUnits(r.volume || '0', 18));
  const volumeDisplay =
    Number.isFinite(volumeNum) && volumeNum !== 0
      ? volumeNum.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;

  return {
    totalPnL: r.rank == null && totalPnL === 0 ? null : totalPnL,
    rank: r.rank,
    totalParticipants: r.totalParticipants,
    volumeDisplay,
  };
}

async function fetchAccuracyRank(address: string): Promise<{
  accuracyScore: number | null;
  rank: number | null;
  totalParticipants: number;
}> {
  const r = await fetchAccountAccuracyRank(address);
  return {
    accuracyScore: r.rank == null ? null : r.accuracyScore,
    rank: r.rank,
    totalParticipants: r.totalParticipants,
  };
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
    attestationsPage: {
      totalCount: number | null;
      items: Array<{ id: string }>;
    };
  }>(ATTESTATIONS_COUNT_QUERY, {
    filters: { schemaId: SCHEMA_UID, attester: normalizedAddress },
    take: 100,
  });

  const totalCount = data?.attestationsPage?.totalCount;
  if (totalCount != null) return totalCount;
  const fallbackCount = data?.attestationsPage?.items?.length;
  return fallbackCount != null ? fallbackCount : null;
}

// ---------- Public API ----------

export async function fetchProfileData(
  address: string
): Promise<ProfileOGData> {
  const [profitResult, accuracyResult, forecastsResult] =
    await Promise.allSettled([
      fetchProfitAndVolume(address),
      fetchAccuracyRank(address),
      fetchForecastsCount(address),
    ]);

  const profit =
    profitResult.status === 'fulfilled'
      ? profitResult.value
      : {
          totalPnL: null,
          rank: null,
          totalParticipants: 0,
          volumeDisplay: null,
        };
  const accuracy =
    accuracyResult.status === 'fulfilled'
      ? accuracyResult.value
      : { accuracyScore: null, rank: null, totalParticipants: 0 };
  const forecastsCount =
    forecastsResult.status === 'fulfilled' ? forecastsResult.value : null;

  return {
    totalPnL: profit.totalPnL,
    profitRank: profit.rank,
    totalParticipants: profit.totalParticipants,
    accuracyScore: accuracy.accuracyScore,
    accuracyRank: accuracy.rank,
    accuracyTotalParticipants: accuracy.totalParticipants,
    volumeDisplay: profit.volumeDisplay,
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
