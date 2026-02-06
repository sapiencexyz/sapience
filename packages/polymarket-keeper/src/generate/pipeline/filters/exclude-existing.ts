/**
 * Filter: Exclude markets that already exist in Sapience API
 */

import type { PolymarketMarket } from '../../../types';
import type { Filter, FilterResult } from '../types';
import { fetchWithRetry } from '../../../utils';

/**
 * Check which condition IDs already exist in Sapience API
 * Uses GraphQL to batch query by condition IDs
 */
export async function checkExistingConditions(
  apiUrl: string,
  conditionIds: string[]
): Promise<Set<string>> {
  if (conditionIds.length === 0) {
    return new Set();
  }

  try {
    const graphqlUrl = apiUrl.replace(/\/+$/, '') + '/graphql';

    const query = `
      query CheckConditions($ids: [String!]!) {
        conditions(where: { id: { in: $ids } }) {
          id
        }
      }
    `;

    const response = await fetchWithRetry(graphqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { ids: conditionIds },
      }),
    });

    if (!response.ok) {
      console.warn(`[API] GraphQL query failed: ${response.status}`);
      return new Set();
    }

    const result = await response.json();
    const existingIds = new Set<string>();

    if (result.data?.conditions) {
      for (const condition of result.data.conditions) {
        existingIds.add(condition.id);
      }
    }

    console.log(`[API] Found ${existingIds.size}/${conditionIds.length} conditions already exist`);
    return existingIds;
  } catch (error) {
    console.warn(`[API] Error checking existing conditions: ${error}`);
    return new Set(); // On error, proceed with all markets
  }
}

/**
 * Filter out markets that already exist in Sapience API
 * Must be constructed with pre-fetched existing IDs (since filters are sync)
 */
export class ExcludeExistingMarketsFilter implements Filter<PolymarketMarket> {
  name = 'exclude-existing';
  description = 'Skip markets already in Sapience';

  constructor(private existingIds: Set<string>) {}

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
