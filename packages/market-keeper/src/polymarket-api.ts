/**
 * Shared Polymarket Gamma API helpers for checking market resolution status.
 * Used by both cleanup-polymarket and settle-polymarket scripts.
 */

import { fetchWithRetry } from './utils/fetch';
import { log } from './utils';

const GAMMA_API_URL = 'https://gamma-api.polymarket.com';
const BATCH_SIZE = 50;

interface GammaMarket {
  conditionId: string;
  closed: boolean;
  archived: boolean;
}

export type GammaStatus =
  | 'closed'
  | 'active'
  | 'archived'
  | 'not_found'
  | 'api_error';

export interface GammaResolutionResult {
  /** Per-condition classification from the Gamma API */
  statuses: Map<string, GammaStatus>;
}

/**
 * Batch-query the Polymarket Gamma API to classify conditions into two buckets:
 * - resolved: closed && !archived → trusted without on-chain verification
 * - needsOnChainCheck: everything else → needs on-chain canRequestResolution multicall
 *
 * If both closed and archived are set, archived prevails → goes to on-chain check.
 */
export async function batchCheckGammaResolution(
  conditionIds: string[]
): Promise<GammaResolutionResult> {
  // Normalize to lowercase for consistent matching — Gamma API may return
  // different casing than our DB stores
  const lowerToOriginal = new Map<string, string>();
  for (const id of conditionIds) {
    lowerToOriginal.set(id.toLowerCase(), id);
  }

  // Every condition starts as not_found, gets overwritten by API results
  const statuses = new Map<string, GammaStatus>();
  for (const id of conditionIds) {
    statuses.set(id, 'not_found');
  }

  for (let i = 0; i < conditionIds.length; i += BATCH_SIZE) {
    const batch = conditionIds.slice(i, i + BATCH_SIZE);
    const params = batch.map((id) => `condition_ids=${id}`).join('&');
    const url = `${GAMMA_API_URL}/markets?${params}&limit=100`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        log(
          `[Gamma API] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: HTTP ${response.status} — marking ${batch.length} conditions as api_error`
        );
        for (const id of batch) {
          statuses.set(id, 'api_error');
        }
        continue;
      }

      const markets = (await response.json()) as GammaMarket[];

      for (const market of markets) {
        if (!market.conditionId) continue;

        const originalId = lowerToOriginal.get(
          market.conditionId.toLowerCase()
        );
        if (!originalId) continue;

        const current = statuses.get(originalId);

        // Priority: closed > archived > active (don't downgrade)
        if (market.closed && !market.archived) {
          statuses.set(originalId, 'closed');
        } else if (market.archived) {
          if (current !== 'closed') {
            statuses.set(originalId, 'archived');
          }
        } else {
          if (current === 'not_found') {
            statuses.set(originalId, 'active');
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(
        `[Gamma API] Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${msg} — marking ${batch.length} conditions as api_error`
      );
      for (const id of batch) {
        if (statuses.get(id) === 'not_found') {
          statuses.set(id, 'api_error');
        }
      }
    }
  }

  // Summary counts
  const counts = {
    closed: 0,
    active: 0,
    archived: 0,
    not_found: 0,
    api_error: 0,
  };
  for (const status of statuses.values()) {
    counts[status]++;
  }

  log(
    `[Gamma API] Results: ${counts.closed} closed, ${counts.active} active, ${counts.archived} archived, ${counts.not_found} not found, ${counts.api_error} api errors (${conditionIds.length} total)`
  );

  return { statuses };
}
