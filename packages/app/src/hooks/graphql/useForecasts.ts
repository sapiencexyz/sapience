import type { QueryClient } from '@tanstack/react-query';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import React from 'react';
import {
  fetchForecasts,
  fetchForecastsPage,
  fetchUserForecasts,
  formatAttestationData,
  generateForecastsQueryKey,
  type FormattedAttestation,
} from '@sapience/sdk/queries';

import { SCHEMA_UID } from '~/lib/constants';

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

  const {
    data: attestationsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
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

  const data: FormattedAttestation[] = React.useMemo(() => {
    if (!attestationsData?.attestations) return [];
    return attestationsData.attestations.map((att) =>
      formatAttestationData(att)
    );
  }, [attestationsData]);

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
        { take: pageSize, cursorId: pageParam }
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      const list = lastPage.attestations || [];
      if (list.length < pageSize) return undefined;
      const last = list[list.length - 1];
      if (!last) return undefined;
      return Number(last.id);
    },
    retry: 3,
    retryDelay: 1000,
  });

  const data: FormattedAttestation[] = React.useMemo(() => {
    if (!query.data?.pages) return [];
    return query.data.pages.flatMap((p) =>
      (p.attestations || []).map((att) => formatAttestationData(att))
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
  attesterAddress: string;
  schemaId?: string;
  conditionId?: string;
  take: number;
  skip: number;
  orderBy: string;
  orderDirection: 'asc' | 'desc';
}

export const useUserForecasts = ({
  attesterAddress,
  schemaId = SCHEMA_UID,
  conditionId,
  take,
  skip,
  orderBy,
  orderDirection,
}: UseUserForecastsParams) => {
  return useQuery<FormattedAttestation[]>({
    queryKey: [
      'forecasts',
      schemaId,
      attesterAddress,
      conditionId || null,
      take,
      skip,
      orderBy,
      orderDirection,
    ],
    queryFn: () =>
      fetchUserForecasts({
        attesterAddress,
        schemaId,
        conditionId,
        take,
        skip,
        orderBy,
        orderDirection,
      }),
    enabled: Boolean(attesterAddress),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
};

export type { FormattedAttestation };
