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
  query AnalyticsSummary {
    analyticsSummary {
      totalVolume
      openInterest
      tvl
    }
  }
`;

const GET_ANALYTICS_TIME_SERIES = /* GraphQL */ `
  query AnalyticsTimeSeries {
    analyticsTimeSeries {
      date
      dailyVolume
      openInterest
      tvl
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
