import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { getAddress } from 'viem';
import { graphqlRequest } from '@sapience/ui/lib';

import { SCHEMA_UID } from '../../lib/constants/eas';

// Type for the raw data fetched from the API
interface RawAttestation {
  id: string;
  attester: string;
  time: number; // API returns time as a number (Unix timestamp)
  prediction: string;
  comment: string;
  marketAddress: string;
  marketId: string;
}

// Parameterized version of the query
const GET_ATTESTATIONS_QUERY = /* GraphQL */ `
  query FindAttestations($where: AttestationWhereInput!, $take: Int!) {
    attestations(where: $where, orderBy: { time: desc }, take: $take) {
      id
      attester
      time
      prediction
      marketId
      comment
      marketAddress
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
  attester: string;
  shortAttester: string;
  value: string;
  comment: string;
  marketAddress: string;
  time: string; // Formatted time string
  rawTime: number; // Original timestamp
  marketId: string; // Add marketId from raw data
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
    attester: attestation.attester,
    shortAttester: `${attestation.attester.slice(
      0,
      6
    )}...${attestation.attester.slice(-4)}`,
    value: attestation.prediction,
    time: formattedTime,
    rawTime: attestation.time,
    comment: attestation.comment,
    marketAddress: attestation.marketAddress,
    marketId: attestation.marketId, // Include marketId from raw data
  };
};

interface UsePredictionsProps {
  marketAddress?: string;
  schemaId?: string;
  attesterAddress?: string;
  chainId?: number;
  marketId?: number;
}

export const usePredictions = ({
  marketAddress,
  schemaId = SCHEMA_UID,
  attesterAddress,
  chainId,
  marketId,
}: UsePredictionsProps) => {
  const {
    data: attestationsData,
    isLoading,
    error,
    refetch,
  } = useQuery<AttestationsQueryResponse | undefined>({
    queryKey: [
      'attestations',
      schemaId,
      marketAddress,
      attesterAddress,
      chainId,
      marketId,
    ],
    queryFn: async () => {
      // Normalize addresses if provided
      let normalizedMarketAddress = marketAddress;
      if (marketAddress) {
        try {
          normalizedMarketAddress = getAddress(marketAddress);
        } catch (e) {
          console.error('Failed to normalize market address:', e);
          // Fallback to the original address
        }
      }

      let normalizedAttesterAddress = attesterAddress;
      if (attesterAddress) {
        try {
          normalizedAttesterAddress = getAddress(attesterAddress);
        } catch (e) {
          console.error('Failed to normalize attester address:', e);
          // Fallback to the original address
        }
      }

      // Prepare variables, omitting undefined ones
      const filters: Record<string, { equals: string }>[] = [];
      if (normalizedMarketAddress) {
        filters.push({ marketAddress: { equals: normalizedMarketAddress } });
      }
      if (normalizedAttesterAddress) {
        filters.push({ attester: { equals: normalizedAttesterAddress } });
      }

      if (marketId) {
        filters.push({ marketId: { equals: String(marketId) } });
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
      } catch (error) {
        console.error('Failed to load predictions:', error);
        throw new Error('Failed to load predictions');
      }
    },
    enabled: Boolean(schemaId),
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 4000, // Refetch every 4 seconds
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
