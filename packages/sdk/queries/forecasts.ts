import { getAddress } from 'viem';
import { FORECAST_SCHEMA_UID } from '../constants/resolver';
import { graphqlRequest } from './client/graphqlClient';

const DEFAULT_SCHEMA_UID = FORECAST_SCHEMA_UID;

interface RawAttestation {
  id: string;
  uid: string;
  attester: string;
  attestedAt: number;
  forecast: string;
  comment: string;
  conditionId?: string;
}

export type FormattedAttestation = {
  id: string;
  uid: string;
  attester: string;
  forecaster: string;
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
 * Top-level fetch — uses `forecastsConnection` and unwraps its
 * `nodes` into the legacy `{ attestations }` shape callers already
 * consume.
 */
export const GET_ATTESTATIONS_QUERY = /* GraphQL */ `
  query FindAttestations($filters: ForecastFilter, $take: Int!) {
    forecastsConnection(
      filter: $filters
      orderBy: { field: ATTESTED_AT, direction: DESC }
      first: $take
    ) {
      nodes {
        id
        uid
        attester: forecaster
        attestedAt
        forecast
        comment
        conditionId
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Cursor-based infinite-scroll query. `forecastsConnection` follows the
 * redesign's Relay-shaped `first` / `after` contract; callers pass the
 * previous page's `pageInfo.endCursor` to fetch the next slice.
 */
export const GET_ATTESTATIONS_PAGINATED_QUERY = /* GraphQL */ `
  query FindAttestationsPaginated(
    $filters: ForecastFilter
    $take: Int! = 10
    $after: String
  ) {
    forecastsConnection(
      filter: $filters
      orderBy: { field: ATTESTED_AT, direction: DESC }
      first: $take
      after: $after
    ) {
      nodes {
        id
        uid
        attester: forecaster
        attestedAt
        forecast
        comment
        conditionId
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const formatAttestationData = (
  attestation: RawAttestation
): FormattedAttestation => {
  const formattedTime = new Date(
    Number(attestation.attestedAt) * 1000
  ).toLocaleString();

  return {
    id: attestation.id.toString(),
    uid: attestation.uid,
    attester: attestation.attester,
    forecaster: attestation.attester,
    shortAttester: `${attestation.attester.slice(
      0,
      6
    )}...${attestation.attester.slice(-4)}`,
    value: attestation.forecast,
    time: formattedTime,
    rawTime: attestation.attestedAt,
    comment: attestation.comment,
    conditionId: attestation.conditionId,
  };
};

export interface FetchForecastsParams {
  schemaId?: string;
  attesterAddress?: string;
  forecasterAddress?: string;
  conditionId?: string;
}

function normalizeAttester(forecaster?: string): string | undefined {
  if (!forecaster) return undefined;
  try {
    return getAddress(forecaster);
  } catch {
    return forecaster;
  }
}

export async function fetchForecasts(
  params: FetchForecastsParams
): Promise<AttestationsQueryResponse> {
  const {
    schemaId = DEFAULT_SCHEMA_UID,
    attesterAddress,
    forecasterAddress,
    conditionId,
  } = params;

  const data = await graphqlRequest<{
    forecastsConnection: { nodes: RawAttestation[] };
  }>(GET_ATTESTATIONS_QUERY, {
    filters: {
      schemaId,
      forecaster:
        normalizeAttester(forecasterAddress ?? attesterAddress) ?? null,
      conditionId: conditionId ?? null,
    },
    take: 100,
  });

  return { attestations: data.forecastsConnection?.nodes ?? [] };
}

/**
 * Cursor-based infinite-scroll page fetch. Returns the server-provided
 * `endCursor` so callers can request the next page via `after`.
 */
export async function fetchForecastsPage(
  params: FetchForecastsParams,
  page: { take: number; after?: string | null }
): Promise<
  AttestationsQueryResponse & { hasMore: boolean; endCursor: string | null }
> {
  const {
    schemaId = DEFAULT_SCHEMA_UID,
    attesterAddress,
    forecasterAddress,
    conditionId,
  } = params;

  const data = await graphqlRequest<{
    forecastsConnection: {
      nodes: RawAttestation[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(GET_ATTESTATIONS_PAGINATED_QUERY, {
    filters: {
      schemaId,
      forecaster:
        normalizeAttester(forecasterAddress ?? attesterAddress) ?? null,
      conditionId: conditionId ?? null,
    },
    take: page.take,
    after: page.after ?? null,
  });

  return {
    attestations: data.forecastsConnection?.nodes ?? [],
    hasMore: data.forecastsConnection?.pageInfo?.hasNextPage ?? false,
    endCursor: data.forecastsConnection?.pageInfo?.endCursor ?? null,
  };
}

const USER_FORECASTS_QUERY = /* GraphQL */ `
  query UserForecasts(
    $filters: ForecastFilter
    $take: Int!
    $after: String
    $orderBy: ForecastOrderField
    $orderDirection: OrderDirection
  ) {
    forecastsConnection(
      filter: $filters
      first: $take
      after: $after
      orderBy: { field: $orderBy, direction: $orderDirection }
    ) {
      nodes {
        id
        uid
        attester: forecaster
        attestedAt
        forecast
        comment
        conditionId
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const USER_FORECAST_ORDER_BY_GQL: Record<string, string> = {
  time: 'ATTESTED_AT',
  attestedAt: 'ATTESTED_AT',
  createdAt: 'CREATED_AT',
};

export async function fetchUserForecasts(params: {
  forecasterAddress?: string;
  attesterAddress?: string;
  schemaId?: string;
  conditionId?: string;
  take: number;
  after?: string | null;
  orderBy: string;
  orderDirection: 'asc' | 'desc';
}): Promise<{
  forecasts: FormattedAttestation[];
  hasMore: boolean;
  endCursor: string | null;
}> {
  const {
    forecasterAddress,
    attesterAddress,
    schemaId = DEFAULT_SCHEMA_UID,
    conditionId,
    take,
    after,
    orderBy,
    orderDirection,
  } = params;

  const variables = {
    filters: {
      schemaId,
      forecaster:
        normalizeAttester(forecasterAddress ?? attesterAddress) ?? null,
      conditionId: conditionId ?? null,
    },
    take,
    after: after ?? null,
    // Fall back to ATTESTED_AT if the caller passes an unmapped field —
    // the old resolver accepted arbitrary Prisma fields, but
    // `forecastsConnection` only exposes ATTESTED_AT and CREATED_AT today.
    orderBy: USER_FORECAST_ORDER_BY_GQL[orderBy] ?? 'ATTESTED_AT',
    orderDirection: orderDirection.toUpperCase(),
  };
  const data = await graphqlRequest<{
    forecastsConnection: {
      nodes: RawAttestation[] | null;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(USER_FORECASTS_QUERY, variables);

  return {
    forecasts: (data.forecastsConnection?.nodes ?? []).map((att) =>
      formatAttestationData(att)
    ),
    hasMore: data.forecastsConnection?.pageInfo?.hasNextPage ?? false,
    endCursor: data.forecastsConnection?.pageInfo?.endCursor ?? null,
  };
}

export function generateForecastsQueryKey(params: {
  schemaId?: string;
  attesterAddress?: string;
  forecasterAddress?: string;
  chainId?: number;
  conditionId?: string;
}) {
  return [
    'attestations',
    params.schemaId ?? DEFAULT_SCHEMA_UID,
    (params.forecasterAddress ?? params.attesterAddress) || null,
    params.chainId || null,
    params.conditionId || null,
  ];
}
