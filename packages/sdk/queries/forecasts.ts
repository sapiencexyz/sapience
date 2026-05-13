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
 * Cursor-based pagination uses the deprecated `attestations(cursor:)` form.
 * `attestationsPage` is offset-only and doesn't yet expose a cursor arg,
 * so migrating this path requires a UI refactor (translate `cursorId` to
 * a running `skip` in the caller) — deferred to a follow-up slice. Until
 * then, this still works against the deprecated bare-array query.
 */
export const GET_ATTESTATIONS_PAGINATED_QUERY = /* GraphQL */ `
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

function normalizeAttester(attester?: string): string | undefined {
  if (!attester) return undefined;
  try {
    return getAddress(attester);
  } catch {
    return attester;
  }
}

/**
 * @internal Kept for back-compat with `fetchForecastsPage` which still
 * uses the deprecated cursor-based query.
 */
function buildAttestationFilters(params: FetchForecastsParams) {
  const {
    schemaId = DEFAULT_SCHEMA_UID,
    attesterAddress,
    conditionId,
  } = params;

  const normalizedAttesterAddress = normalizeAttester(attesterAddress);

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
 * Cursor-based infinite-scroll page fetch. Still backed by the
 * deprecated `attestations(cursor:)` query — see the comment on
 * `GET_ATTESTATIONS_PAGINATED_QUERY` above.
 */
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
