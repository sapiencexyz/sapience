// Forecast data types, queries, and fetch helpers.
// Shared across SSR pages, client components, and OG image routes.

import { getGraphQLEndpoint } from './graphql';

export const FORECAST_BY_UID_QUERY = `
  query FindForecastByUid($filter: ForecastFilter) {
    forecastsConnection(filter: $filter, first: 1) {
      nodes {
        id
        uid
        forecaster
        attestedAt
        forecast
        comment
        conditionId
        condition {
          id: conditionId
          conditionId
          question
          shortName
          endTime
          settled
          resolvedToYes
          resolver
          category {
            slug
          }
        }
      }
    }
  }
`;

export interface ForecastCondition {
  id: string;
  conditionId: string;
  question: string;
  shortName?: string | null;
  endTime?: number | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  resolver?: string | null;
  category?: { slug: string } | null;
}

export interface ForecastData {
  id: number;
  uid: string;
  forecaster: string;
  attestedAt: number;
  forecast: string;
  comment?: string | null;
  conditionId?: string | null;
  condition?: ForecastCondition | null;
}

// Convert D18 forecast value to percentage (0-100)
export function d18ToPercentage(d18Value: string): number {
  const value = BigInt(d18Value);
  return Number(value) / 1e18;
}

// Fetch forecast by uid from GraphQL API.
// Returns null if the forecast doesn't exist.
// Throws on network/parse errors so callers can distinguish failure from not-found.
export async function fetchForecastByUid(
  uid: string
): Promise<ForecastData | null> {
  const endpoint = getGraphQLEndpoint();
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: FORECAST_BY_UID_QUERY,
      variables: { filter: { uid } },
    }),
  });
  if (!resp.ok) return null;
  const json = await resp.json();
  const items: ForecastData[] = json?.data?.forecastsConnection?.nodes ?? [];
  return items[0] ?? null;
}
