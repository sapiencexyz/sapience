import { getAddress } from 'viem';
import { FORECAST_SCHEMA_UID } from '../constants/resolver';
import { graphqlRequest } from './client/graphqlClient';

const DEFAULT_SCHEMA_UID = FORECAST_SCHEMA_UID;

/**
 * Wire shape of a `Forecast` node (the subset selected by the documents
 * below). The schema exposes `value` (a probability STRING, not a binary
 * outcome) and `attestedAt` (epoch seconds). The numeric Prisma row id is
 * not exposed — identity is the EAS `uid`.
 */
export interface ForecastNode {
  uid: string;
  attester: string;
  attestedAt: number;
  value: string;
  comment?: string | null;
  conditionId?: string | null;
}

export type FormattedAttestation = {
  /** EAS uid — there is no numeric attestation row id. */
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

export type ForecastPageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

export type ForecastPage = {
  items: FormattedAttestation[];
  pageInfo: ForecastPageInfo;
};

type ForecastsConnectionResponse = {
  forecasts?: {
    nodes?: ForecastNode[];
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  } | null;
};

export const GET_FORECASTS_QUERY = `
  query ForecastsList($filter: ForecastFilter, $first: Int!) {
    forecasts(
      first: $first
      filter: $filter
      orderBy: { field: ATTESTED_AT, direction: DESC }
    ) {
      nodes {
        uid
        attester
        attestedAt
        value
        comment
        conditionId
      }
    }
  }
`;

export const GET_FORECASTS_PAGINATED_QUERY = `
  query ForecastsPage(
    $filter: ForecastFilter
    $first: Int!
    $after: String
    $orderBy: ForecastOrder
  ) {
    forecasts(
      first: $first
      after: $after
      filter: $filter
      orderBy: $orderBy
    ) {
      nodes {
        uid
        attester
        attestedAt
        value
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
  node: ForecastNode
): FormattedAttestation => {
  const formattedTime = new Date(
    Number(node.attestedAt) * 1000
  ).toLocaleString();

  return {
    id: node.uid,
    uid: node.uid,
    attester: node.attester,
    shortAttester: `${node.attester.slice(0, 6)}...${node.attester.slice(-4)}`,
    value: node.value,
    time: formattedTime,
    rawTime: node.attestedAt,
    comment: node.comment ?? '',
    conditionId: node.conditionId ?? undefined,
  };
};

export interface FetchForecastsParams {
  schemaId?: string;
  attesterAddress?: string;
  conditionId?: string;
}

function buildForecastFilter(
  params: FetchForecastsParams
): Record<string, unknown> {
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
      // keep the address as provided; the Address scalar canonicalizes
    }
  }

  const filter: Record<string, unknown> = { schemaId };
  if (normalizedAttesterAddress) {
    filter.attester = normalizedAttesterAddress;
  }
  if (conditionId) {
    filter.conditionIds = [conditionId];
  }
  return filter;
}

function toFormattedAttestations(
  data: ForecastsConnectionResponse | null
): FormattedAttestation[] {
  const nodes = data?.forecasts?.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error('Failed to fetch forecasts: Invalid response structure');
  }
  return nodes.map(formatAttestationData);
}

function toForecastPage(
  data: ForecastsConnectionResponse | null
): ForecastPage {
  const items = toFormattedAttestations(data);
  const pageInfo = data?.forecasts?.pageInfo;
  return {
    items,
    pageInfo: {
      hasNextPage: Boolean(pageInfo?.hasNextPage),
      endCursor: pageInfo?.endCursor ?? null,
    },
  };
}

export async function fetchForecasts(
  params: FetchForecastsParams
): Promise<FormattedAttestation[]> {
  const data = await graphqlRequest<ForecastsConnectionResponse>(
    GET_FORECASTS_QUERY,
    { filter: buildForecastFilter(params), first: 25 }
  );
  return toFormattedAttestations(data);
}

export interface ForecastPageArgs {
  first: number;
  /** Relay cursor of the last row of the previous page; omit for page one. */
  after?: string | null;
  orderDirection?: 'asc' | 'desc';
}

export async function fetchForecastsPage(
  params: FetchForecastsParams,
  page: ForecastPageArgs
): Promise<ForecastPage> {
  const data = await graphqlRequest<ForecastsConnectionResponse>(
    GET_FORECASTS_PAGINATED_QUERY,
    {
      filter: buildForecastFilter(params),
      first: page.first,
      after: page.after ?? null,
      orderBy: {
        field: 'ATTESTED_AT',
        direction: page.orderDirection === 'asc' ? 'ASC' : 'DESC',
      },
    }
  );
  return toForecastPage(data);
}

export async function fetchUserForecasts(params: {
  attesterAddress: string;
  schemaId?: string;
  conditionId?: string;
  first: number;
  after?: string | null;
  orderDirection: 'asc' | 'desc';
}): Promise<ForecastPage> {
  const {
    attesterAddress,
    schemaId,
    conditionId,
    first,
    after,
    orderDirection,
  } = params;

  return fetchForecastsPage(
    { schemaId, attesterAddress, conditionId },
    { first, after, orderDirection }
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
