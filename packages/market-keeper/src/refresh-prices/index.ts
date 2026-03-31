/**
 * Refresh prices for ALL active Polymarket conditions in Sapience
 *
 * Fetches all Polymarket condition IDs from the Sapience API,
 * looks up current prices on Polymarket's Gamma API,
 * and submits batch price updates.
 *
 * This covers markets outside the generate/relist windows
 * (e.g., markets ending >21 days from now).
 */

import 'dotenv/config';
import {
  DEFAULT_SAPIENCE_API_URL,
  ALL_POLYMARKET_RESOLVER_ADDRESSES,
} from '../constants';
import {
  validatePrivateKey,
  confirmProductionAccess,
  fetchWithRetry,
  log,
  logError,
} from '../utils';
import { parseYesPrice } from '../utils/price';
import { submitPriceUpdates } from '../generate/api';

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
Usage: tsx scripts/refresh-prices.ts [options]

Fetches all active Polymarket conditions from Sapience, looks up current prices
on Polymarket, and submits batch price updates. Covers markets outside the
generate (0-21 days) and relist (-30-0 days) windows.

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
  let skip = 0;

  while (true) {
    const query = `
      query ActiveConditions($where: ConditionWhereInput!, $take: Int!, $skip: Int!) {
        conditions(where: $where, take: $take, skip: $skip) {
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
            resolver: { in: ALL_POLYMARKET_RESOLVER_ADDRESSES },
          },
          take: PAGE_SIZE,
          skip,
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
      allIds.push(c.id);
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
async function fetchPolymarketPrices(
  conditionIds: string[]
): Promise<Array<{ id: string; estimatedPrice: number }>> {
  const priceUpdates: Array<{ id: string; estimatedPrice: number }> = [];
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
          `[RefreshPrices] Polymarket batch ${i / BATCH_SIZE + 1} failed: HTTP ${response.status}`
        );
        continue;
      }

      const markets = (await response.json()) as Array<{
        conditionId: string;
        outcomePrices?: string | number[];
      }>;

      for (const market of markets) {
        const price = parseYesPrice(market.outcomePrices);
        if (price !== undefined) {
          priceUpdates.push({
            id: market.conditionId,
            estimatedPrice: price,
          });
        }
      }
    } catch (error) {
      logError(
        `[RefreshPrices] Polymarket batch ${i / BATCH_SIZE + 1} error:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return priceUpdates;
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
    log('[RefreshPrices] Fetching active conditions from Sapience...');
    const conditionIds = await fetchActiveConditionIds(apiUrl);
    log(`[RefreshPrices] Found ${conditionIds.length} active conditions`);

    if (conditionIds.length === 0) {
      log('[RefreshPrices] No active conditions to update');
      return;
    }

    // 2. Look up current prices on Polymarket
    log('[RefreshPrices] Fetching prices from Polymarket...');
    const priceUpdates = await fetchPolymarketPrices(conditionIds);
    log(
      `[RefreshPrices] Got prices for ${priceUpdates.length}/${conditionIds.length} conditions`
    );

    if (priceUpdates.length === 0) {
      log('[RefreshPrices] No price updates to submit');
      return;
    }

    // 3. Dry run: print what would be updated
    if (options.dryRun) {
      log('\n========== DRY RUN: Price Refresh ==========\n');
      log(`Total price updates: ${priceUpdates.length}`);
      for (const update of priceUpdates) {
        log(`  ${update.id} → ${(update.estimatedPrice * 100).toFixed(1)}%`);
      }
      log('\n========== END DRY RUN ==========\n');
      return;
    }

    // 4. Submit price updates
    if (hasAPICredentials && apiUrl && privateKey) {
      await submitPriceUpdates(apiUrl, privateKey, priceUpdates);
    }
  } catch (error) {
    logError('Error:', error);
    process.exit(1);
  }
}
