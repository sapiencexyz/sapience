/**
 * Shared "active Polymarket-linked conditions" lookup, used by the
 * refresh-volume and prices-and-1d-7d-volume crons (both previously
 * carried an identical private copy).
 *
 * ConditionFilter has no `similarMarkets isEmpty` equivalent, so the
 * Polymarket-linked cut (`similarMarket.markets` non-empty) happens
 * client-side after fetching every public + unsettled condition.
 */

import { graphqlUrl, walkConnection, type Connection } from '../utils/graphql';

const ACTIVE_CONDITIONS_QUERY = `
  query ActiveConditions($first: Int!, $after: String, $filter: ConditionFilter) {
    conditions(first: $first, after: $after, filter: $filter) {
      nodes {
        conditionId
        similarMarket {
          markets
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type ActiveConditionNode = {
  conditionId: string;
  similarMarket: { markets: string[] } | null;
};

/**
 * Fetch all active (public + unsettled) Polymarket-linked condition IDs.
 * Relay cursor pagination is deterministic server-side (keyset on the
 * orderBy field + id).
 */
export async function fetchActiveConditionIds(
  apiUrl: string
): Promise<string[]> {
  const allIds: string[] = [];
  const seen = new Set<string>();

  await walkConnection<
    ActiveConditionNode,
    { conditions: Connection<ActiveConditionNode> }
  >({
    graphqlUrl: graphqlUrl(apiUrl),
    query: ACTIVE_CONDITIONS_QUERY,
    variables: { filter: { public: true, settled: false } },
    label: 'ActiveConditions',
    select: (data) => data.conditions,
    onPage: (nodes) => {
      for (const node of nodes) {
        if (!node.similarMarket?.markets?.length) continue;
        if (seen.has(node.conditionId)) continue;
        seen.add(node.conditionId);
        allIds.push(node.conditionId);
      }
    },
  });

  return allIds;
}
