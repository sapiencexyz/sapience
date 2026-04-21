/**
 * Refresh prices and volume for ALL active conditions with Polymarket similar markets
 *
 * Fetches all condition IDs that have similarMarkets URLs from the Sapience API,
 * looks up current prices and volume on Polymarket's Gamma API,
 * and submits batch price + volume updates.
 *
 * This covers markets outside the generate/relist windows
 * (e.g., markets ending >21 days from now).
 */

import 'dotenv/config';
import { DEFAULT_SAPIENCE_API_URL } from '../constants';
import {
  validatePrivateKey,
  confirmProductionAccess,
  fetchWithRetry,
  log,
  logError,
} from '../utils';
import { parseYesPrice } from '../utils/price';
import { submitPriceUpdates, submitVolumeUpdates } from '../generate/api';

// ============ CLI Arguments ============

interface RefreshPricesCLIOptions {
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): RefreshPricesCLIOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function showHelp(): void {
  console.log(`
Usage: tsx scripts/prices-and-1d-7d-volume.ts [options]

Fetches all active Polymarket conditions from Sapience, looks up current prices
and 24h/7d volume on Polymarket's Gamma API, and submits batch updates.

Options:
  --dry-run      Show what would be updated without submitting
  --help, -h     Show this help message

Environment Variables (required for API submission):
  SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests
`);
}

// ============ Sapience API ============

/**
 * Fetch all active Polymarket condition IDs from Sapience via GraphQL.
 * Only fetches unsettled conditions (no outcomeIndex set).
 */
async function fetchActiveConditionIds(apiUrl: string): Promise<string[]> {
  const graphqlUrl = apiUrl.replace(/\/+$/, '') + '/graphql';

  const PAGE_SIZE = 100;
  const allIds: string[] = [];
  const seen = new Set<string>();
  let skip = 0;

  while (true) {
    // orderBy id ensures deterministic pagination — without it, conditions
    // sharing the same timestamp can shift between pages, causing missed or
    // duplicate results (see commit 31c216402).
    const query = `
      query ActiveConditions($where: ConditionWhereInput!, $take: Int!, $skip: Int!, $orderBy: [ConditionOrderByWithRelationInput!]) {
        conditions(where: $where, take: $take, skip: $skip, orderBy: $orderBy) {
          id
        }
      }
    `;

    const response = await fetchWithRetry(graphqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {
          where: {
            settled: { equals: false },
            public: { equals: true },
            similarMarkets: { isEmpty: false },
          },
          take: PAGE_SIZE,
          skip,
          orderBy: [{ id: 'asc' }],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `GraphQL query failed: HTTP ${response.status} ${response.statusText}`
      );
    }

    const result = (await response.json()) as {
      data?: { conditions?: Array<{ id: string }> };
    };
    const conditions = result.data?.conditions ?? [];

    for (const c of conditions) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        allIds.push(c.id);
      }
    }

    if (conditions.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return allIds;
}

// ============ Polymarket API ============

/**
 * Look up current prices for a batch of condition IDs on Polymarket.
 * Uses the Gamma API's condition_id filter.
 */
interface PriceUpdate {
  id: string;
  estimatedPrice: number;
  similarMarketVolume?: number;
  similarMarketImage?: string;
}

interface VolumeUpdate {
  id: string;
  similarMarketVolume24h: number;
  similarMarketVolume7d: number;
}

interface PolymarketFetchResult {
  priceUpdates: PriceUpdate[];
  volumeUpdates: VolumeUpdate[];
}

async function fetchPolymarketPrices(
  conditionIds: string[]
): Promise<PolymarketFetchResult> {
  const priceUpdates: PriceUpdate[] = [];
  const volumeUpdates: VolumeUpdate[] = [];
  const BATCH_SIZE = 50; // Polymarket API query string limit

  for (let i = 0; i < conditionIds.length; i += BATCH_SIZE) {
    const batch = conditionIds.slice(i, i + BATCH_SIZE);

    // Query Polymarket for these condition IDs
    const url = `https://gamma-api.polymarket.com/markets?${batch.map((id) => `condition_ids=${id}`).join('&')}&limit=${BATCH_SIZE}`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        logError(
          `[Prices+Volume] Polymarket batch ${i / BATCH_SIZE + 1} failed: HTTP ${response.status}`
        );
        continue;
      }

      const markets = (await response.json()) as Array<{
        conditionId: string;
        outcomePrices?: string | number[];
        volume?: string;
        volume24hr?: number;
        volume1wk?: number;
        image?: string;
      }>;

      for (const market of markets) {
        const price = parseYesPrice(market.outcomePrices);
        if (price !== undefined) {
          priceUpdates.push({
            id: market.conditionId,
            estimatedPrice: price,
            similarMarketVolume: parseFloat(market.volume || '0') || 0,
            similarMarketImage: market.image,
          });

          // Gamma API provides pre-computed 24h and 7d volume.
          // These are written first; refresh-volume runs after and overwrites
          // with more accurate trade-based values (see start.js ordering).
          const v24h = market.volume24hr ?? 0;
          const v7d = market.volume1wk ?? 0;
          if (v24h > 0 || v7d > 0) {
            volumeUpdates.push({
              id: market.conditionId,
              similarMarketVolume24h: v24h,
              similarMarketVolume7d: v7d,
            });
          }
        }
      }
    } catch (error) {
      logError(
        `[Prices+Volume] Polymarket batch ${i / BATCH_SIZE + 1} error:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return { priceUpdates, volumeUpdates };
}

// ============ Main ============

export async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const apiUrl = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;
  const rawPrivateKey = process.env.ADMIN_PRIVATE_KEY;

  let privateKey: `0x${string}` | undefined;
  try {
    privateKey = validatePrivateKey(rawPrivateKey);
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const hasAPICredentials = apiUrl && privateKey;

  if (hasAPICredentials && !options.dryRun) {
    await confirmProductionAccess(apiUrl);
  }

  try {
    // 1. Fetch all active Polymarket condition IDs from Sapience
    log('[Prices+Volume] Fetching active conditions from Sapience...');
    const conditionIds = await fetchActiveConditionIds(apiUrl);
    log(`[Prices+Volume] Found ${conditionIds.length} active conditions`);

    if (conditionIds.length === 0) {
      log('[Prices+Volume] No active conditions to update');
      return;
    }

    // 2. Look up current prices + time-bucketed volume on Polymarket
    log('[Prices+Volume] Fetching prices from Polymarket...');
    const { priceUpdates, volumeUpdates } =
      await fetchPolymarketPrices(conditionIds);
    log(
      `[Prices+Volume] Got prices for ${priceUpdates.length}/${conditionIds.length} conditions, ${volumeUpdates.length} volume updates`
    );

    if (priceUpdates.length === 0) {
      log('[Prices+Volume] No price updates to submit');
      return;
    }

    // 3. Dry run: print what would be updated
    if (options.dryRun) {
      log('\n========== DRY RUN: Price Refresh ==========\n');
      log(`Total price updates: ${priceUpdates.length}`);
      for (const update of priceUpdates) {
        log(
          `  ${update.id} → ${(update.estimatedPrice * 100).toFixed(1)}% (vol: $${(update.similarMarketVolume ?? 0).toLocaleString()})`
        );
      }
      if (volumeUpdates.length > 0) {
        log(`\nVolume updates (24h/7d from Gamma): ${volumeUpdates.length}`);
        for (const v of volumeUpdates.slice(0, 10)) {
          log(
            `  ${v.id} → 24h: $${v.similarMarketVolume24h.toLocaleString()}, 7d: $${v.similarMarketVolume7d.toLocaleString()}`
          );
        }
        if (volumeUpdates.length > 10) {
          log(`  ... and ${volumeUpdates.length - 10} more`);
        }
      }
      log('\n========== END DRY RUN ==========\n');
      return;
    }

    // 4. Submit price updates + volume updates
    if (hasAPICredentials && apiUrl && privateKey) {
      await submitPriceUpdates(apiUrl, privateKey, priceUpdates);

      if (volumeUpdates.length > 0) {
        await submitVolumeUpdates(apiUrl, privateKey, volumeUpdates);
      }
    }
  } catch (error) {
    logError('Error:', error);
    process.exit(1);
  }
}
