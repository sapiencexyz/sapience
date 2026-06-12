/**
 * Filter: Exclude markets that already exist in Sapience API
 */

import type { PolymarketMarket } from '../../../types';
import type { Filter, FilterResult } from '../types';
import { graphqlRequest, graphqlUrl } from '../../../utils/graphql';

export interface ExistingCondition {
  endTime: number;
  question?: string;
  shortName?: string;
  optionName?: string;
  description?: string;
  similarMarkets?: string[];
  tags?: string[];
  similarMarketVolume?: number;
  similarMarketImage?: string;
  groupName?: string;
  /**
   * Polymarket event id of the group this condition currently belongs to,
   * fetched as `conditionGroup.externalEventId` via GraphQL. Drives the
   * diff against the fresh Polymarket value: when they disagree, the
   * keeper emits a batch-metadata update carrying the new externalEventId,
   * which the admin route uses to re-route the condition to the correct
   * group via the canonical (source, externalEventId) lookup.
   */
  externalEventId?: string;
  conditionGroupId?: number;
  conditionGroupSimilarMarkets?: string[];
  // Only ConditionGroup.negRisk is exposed via GraphQL; the per-condition
  // negRisk/negRiskMarketId pair and ConditionGroup.negRiskMarketId stay in
  // the DB but are admin-only via REST, so the keeper can't drift-detect
  // them.
  conditionGroupNegRisk?: boolean;
}

const CHECK_CONDITIONS_QUERY = `
  query CheckConditions($first: Int!, $filter: ConditionFilter!) {
    conditions(first: $first, filter: $filter) {
      nodes {
        conditionId
        endTime
        question
        shortName
        optionName
        description
        tags
        similarMarket {
          markets
          image
          volume
        }
        conditionGroup {
          groupId
          name
          similarMarkets
          negRisk
        }
      }
    }
  }
`;

type CheckConditionNode = {
  conditionId: string;
  endTime: number;
  question?: string | null;
  shortName?: string | null;
  optionName?: string | null;
  description?: string | null;
  tags?: string[] | null;
  similarMarket?: {
    markets?: string[] | null;
    image?: string | null;
    volume?: number | null;
  } | null;
  conditionGroup?: {
    groupId?: number | null;
    name?: string | null;
    similarMarkets?: string[] | null;
    negRisk?: boolean | null;
  } | null;
};

/**
 * Check which condition IDs already exist in Sapience API
 * Uses GraphQL to batch query by condition IDs
 * Returns a Map of conditionId → { endTime }
 */
export async function checkExistingConditions(
  apiUrl: string,
  conditionIds: string[]
): Promise<Map<string, ExistingCondition>> {
  if (conditionIds.length === 0) {
    return new Map();
  }

  const url = graphqlUrl(apiUrl);
  const PAGE_SIZE = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < conditionIds.length; i += PAGE_SIZE) {
    chunks.push(conditionIds.slice(i, i + PAGE_SIZE));
  }
  const existing = new Map<string, ExistingCondition>();

  for (const chunk of chunks) {
    // Public and private rows both count as pre-existing, so the pipeline
    // doesn't try to recreate them. Omitting `public` defaults listing
    // surfaces to public-only, so each chunk queries the two sides
    // explicitly. Per-chunk failures skip just that chunk (warn, continue).
    try {
      for (const isPublic of [true, false]) {
        const data = await graphqlRequest<{
          conditions: { nodes: CheckConditionNode[] };
        }>(
          url,
          CHECK_CONDITIONS_QUERY,
          {
            first: PAGE_SIZE,
            filter: { conditionIds: chunk, public: isPublic },
          },
          'CheckConditions'
        );
        for (const condition of data.conditions.nodes) {
          existing.set(condition.conditionId, {
            endTime: condition.endTime,
            question: condition.question ?? undefined,
            shortName: condition.shortName ?? undefined,
            optionName: condition.optionName ?? undefined,
            description: condition.description ?? undefined,
            similarMarkets: condition.similarMarket?.markets ?? undefined,
            tags: condition.tags ?? undefined,
            similarMarketVolume: condition.similarMarket?.volume ?? undefined,
            similarMarketImage: condition.similarMarket?.image ?? undefined,
            groupName: condition.conditionGroup?.name ?? undefined,
            conditionGroupId: condition.conditionGroup?.groupId ?? undefined,
            conditionGroupSimilarMarkets:
              condition.conditionGroup?.similarMarkets ?? undefined,
            conditionGroupNegRisk:
              condition.conditionGroup?.negRisk ?? undefined,
          });
        }
      }
    } catch (error) {
      console.warn(`[API] Error checking existing conditions: ${error}`);
    }
  }

  console.log(
    `[API] Found ${existing.size}/${conditionIds.length} conditions already exist`
  );
  return existing;
}

/**
 * Filter out markets that already exist in Sapience API
 * Must be constructed with pre-fetched existing IDs (since filters are sync)
 */
export class ExcludeExistingMarketsFilter implements Filter<PolymarketMarket> {
  name = 'exclude-existing';
  description = 'Skip markets already in Sapience';
  private existingIds: Set<string>;

  constructor(existing: Set<string> | Map<string, ExistingCondition>) {
    this.existingIds =
      existing instanceof Set ? existing : new Set(existing.keys());
  }

  apply(markets: PolymarketMarket[]): FilterResult<PolymarketMarket> {
    const kept: PolymarketMarket[] = [];
    const removed: PolymarketMarket[] = [];

    for (const market of markets) {
      if (this.existingIds.has(market.conditionId)) {
        removed.push(market);
      } else {
        kept.push(market);
      }
    }

    return { kept, removed };
  }
}
