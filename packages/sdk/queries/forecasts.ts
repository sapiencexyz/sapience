import { getAddress } from 'viem';
import { graphqlRequest } from './client/graphqlClient';

const DEFAULT_SCHEMA_UID =
  '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49';

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

const GET_ATTESTATIONS_QUERY = /* GraphQL */ `
  query FindAttestations($where: AttestationWhereInput!, $take: Int!) {
    attestations(where: $where, orderBy: { time: desc }, take: $take) {
      id
      uid
      attester
      time
      prediction
      comment
      conditionId
    }
  }
`;

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
      conditionId
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

function buildAttestationFilters(params: FetchForecastsParams) {
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

  const filters: Record<string, { equals: string }>[] = [];
  if (normalizedAttesterAddress) {
    filters.push({ attester: { equals: normalizedAttesterAddress } });
  }
  if (conditionId) {
    filters.push({ conditionId: { equals: conditionId } });
  }

  return {
    where: {
      schemaId: { equals: schemaId },
      AND: filters,
    },
  };
}

export async function fetchForecasts(
  params: FetchForecastsParams
): Promise<AttestationsQueryResponse> {
  const { where } = buildAttestationFilters(params);

  const data = await graphqlRequest<AttestationsQueryResponse>(
    GET_ATTESTATIONS_QUERY,
    { where, take: 100 }
  );

  return data;
}

export async function fetchForecastsPage(
  params: FetchForecastsParams,
  page: { take: number; cursorId?: number }
): Promise<AttestationsQueryResponse> {
  const { where } = buildAttestationFilters(params);

  const variables: Record<string, unknown> = {
    where,
    take: page.take,
    orderBy: [{ time: 'desc' }],
  };

  if (page.cursorId !== undefined) {
    variables.cursor = { id: page.cursorId };
    variables.skip = 1;
  }

  return await graphqlRequest<AttestationsQueryResponse>(
    GET_ATTESTATIONS_PAGINATED_QUERY,
    variables
  );
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

  const filters: Record<string, { equals: string }>[] = [];
  if (normalizedAttesterAddress) {
    filters.push({ attester: { equals: normalizedAttesterAddress } });
  }
  if (conditionId) {
    filters.push({ conditionId: { equals: conditionId } });
  }

  const variables = {
    where: {
      schemaId: { equals: schemaId },
      AND: filters,
    },
    take,
    skip,
    orderBy: [{ [orderBy]: orderDirection }],
  };
  const data = await graphqlRequest<AttestationsQueryResponse>(
    GET_ATTESTATIONS_PAGINATED_QUERY,
    variables
  );
  return (data.attestations || []).map((att) => formatAttestationData(att));
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
