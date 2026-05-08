import { getAddress } from 'viem';
import { FORECAST_SCHEMA_UID } from '../constants/resolver';
import { graphqlRequest } from './client/graphqlClient';

const DEFAULT_SCHEMA_UID = FORECAST_SCHEMA_UID;

interface RawAttestation {
  id: string;
  uid: string;
  attester: string;
  time: number;
  prediction: string;
  comment: string;
  conditionId?: string;
}

export type FormattedAttestation = {
  id: string;
  uid: string;
  attester: string;
  shortAttester: string;
  value: string;
  comment: string;
  time: string;
  rawTime: number;
  conditionId?: string;
};

type AttestationsQueryResponse = {
  attestations: RawAttestation[];
};

type AttestationsPageResponse = {
  attestationsPage: { items: RawAttestation[]; hasMore: boolean };
};

export const GET_ATTESTATIONS_QUERY = /* GraphQL */ `
  query FindAttestations(
    $attester: String
    $conditionId: String
    $schemaId: String
    $take: Int! = 100
  ) {
    attestationsPage(
      attester: $attester
      conditionId: $conditionId
      schemaId: $schemaId
      orderBy: TIME
      orderDirection: desc
      take: $take
    ) {
      hasMore
      items {
        id
        uid
        attester
        time
        prediction
        comment
        conditionId
      }
    }
  }
`;

export const GET_ATTESTATIONS_PAGINATED_QUERY = /* GraphQL */ `
  query FindAttestationsPaginated(
    $attester: String
    $conditionId: String
    $schemaId: String
    $take: Int!
    $skip: Int! = 0
    $orderBy: AttestationSortField
    $orderDirection: SortOrder
  ) {
    attestationsPage(
      attester: $attester
      conditionId: $conditionId
      schemaId: $schemaId
      orderBy: $orderBy
      orderDirection: $orderDirection
      take: $take
      skip: $skip
    ) {
      hasMore
      items {
        id
        uid
        attester
        time
        prediction
        comment
        conditionId
      }
    }
  }
`;

export const formatAttestationData = (
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
    conditionId: attestation.conditionId,
  };
};

export interface FetchForecastsParams {
  schemaId?: string;
  attesterAddress?: string;
  conditionId?: string;
}

function buildAttestationVariables(params: FetchForecastsParams) {
  const {
    schemaId = DEFAULT_SCHEMA_UID,
    attesterAddress,
    conditionId,
  } = params;

  let normalizedAttesterAddress = attesterAddress;
  if (attesterAddress) {
    try {
      normalizedAttesterAddress = getAddress(attesterAddress);
    } catch (_e) {
      // swallow normalization error
    }
  }

  return {
    schemaId,
    attester: normalizedAttesterAddress ?? null,
    conditionId: conditionId ?? null,
  };
}

export async function fetchForecasts(
  params: FetchForecastsParams
): Promise<AttestationsQueryResponse> {
  const baseVars = buildAttestationVariables(params);

  const data = await graphqlRequest<AttestationsPageResponse>(
    GET_ATTESTATIONS_QUERY,
    { ...baseVars, take: 100 }
  );

  return { attestations: data.attestationsPage?.items ?? [] };
}

export async function fetchForecastsPage(
  params: FetchForecastsParams,
  page: { take: number; skip?: number }
): Promise<AttestationsQueryResponse> {
  const baseVars = buildAttestationVariables(params);

  const data = await graphqlRequest<AttestationsPageResponse>(
    GET_ATTESTATIONS_PAGINATED_QUERY,
    {
      ...baseVars,
      take: page.take,
      skip: page.skip ?? 0,
      orderBy: 'TIME',
      orderDirection: 'desc',
    }
  );

  return { attestations: data.attestationsPage?.items ?? [] };
}

export async function fetchUserForecasts(params: {
  attesterAddress: string;
  schemaId?: string;
  conditionId?: string;
  take: number;
  skip: number;
  orderBy: string;
  orderDirection: 'asc' | 'desc';
}): Promise<FormattedAttestation[]> {
  const {
    attesterAddress,
    schemaId = DEFAULT_SCHEMA_UID,
    conditionId,
    take,
    skip,
    orderBy,
    orderDirection,
  } = params;

  let normalizedAttesterAddress = attesterAddress;
  if (attesterAddress) {
    try {
      normalizedAttesterAddress = getAddress(attesterAddress);
    } catch (_e) {
      // swallow
    }
  }

  // Map old Prisma column names to the new AttestationSortField enum.
  const sortFieldMap: Record<string, 'TIME' | 'CREATED_AT'> = {
    time: 'TIME',
    createdAt: 'CREATED_AT',
  };
  const mappedOrderBy = sortFieldMap[orderBy] ?? 'TIME';

  const variables = {
    schemaId,
    attester: normalizedAttesterAddress ?? null,
    conditionId: conditionId ?? null,
    take,
    skip,
    orderBy: mappedOrderBy,
    orderDirection,
  };
  const data = await graphqlRequest<AttestationsPageResponse>(
    GET_ATTESTATIONS_PAGINATED_QUERY,
    variables
  );
  return (data.attestationsPage?.items || []).map((att) =>
    formatAttestationData(att)
  );
}

export function generateForecastsQueryKey(params: {
  schemaId?: string;
  attesterAddress?: string;
  chainId?: number;
  conditionId?: string;
}) {
  return [
    'attestations',
    params.schemaId ?? DEFAULT_SCHEMA_UID,
    params.attesterAddress || null,
    params.chainId || null,
    params.conditionId || null,
  ];
}
