import type { QueryClient } from '@tanstack/react-query';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import React from 'react';
import {
  fetchForecasts,
  fetchForecastsPage,
  fetchUserForecasts,
  formatForecastData,
  generateForecastsQueryKey,
  type FormattedForecast,
} from '@sapience/sdk/queries';

import { SCHEMA_UID } from '~/lib/constants';

interface UseForecastsProps {
  schemaId?: string;
  forecasterAddress?: string;
  chainId?: number;
  conditionId?: string;
  options?: {
    staleTime?: number;
    refetchOnMount?: boolean | 'always';
    refetchOnWindowFocus?: boolean;
    enabled?: boolean;
  };
}

export const useForecasts = ({
  schemaId = SCHEMA_UID,
  forecasterAddress,
  chainId,
  conditionId,
  options,
}: UseForecastsProps) => {
  const queryKey = generateForecastsQueryKey({
    schemaId,
    forecasterAddress,
    chainId,
    conditionId,
  });

  const {
    data: forecastsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () =>
      fetchForecasts({
        schemaId,
        forecasterAddress,
        conditionId,
      }),
    enabled: options?.enabled ?? Boolean(schemaId),
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 60000,
    staleTime: options?.staleTime ?? 60000,
    refetchOnMount: options?.refetchOnMount ?? false,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
  });

  const data: FormattedForecast[] = React.useMemo(() => {
    if (!forecastsData?.forecasts) return [];
    return forecastsData.forecasts.map((f) => formatForecastData(f));
  }, [forecastsData]);

  return { data, isLoading, error, refetch };
};

export const prefetchForecasts = async (
  queryClient: QueryClient,
  schemaId: string
) => {
  const queryKey = generateForecastsQueryKey({ schemaId });

  return await queryClient.prefetchQuery({
    queryKey,
    queryFn: () => fetchForecasts({ schemaId }),
  });
};

export const useInfiniteForecasts = ({
  schemaId = SCHEMA_UID,
  forecasterAddress,
  chainId,
  conditionId,
}: UseForecastsProps & { pageSize?: number }) => {
  const pageSize = 10;
  const queryKey = [
    ...generateForecastsQueryKey({
      schemaId,
      forecasterAddress,
      chainId,
      conditionId,
    }),
    'infinite',
  ];

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchForecastsPage(
        { schemaId, forecasterAddress, conditionId },
        { take: pageSize, after: pageParam }
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      return lastPage.endCursor;
    },
    retry: 3,
    retryDelay: 1000,
  });

  const data: FormattedForecast[] = React.useMemo(() => {
    if (!query.data?.pages) return [];
    return query.data.pages.flatMap((p) =>
      (p.forecasts || []).map((f) => formatForecastData(f))
    );
  }, [query.data]);

  return {
    data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
  };
};

interface UseUserForecastsParams {
  forecasterAddress: string;
  schemaId?: string;
  conditionId?: string;
  take: number;
  after?: string | null;
  orderBy: string;
  orderDirection: 'asc' | 'desc';
}

interface UserForecastsPage {
  forecasts: FormattedForecast[];
  hasMore: boolean;
  endCursor: string | null;
}

export const useUserForecasts = ({
  forecasterAddress,
  schemaId = SCHEMA_UID,
  conditionId,
  take,
  after,
  orderBy,
  orderDirection,
}: UseUserForecastsParams) => {
  return useQuery<UserForecastsPage>({
    queryKey: [
      'forecasts',
      schemaId,
      forecasterAddress,
      conditionId || null,
      take,
      after ?? null,
      orderBy,
      orderDirection,
    ],
    queryFn: () =>
      fetchUserForecasts({
        forecasterAddress,
        schemaId,
        conditionId,
        take,
        after,
        orderBy,
        orderDirection,
      }),
    enabled: Boolean(forecasterAddress),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
};

export type { FormattedForecast };
