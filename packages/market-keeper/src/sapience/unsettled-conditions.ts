/**
 * Conditions that still back unsettled predictions, grouped by resolver.
 *
 * The settle crons historically selected candidates from the condition
 * table's `openInterest` counter (`openInterest > 0 OR attestations`).
 * That counter is a running increment/decrement that drifts — the
 * cleanup cron privates "no engagement" conditions off the same signal —
 * so conditions with real escrow collateral can end up invisible to
 * settlement (openInterest = "0", public = false) and their predictions
 * stay stuck forever. Escrow predictions are the ground truth: walk the
 * unsettled ones and derive the condition set from their pick legs.
 */

import { graphqlUrl, walkConnection, type Connection } from '../utils/graphql';

const UNSETTLED_PREDICTIONS_QUERY = `
  query UnsettledPredictions($first: Int!, $after: String, $filter: PredictionFilter) {
    predictions(first: $first, after: $after, filter: $filter) {
      nodes {
        pickConfig {
          resolved
          picks {
            conditionId
            resolver
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type UnsettledPredictionNode = {
  pickConfig: {
    resolved: boolean;
    picks: Array<{ conditionId: string; resolver: string }>;
  } | null;
};

/**
 * Fetch condition ids that back unsettled predictions, keyed by their
 * (lowercased) resolver address. Predictions whose pick configuration is
 * already resolved are skipped — their settlement is escrow-side (claim),
 * not resolver-side, so there is nothing left to bridge.
 */
export async function fetchConditionIdsWithUnsettledPredictions(
  apiUrl: string
): Promise<Map<string, Set<string>>> {
  const byResolver = new Map<string, Set<string>>();

  await walkConnection<
    UnsettledPredictionNode,
    { predictions: Connection<UnsettledPredictionNode> }
  >({
    graphqlUrl: graphqlUrl(apiUrl),
    query: UNSETTLED_PREDICTIONS_QUERY,
    variables: { filter: { settled: false } },
    label: 'UnsettledPredictions',
    select: (data) => data.predictions,
    onPage: (nodes) => {
      for (const node of nodes) {
        const pickConfig = node.pickConfig;
        if (!pickConfig || pickConfig.resolved) continue;
        for (const pick of pickConfig.picks) {
          const resolver = pick.resolver.toLowerCase();
          let ids = byResolver.get(resolver);
          if (!ids) {
            ids = new Set<string>();
            byResolver.set(resolver, ids);
          }
          ids.add(pick.conditionId.toLowerCase());
        }
      }
    },
  });

  return byResolver;
}
