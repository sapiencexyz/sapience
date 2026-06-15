// Forecast data types, queries, and fetch helpers.
// Shared across SSR pages, client components, and OG image routes.

import { getGraphQLEndpointV2 } from './graphql';

// v2 document — untagged so graphql-eslint (v1 schema) skips it.
// `forecast(uid:)` is the v2 lookup for an EAS forecast attestation; the
// condition relation re-keys `id` to the on-chain conditionId hash (numeric
// Prisma row ids are not exposed in v2).
export const FORECAST_BY_UID_QUERY = `
  query ForecastByUid($uid: String!) {
    forecast(uid: $uid) {
      uid
      attester
      attestedAt
      value
      comment
      conditionId
      condition {
        id: conditionId
        question
        shortName
        endTime
        settled
        resolvedToYes
        nonDecisive
        resolver
        category {
          slug
        }
      }
    }
  }
`;

export interface AttestationCondition {
  /** On-chain conditionId hash (aliased from `conditionId` in the query). */
  id: string;
  question: string;
  shortName?: string | null;
  endTime?: number | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
  resolver?: string | null;
  category?: { slug: string } | null;
}

// Stable consumer shape (/forecast/<uid> SSR + OG route). Field names keep
// the v1 vocabulary (`time`, `prediction`) — the v2 renames are undone in
// `toAttestationData` so consumers stay unchanged. The numeric attestation
// row id is gone; `uid` is the public domain id.
export interface AttestationData {
  uid: string;
  attester: string;
  time: number;
  prediction: string;
  comment?: string | null;
  conditionId?: string | null;
  condition?: AttestationCondition | null;
}

/** Wire shape of the v2 `forecast(uid:)` node selected above. */
interface ForecastByUidNode {
  uid: string;
  attester: string;
  attestedAt: number;
  value: string;
  comment?: string | null;
  conditionId?: string | null;
  condition?: AttestationCondition | null;
}

function toAttestationData(node: ForecastByUidNode): AttestationData {
  return {
    uid: node.uid,
    attester: node.attester,
    time: node.attestedAt,
    prediction: node.value,
    comment: node.comment ?? null,
    conditionId: node.conditionId ?? null,
    condition: node.condition ?? null,
  };
}

// Convert D18 prediction value to percentage (0-100)
export function d18ToPercentage(d18Value: string): number {
  const value = BigInt(d18Value);
  return Number(value) / 1e18;
}

// Fetch a forecast attestation by uid from the v2 GraphQL API.
// Returns null if the forecast doesn't exist.
// Throws on network/parse errors so callers can distinguish failure from not-found.
export async function fetchAttestationByUid(
  uid: string
): Promise<AttestationData | null> {
  const endpoint = getGraphQLEndpointV2();
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: FORECAST_BY_UID_QUERY,
      variables: { uid },
    }),
  });
  if (!resp.ok) return null;
  const json = await resp.json();
  const forecast: ForecastByUidNode | null = json?.data?.forecast ?? null;
  return forecast ? toAttestationData(forecast) : null;
}
