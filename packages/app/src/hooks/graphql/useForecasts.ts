import type { QueryClient } from '@tanstack/react-query';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import React from 'react';
import {
  fetchForecasts,
  fetchForecastsPage,
  fetchUserForecasts,
  generateForecastsQueryKey,
  type ForecastPage,
  type FormattedAttestation,
} from '@sapience/sdk/queries';

import { SCHEMA_UID } from '~/lib/constants';

const EMPTY_FORECASTS: FormattedAttestation[] = [];

interface UseForecastsProps {
  schemaId?: string;
  attesterAddress?: string;
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
  attesterAddress,
  chainId,
  conditionId,
  options,
}: UseForecastsProps) => {
  const queryKey = generateForecastsQueryKey({
    schemaId,
    attesterAddress,
    chainId,
    conditionId,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      fetchForecasts({
        schemaId,
        attesterAddress,
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

  // The SDK already returns render-ready FormattedAttestation rows (v2).
  return { data: data ?? EMPTY_FORECASTS, isLoading, error, refetch };
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

/** Relay forward pagination: thread the last page's endCursor as `after`. */
const getNextForecastPageParam = (lastPage: ForecastPage) =>
  lastPage.pageInfo.hasNextPage
    ? (lastPage.pageInfo.endCursor ?? undefined)
    : undefined;

export const useInfiniteForecasts = ({
  schemaId = SCHEMA_UID,
  attesterAddress,
  chainId,
  conditionId,
}: UseForecastsProps & { pageSize?: number }) => {
  const pageSize = 10;
  const queryKey = [
    ...generateForecastsQueryKey({
      schemaId,
      attesterAddress,
      chainId,
      conditionId,
    }),
    'infinite',
  ];

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchForecastsPage(
        { schemaId, attesterAddress, conditionId },
        { first: pageSize, after: pageParam }
      ),
    initialPageParam: null as string | null,
    getNextPageParam: getNextForecastPageParam,
    retry: 3,
    retryDelay: 1000,
  });

  const data: FormattedAttestation[] = React.useMemo(() => {
    if (!query.data?.pages) return [];
    return query.data.pages.flatMap((p) => p.items);
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
  attesterAddress: string;
  schemaId?: string;
  conditionId?: string;
  /** Rows per page (`first`). */
  pageSize?: number;
  /** Direction of the fixed v2 ATTESTED_AT ordering. */
  orderDirection: 'asc' | 'desc';
}

export const useUserForecasts = ({
  attesterAddress,
  schemaId = SCHEMA_UID,
  conditionId,
  pageSize = 20,
  orderDirection,
}: UseUserForecastsParams) => {
  const query = useInfiniteQuery({
    queryKey: [
      'forecasts',
      schemaId,
      attesterAddress,
      conditionId || null,
      pageSize,
      orderDirection,
    ],
    queryFn: ({ pageParam }) =>
      fetchUserForecasts({
        attesterAddress,
        schemaId,
        conditionId,
        first: pageSize,
        after: pageParam,
        orderDirection,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: getNextForecastPageParam,
    enabled: Boolean(attesterAddress),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const data: FormattedAttestation[] = React.useMemo(() => {
    if (!query.data?.pages) return [];
    return query.data.pages.flatMap((p) => p.items);
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

export type { FormattedAttestation };
