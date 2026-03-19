// Forecast data types, queries, and fetch helpers.
// Shared across SSR pages, client components, and OG image routes.

import { getGraphQLEndpoint } from './graphql';

export const ATTESTATION_BY_UID_QUERY = `
  query FindAttestationByUid($where: AttestationWhereInput!) {
    attestations(where: $where, take: 1) {
      id
      uid
      attester
      time
      prediction
      comment
      conditionId
      condition {
        id
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
`;

export interface AttestationCondition {
  id: string;
  question: string;
  shortName?: string | null;
  endTime?: number | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  resolver?: string | null;
  category?: { slug: string } | null;
}

export interface AttestationData {
  id: number;
  uid: string;
  attester: string;
  time: number;
  prediction: string;
  comment?: string | null;
  conditionId?: string | null;
  condition?: AttestationCondition | null;
}

// Convert D18 prediction value to percentage (0-100)
export function d18ToPercentage(d18Value: string): number {
  const value = BigInt(d18Value);
  return Number(value) / 1e18;
}

// Fetch attestation by uid from GraphQL API.
// Returns null if the attestation doesn't exist.
// Throws on network/parse errors so callers can distinguish failure from not-found.
export async function fetchAttestationByUid(
  uid: string
): Promise<AttestationData | null> {
  const endpoint = getGraphQLEndpoint();
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: ATTESTATION_BY_UID_QUERY,
      variables: {
        where: { uid: { equals: uid } },
      },
    }),
  });
  if (!resp.ok) return null;
  const json = await resp.json();
  const attestations: AttestationData[] = json?.data?.attestations ?? [];
  return attestations[0] ?? null;
}
