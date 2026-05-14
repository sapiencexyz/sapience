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

/**
 * Top-level fetch — uses the new offset-based `attestationsPage` and
 * unwraps its `items` into the legacy `{ attestations }` shape callers
 * already consume.
 */
export const GET_ATTESTATIONS_QUERY = /* GraphQL */ `
  query FindAttestations(
    $schemaId: String
    $attester: String
    $conditionId: String
    $take: Int!
  ) {
    attestationsPage(
      schemaId: $schemaId
      attester: $attester
      conditionId: $conditionId
      orderBy: TIME
      orderDirection: desc
      take: $take
    ) {
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

/**
 * Offset-based infinite-scroll query. `attestationsPage` is offset-only,
 * so consumers translate "next page" into a running `skip`. See
 * `useInfiniteForecasts` for the caller side.
 *
 * Trade-off vs. cursor pagination on a moving table: a new attestation
 * inserted at the top of the list while the user is mid-scroll will
 * shift subsequent pages by one row, so the same attestation can
 * appear on adjacent pages. Acceptable for the forecasts feed (rare
 * insertion rate at typical session length).
 */
export const GET_ATTESTATIONS_PAGINATED_QUERY = /* GraphQL */ `
  query FindAttestationsPaginated(
    $schemaId: String!
    $attester: String
    $conditionId: String
    $take: Int! = 10
    $skip: Int! = 0
  ) {
    attestationsPage(
      schemaId: $schemaId
      attester: $attester
      conditionId: $conditionId
      orderBy: TIME
      orderDirection: desc
      take: $take
      skip: $skip
    ) {
      items {
        id
        uid
        attester
        time
        prediction
        comment
        conditionId
      }
      hasMore
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

function normalizeAttester(attester?: string): string | undefined {
  if (!attester) return undefined;
  try {
    return getAddress(attester);
  } catch {
    return attester;
  }
}

export async function fetchForecasts(
  params: FetchForecastsParams
): Promise<AttestationsQueryResponse> {
  const {
    schemaId = DEFAULT_SCHEMA_UID,
    attesterAddress,
    conditionId,
  } = params;

  const data = await graphqlRequest<{
    attestationsPage: { items: RawAttestation[] };
  }>(GET_ATTESTATIONS_QUERY, {
    schemaId,
    attester: normalizeAttester(attesterAddress) ?? null,
    conditionId: conditionId ?? null,
    take: 100,
  });

  return { attestations: data.attestationsPage?.items ?? [] };
}

/**
 * Offset-based infinite-scroll page fetch. Returns `{ attestations, hasMore }`
 * so callers can stop paging on the server-truth flag instead of
 * `items.length < take`.
 */
export async function fetchForecastsPage(
  params: FetchForecastsParams,
  page: { take: number; skip: number }
): Promise<AttestationsQueryResponse & { hasMore: boolean }> {
  const {
    schemaId = DEFAULT_SCHEMA_UID,
    attesterAddress,
    conditionId,
  } = params;

  const data = await graphqlRequest<{
    attestationsPage: { items: RawAttestation[]; hasMore: boolean };
  }>(GET_ATTESTATIONS_PAGINATED_QUERY, {
    schemaId,
    attester: normalizeAttester(attesterAddress) ?? null,
    conditionId: conditionId ?? null,
    take: page.take,
    skip: page.skip,
  });

  return {
    attestations: data.attestationsPage?.items ?? [],
    hasMore: data.attestationsPage?.hasMore ?? false,
  };
}

const USER_FORECASTS_QUERY = /* GraphQL */ `
  query UserForecasts(
    $schemaId: String
    $attester: String
    $conditionId: String
    $take: Int!
    $skip: Int!
    $orderBy: AttestationSortField
    $orderDirection: SortOrder
  ) {
    attestationsPage(
      schemaId: $schemaId
      attester: $attester
      conditionId: $conditionId
      take: $take
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
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

const USER_FORECAST_ORDER_BY_GQL: Record<string, string> = {
  time: 'TIME',
  createdAt: 'CREATED_AT',
};

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

  const variables = {
    schemaId,
    attester: normalizeAttester(attesterAddress) ?? null,
    conditionId: conditionId ?? null,
    take,
    skip,
    // Fall back to TIME if the caller passes an unmapped field — the old
    // resolver accepted arbitrary Prisma fields, but `attestationsPage`
    // only exposes TIME and CREATED_AT today.
    orderBy: USER_FORECAST_ORDER_BY_GQL[orderBy] ?? 'TIME',
    orderDirection,
  };
  const data = await graphqlRequest<{
    attestationsPage: { items: RawAttestation[] };
  }>(USER_FORECASTS_QUERY, variables);
  return (data.attestationsPage?.items ?? []).map((att) =>
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
