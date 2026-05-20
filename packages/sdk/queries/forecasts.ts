import { getAddress } from 'viem';
import { FORECAST_SCHEMA_UID } from '../constants/resolver';
import { graphqlRequest } from './client/graphqlClient';

const DEFAULT_SCHEMA_UID = FORECAST_SCHEMA_UID;

interface RawForecast {
  id: string;
  uid: string;
  forecaster: string;
  attestedAt: number;
  forecast: string;
  comment: string;
  conditionId?: string;
}

export type FormattedForecast = {
  id: string;
  uid: string;
  forecaster: string;
  shortForecaster: string;
  value: string;
  comment: string;
  time: string;
  rawTime: number;
  conditionId?: string;
};

type ForecastsQueryResponse = {
  forecasts: RawForecast[];
};

export const GET_FORECASTS_QUERY = /* GraphQL */ `
  query FindForecasts($filters: ForecastFilter, $take: Int!) {
    forecastsConnection(
      filter: $filters
      orderBy: { field: ATTESTED_AT, direction: DESC }
      first: $take
    ) {
      nodes {
        id
        uid
        forecaster
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
 * Cursor-based infinite-scroll query. Callers pass the previous page's
 * `pageInfo.endCursor` to fetch the next slice.
 */
export const GET_FORECASTS_PAGINATED_QUERY = /* GraphQL */ `
  query FindForecastsPaginated(
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
        forecaster
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

export const formatForecastData = (
  forecast: RawForecast
): FormattedForecast => {
  const formattedTime = new Date(
    Number(forecast.attestedAt) * 1000
  ).toLocaleString();

  return {
    id: forecast.id.toString(),
    uid: forecast.uid,
    forecaster: forecast.forecaster,
    shortForecaster: `${forecast.forecaster.slice(
      0,
      6
    )}...${forecast.forecaster.slice(-4)}`,
    value: forecast.forecast,
    time: formattedTime,
    rawTime: forecast.attestedAt,
    comment: forecast.comment,
    conditionId: forecast.conditionId,
  };
};

export interface FetchForecastsParams {
  schemaId?: string;
  forecasterAddress?: string;
  conditionId?: string;
}

function normalizeForecaster(forecaster?: string): string | undefined {
  if (!forecaster) return undefined;
  try {
    return getAddress(forecaster);
  } catch {
    return forecaster;
  }
}

export async function fetchForecasts(
  params: FetchForecastsParams
): Promise<ForecastsQueryResponse> {
  const {
    schemaId = DEFAULT_SCHEMA_UID,
    forecasterAddress,
    conditionId,
  } = params;

  const data = await graphqlRequest<{
    forecastsConnection: { nodes: RawForecast[] };
  }>(GET_FORECASTS_QUERY, {
    filters: {
      schemaId,
      forecaster: normalizeForecaster(forecasterAddress) ?? null,
      conditionId: conditionId ?? null,
    },
    take: 100,
  });

  return { forecasts: data.forecastsConnection?.nodes ?? [] };
}

/**
 * Cursor-based infinite-scroll page fetch. Returns the server-provided
 * `endCursor` so callers can request the next page via `after`.
 */
export async function fetchForecastsPage(
  params: FetchForecastsParams,
  page: { take: number; after?: string | null }
): Promise<
  ForecastsQueryResponse & { hasMore: boolean; endCursor: string | null }
> {
  const {
    schemaId = DEFAULT_SCHEMA_UID,
    forecasterAddress,
    conditionId,
  } = params;

  const data = await graphqlRequest<{
    forecastsConnection: {
      nodes: RawForecast[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(GET_FORECASTS_PAGINATED_QUERY, {
    filters: {
      schemaId,
      forecaster: normalizeForecaster(forecasterAddress) ?? null,
      conditionId: conditionId ?? null,
    },
    take: page.take,
    after: page.after ?? null,
  });

  return {
    forecasts: data.forecastsConnection?.nodes ?? [],
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
        forecaster
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
  schemaId?: string;
  conditionId?: string;
  take: number;
  after?: string | null;
  orderBy: string;
  orderDirection: 'asc' | 'desc';
}): Promise<{
  forecasts: FormattedForecast[];
  hasMore: boolean;
  endCursor: string | null;
}> {
  const {
    forecasterAddress,
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
      forecaster: normalizeForecaster(forecasterAddress) ?? null,
      conditionId: conditionId ?? null,
    },
    take,
    after: after ?? null,
    // Fall back to ATTESTED_AT if the caller passes an unmapped field —
    // `forecastsConnection` only exposes ATTESTED_AT and CREATED_AT today.
    orderBy: USER_FORECAST_ORDER_BY_GQL[orderBy] ?? 'ATTESTED_AT',
    orderDirection: orderDirection.toUpperCase(),
  };
  const data = await graphqlRequest<{
    forecastsConnection: {
      nodes: RawForecast[] | null;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(USER_FORECASTS_QUERY, variables);

  return {
    forecasts: (data.forecastsConnection?.nodes ?? []).map((f) =>
      formatForecastData(f)
    ),
    hasMore: data.forecastsConnection?.pageInfo?.hasNextPage ?? false,
    endCursor: data.forecastsConnection?.pageInfo?.endCursor ?? null,
  };
}

export function generateForecastsQueryKey(params: {
  schemaId?: string;
  forecasterAddress?: string;
  chainId?: number;
  conditionId?: string;
}) {
  return [
    'forecasts',
    params.schemaId ?? DEFAULT_SCHEMA_UID,
    params.forecasterAddress || null,
    params.chainId || null,
    params.conditionId || null,
  ];
}
