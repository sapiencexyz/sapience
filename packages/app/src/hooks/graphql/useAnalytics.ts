import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { useQuery } from '@tanstack/react-query';

// Unified analytics summary including position metrics and protocol balances
interface AnalyticsSummary {
  // Position-based metrics
  totalVolume: string;
  openInterest: string;
  // Protocol balance metrics (on-chain balances)
  vaultBalance: string;
  escrowBalance: string;
  lastUpdated: string | null;
}

// Unified time series point including position metrics and protocol balances
interface AnalyticsTimeSeriesPoint {
  date: string;
  // Position-based metrics
  dailyVolume: string;
  openInterest: string;
  // Protocol balance metrics (on-chain balances)
  vaultBalance: string;
  escrowBalance: string;
}

const GET_ANALYTICS_SUMMARY = /* GraphQL */ `
  query AnalyticsSummary {
    analyticsSummary {
      totalVolume
      openInterest
      vaultBalance
      escrowBalance
      lastUpdated
    }
  }
`;

const GET_ANALYTICS_TIME_SERIES = /* GraphQL */ `
  query AnalyticsTimeSeries {
    analyticsTimeSeries {
      date
      dailyVolume
      openInterest
      vaultBalance
      escrowBalance
    }
  }
`;

const CACHE_TIME_MS = 60 * 1000;

export function useAnalyticsSummary() {
  return useQuery<AnalyticsSummary | null>({
    queryKey: ['analyticsSummary'],
    queryFn: async () => {
      const data = await graphqlRequest<{
        analyticsSummary: AnalyticsSummary;
      }>(GET_ANALYTICS_SUMMARY);
      return data?.analyticsSummary ?? null;
    },
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export function useAnalyticsTimeSeries() {
  return useQuery<AnalyticsTimeSeriesPoint[]>({
    queryKey: ['analyticsTimeSeries'],
    queryFn: async () => {
      const data = await graphqlRequest<{
        analyticsTimeSeries: AnalyticsTimeSeriesPoint[];
      }>(GET_ANALYTICS_TIME_SERIES);
      return data?.analyticsTimeSeries ?? [];
    },
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export type { AnalyticsSummary, AnalyticsTimeSeriesPoint };
