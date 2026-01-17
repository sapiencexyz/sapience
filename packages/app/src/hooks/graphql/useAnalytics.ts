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

export const useAnalyticsSummary = (chainId: number) => {
  return useQuery<AnalyticsSummary | null>({
    queryKey: ['analyticsSummary', chainId],
    queryFn: async () => {
      try {
        const data = await graphqlRequest<{
          analyticsSummary: AnalyticsSummary;
        }>(GET_ANALYTICS_SUMMARY, { chainId });
        return data?.analyticsSummary || null;
      } catch (error) {
        console.error('Error fetching analytics summary:', error);
        return null;
      }
    },
    staleTime: 60 * 1000, // 60 second TTL
    refetchInterval: 60 * 1000,
  });
};

export const useAnalyticsTimeSeries = (chainId: number) => {
  return useQuery<AnalyticsTimeSeriesPoint[]>({
    queryKey: ['analyticsTimeSeries', chainId],
    queryFn: async () => {
      try {
        const data = await graphqlRequest<{
          analyticsTimeSeries: AnalyticsTimeSeriesPoint[];
        }>(GET_ANALYTICS_TIME_SERIES, { chainId });
        return data?.analyticsTimeSeries || [];
      } catch (error) {
        console.error('Error fetching analytics time series:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minute TTL
    refetchInterval: 5 * 60 * 1000,
  });
};

export type { AnalyticsSummary, AnalyticsTimeSeriesPoint };
