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

// Protocol Stats types and hooks

interface ProtocolStatsSummary {
  totalTVL: string;
  vaultTVL: string;
  predictionMarketTVL: string;
  lastUpdated: string | null;
}

interface ProtocolStatsTimeSeriesPoint {
  date: string;
  totalTVL: string;
  vaultTVL: string;
  predictionMarketTVL: string;
}

const GET_PROTOCOL_STATS_SUMMARY = /* GraphQL */ `
  query ProtocolStatsSummary {
    protocolStatsSummary {
      totalTVL
      vaultTVL
      predictionMarketTVL
      lastUpdated
    }
  }
`;

const GET_PROTOCOL_STATS_TIME_SERIES = /* GraphQL */ `
  query ProtocolStatsTimeSeries {
    protocolStatsTimeSeries {
      date
      totalTVL
      vaultTVL
      predictionMarketTVL
    }
  }
`;

export function useProtocolStatsSummary() {
  return useQuery<ProtocolStatsSummary | null>({
    queryKey: ['protocolStatsSummary'],
    queryFn: async () => {
      const data = await graphqlRequest<{
        protocolStatsSummary: ProtocolStatsSummary;
      }>(GET_PROTOCOL_STATS_SUMMARY);
      return data?.protocolStatsSummary ?? null;
    },
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export function useProtocolStatsTimeSeries() {
  return useQuery<ProtocolStatsTimeSeriesPoint[]>({
    queryKey: ['protocolStatsTimeSeries'],
    queryFn: async () => {
      const data = await graphqlRequest<{
        protocolStatsTimeSeries: ProtocolStatsTimeSeriesPoint[];
      }>(GET_PROTOCOL_STATS_TIME_SERIES);
      return data?.protocolStatsTimeSeries ?? [];
    },
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export type {
  AnalyticsSummary,
  AnalyticsTimeSeriesPoint,
  ProtocolStatsSummary,
  ProtocolStatsTimeSeriesPoint,
};
