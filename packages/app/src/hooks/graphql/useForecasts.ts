import type { QueryClient } from '@tanstack/react-query';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import React from 'react';
import { getAddress } from 'viem';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

import { SCHEMA_UID } from '~/lib/constants';

// Type for the raw data fetched from the API
interface RawAttestation {
  id: string;
  uid: string;
  attester: string;
  time: number; // API returns time as a number (Unix timestamp)
  prediction: string;
  comment: string;
  condition?: string;
}

// Parameterized version of the query
const GET_ATTESTATIONS_QUERY = /* GraphQL */ `
  query FindAttestations($where: AttestationWhereInput!, $take: Int!) {
    attestations(where: $where, orderBy: { time: desc }, take: $take) {
      id
      uid
      attester
      time
      prediction
      comment
      condition
    }
  }
`;

// Paginated query leveraging cursor/skip
const GET_ATTESTATIONS_PAGINATED_QUERY = /* GraphQL */ `
  query FindAttestationsPaginated(
    $where: AttestationWhereInput!
    $take: Int!
    $cursor: AttestationWhereUniqueInput
    $skip: Int
    $orderBy: [AttestationOrderByWithRelationInput!]
  ) {
    attestations(
      where: $where
      orderBy: $orderBy
      take: $take
      cursor: $cursor
      skip: $skip
    ) {
      id
      uid
      attester
      time
      prediction
      comment
      condition
    }
  }
`;

// Type definition for GraphQL response
type AttestationsQueryResponse = {
  attestations: RawAttestation[];
};

// Define the data type for the formatted attestation record used in the table
export type FormattedAttestation = {
  id: string;
  uid: string;
  attester: string;
  shortAttester: string;
  value: string;
  comment: string;
  time: string; // Formatted time string
  rawTime: number; // Original timestamp
  questionId?: string; // conditionId from EAS schema
};

// Format raw attestation data into a displayable format
const formatAttestationData = (
  attestation: RawAttestation
): FormattedAttestation => {
  const formattedTime = new Date(
    Number(attestation.time) * 1000
  ).toLocaleString();

  return {
    id: attestation.id.toString(),
    uid: attestation.uid,
    attester: attestation.attester,
    shortAttester: `${attestation.attester.slice(
      0,
      6
    )}...${attestation.attester.slice(-4)}`,
    value: attestation.prediction,
    time: formattedTime,
    rawTime: attestation.time,
    comment: attestation.comment,
    questionId: attestation.condition, // conditionId from EAS schema
  };
};

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

// Function to generate consistent query key for both useForecasts and prefetchForecasts
const generateForecastsQueryKey = ({
  schemaId = SCHEMA_UID,
  attesterAddress,
  chainId,
  conditionId,
}: UseForecastsProps) => {
  return [
    'attestations',
    schemaId,
    attesterAddress || null,
    chainId || null,
    conditionId || null,
  ];
};

const getForecasts = async ({
  schemaId = SCHEMA_UID,
  attesterAddress,
  conditionId,
}: UseForecastsProps) => {
  // Normalize addresses if provided
  let normalizedAttesterAddress = attesterAddress;
  if (attesterAddress) {
    try {
      normalizedAttesterAddress = getAddress(attesterAddress);
    } catch (_e) {
      // swallow normalization error
    }
  }

  // Prepare variables, omitting undefined ones
  const filters: Record<string, { equals: string }>[] = [];
  if (normalizedAttesterAddress) {
    filters.push({ attester: { equals: normalizedAttesterAddress } });
  }
  if (conditionId) {
    filters.push({ condition: { equals: conditionId } as any });
  }

  const variables = {
    where: {
      schemaId: { equals: schemaId },
      AND: filters,
    },
    take: 100,
  };

  try {
    const data = await graphqlRequest<AttestationsQueryResponse>(
      GET_ATTESTATIONS_QUERY,
      variables
    );

    return data;
  } catch (_error) {
    throw new Error('Failed to load forecasts');
  }
};

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
  } = useQuery<AttestationsQueryResponse | undefined>({
    queryKey,
    queryFn: () =>
      getForecasts({
        schemaId,
        attesterAddress,
        conditionId,
      }),
    enabled: options?.enabled ?? Boolean(schemaId),
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 10000, // Refetch every 10 seconds
    staleTime: options?.staleTime ?? 10000,
    refetchOnMount: options?.refetchOnMount ?? false,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
  });

  // Transform raw attestations data into the proper format for the table
  const data: FormattedAttestation[] = React.useMemo(() => {
    if (!attestationsData?.attestations) return [];

    return attestationsData.attestations.map((att: RawAttestation) =>
      formatAttestationData(att)
    );
  }, [attestationsData]);

  return { data, isLoading, error, refetch };
};

export const prefetchForecasts = async (
  queryClient: QueryClient,
  schemaId: string
) => {
  const queryKey = generateForecastsQueryKey({
    schemaId,
  });

  return await queryClient.prefetchQuery({
    queryKey,
    queryFn: () =>
      getForecasts({
        schemaId,
      }),
  });
};

// Fetch a cursor page of attestations
const getForecastsPage = async (
  params: UseForecastsProps,
  page: { take: number; cursorId?: number }
) => {
  const { schemaId = SCHEMA_UID, attesterAddress, conditionId } = params;

  let normalizedAttesterAddress = attesterAddress;
  if (attesterAddress) {
    try {
      normalizedAttesterAddress = getAddress(attesterAddress);
    } catch (_e) {
      // swallow normalization error
    }
  }

  const filters: Record<string, { equals: string }>[] = [];
  if (normalizedAttesterAddress) {
    filters.push({ attester: { equals: normalizedAttesterAddress } });
  }
  if (conditionId) {
    filters.push({ condition: { equals: conditionId } as any });
  }

  const variables: Record<string, any> = {
    where: {
      schemaId: { equals: schemaId },
      AND: filters,
    },
    take: page.take,
    orderBy: [{ time: 'desc' }],
  };

  if (page.cursorId !== undefined) {
    variables.cursor = { id: page.cursorId };
    variables.skip = 1;
  }

  const data = await graphqlRequest<AttestationsQueryResponse>(
    GET_ATTESTATIONS_PAGINATED_QUERY,
    variables
  );
  return data;
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

  const query = useInfiniteQuery<AttestationsQueryResponse>({
    queryKey,
    queryFn: ({ pageParam }) =>
      getForecastsPage(
        { schemaId, attesterAddress, conditionId },
        { take: pageSize, cursorId: pageParam as number | undefined }
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      const list = lastPage.attestations || [];
      if (list.length < pageSize) return undefined;
      const last = list[list.length - 1];
      if (!last) return undefined;
      return Number((last as any).id);
    },
    retry: 3,
    retryDelay: 1000,
  });

  const data: FormattedAttestation[] = React.useMemo(() => {
    if (!query.data?.pages) return [];
    return query.data.pages.flatMap((p) =>
      (p.attestations || []).map((att) => formatAttestationData(att as any))
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
