import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { useQuery } from '@tanstack/react-query';

interface AnalyticsSummary {
  totalVolume: string;
  openInterest: string;
  tvl: string;
}

interface AnalyticsTimeSeriesPoint {
  date: string;
  dailyVolume: string;
  openInterest: string;
  tvl: string;
}

const GET_ANALYTICS_SUMMARY = /* GraphQL */ `
  query AnalyticsSummary($chainId: Int!) {
    analyticsSummary(chainId: $chainId) {
      totalVolume
      openInterest
      tvl
    }
  }
`;

const GET_ANALYTICS_TIME_SERIES = /* GraphQL */ `
  query AnalyticsTimeSeries($chainId: Int!) {
    analyticsTimeSeries(chainId: $chainId) {
      date
      dailyVolume
      openInterest
      tvl
    }
  }
`;

const CACHE_TIME_MS = 60 * 1000;

export function useAnalyticsSummary(chainId: number) {
  return useQuery<AnalyticsSummary | null>({
    queryKey: ['analyticsSummary', chainId],
    queryFn: async () => {
      const data = await graphqlRequest<{
        analyticsSummary: AnalyticsSummary;
      }>(GET_ANALYTICS_SUMMARY, { chainId });
      return data?.analyticsSummary ?? null;
    },
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export function useAnalyticsTimeSeries(chainId: number) {
  return useQuery<AnalyticsTimeSeriesPoint[]>({
    queryKey: ['analyticsTimeSeries', chainId],
    queryFn: async () => {
      const data = await graphqlRequest<{
        analyticsTimeSeries: AnalyticsTimeSeriesPoint[];
      }>(GET_ANALYTICS_TIME_SERIES, { chainId });
      return data?.analyticsTimeSeries ?? [];
    },
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export type { AnalyticsSummary, AnalyticsTimeSeriesPoint };
