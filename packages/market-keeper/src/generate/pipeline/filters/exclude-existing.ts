/**
 * Filter: Exclude markets that already exist in Sapience API
 */

import type { PolymarketMarket } from '../../../types';
import type { Filter, FilterResult } from '../types';
import { fetchWithRetry } from '../../../utils';

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
  conditionGroupId?: number;
  conditionGroupSimilarMarkets?: string[];
}

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

  try {
    const graphqlUrl = apiUrl.replace(/\/+$/, '') + '/graphql';

    const query = `
      query CheckConditions($filters: ConditionFilter!) {
        conditionsConnection(filter: $filters, first: 100) {
          hasMore
          nodes {
            id: conditionId
            endTime
            question
            shortName
            optionName
            description
            similarMarkets
            tags
            similarMarketVolume
            similarMarketImage
            conditionGroup {
              id
              name
              similarMarkets
            }
          }
        }
      }
    `;

    const PAGE_SIZE = 100;
    const chunks: string[][] = [];
    for (let i = 0; i < conditionIds.length; i += PAGE_SIZE) {
      chunks.push(conditionIds.slice(i, i + PAGE_SIZE));
    }
    const existing = new Map<string, ExistingCondition>();
    for (const chunk of chunks) {
      const response = await fetchWithRetry(graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          // visibility: ALL — we want to detect any pre-existing row (public
          // or private) so the pipeline doesn't try to recreate it.
          variables: { filters: { ids: chunk, visibility: 'ALL' } },
        }),
      });

      if (!response.ok) {
        console.warn(`[API] GraphQL query failed: ${response.status}`);
        continue;
      }

      const result = await response.json();
      for (const condition of result.data?.conditionsConnection?.nodes ?? []) {
        existing.set(condition.id, {
          endTime: condition.endTime,
          question: condition.question ?? undefined,
          shortName: condition.shortName ?? undefined,
          optionName: condition.optionName ?? undefined,
          description: condition.description ?? undefined,
          similarMarkets: condition.similarMarkets ?? undefined,
          tags: condition.tags ?? undefined,
          similarMarketVolume: condition.similarMarketVolume ?? undefined,
          similarMarketImage: condition.similarMarketImage ?? undefined,
          groupName: condition.conditionGroup?.name ?? undefined,
          conditionGroupId: condition.conditionGroup?.id ?? undefined,
          conditionGroupSimilarMarkets:
            condition.conditionGroup?.similarMarkets ?? undefined,
        });
      }
    }

    console.log(
      `[API] Found ${existing.size}/${conditionIds.length} conditions already exist`
    );
    return existing;
  } catch (error) {
    console.warn(`[API] Error checking existing conditions: ${error}`);
    return new Map(); // On error, proceed with all markets
  }
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
