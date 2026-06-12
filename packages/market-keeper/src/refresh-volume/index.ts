/**
 * Refresh time-bucketed volume for ALL active conditions with Polymarket similar markets
 *
 * Fetches individual trades from the Polymarket Data API, aggregates volume
 * per condition across time windows (1h, 4h, 24h, 7d), and submits updates.
 * Also computes filtered volume excluding trades priced outside [0.01, 0.99].
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
import { submitVolumeUpdates } from '../generate/api';
import { fetchActiveConditionIds } from '../sapience/active-conditions';

// ============ Constants ============

const POLYMARKET_DATA_API = 'https://data-api.polymarket.com';

/** Time windows in seconds */
const TIME_WINDOWS = {
  '1h': 3600,
  '4h': 14400,
  '24h': 86400,
  '7d': 604800,
} as const;

/** Max trades per Data API request.
 *  Docs claim limit=10000 but the API silently caps at 1000.
 *  Max offset is 3000 (returns error above that).
 *  So total reachable = 4000 trades per condition.
 *  See: https://docs.polymarket.com/api-reference/core/get-trades-for-a-user-or-markets */
const TRADES_PAGE_SIZE = 1000;

/** Data API rejects offset > 3000 */
const MAX_OFFSET = 3000;

/** Delay between parallel waves (ms) — avoids rate limiting */
const WAVE_DELAY_MS = 200;

/** Max concurrent Data API requests per wave */
const CONCURRENCY = 10;

/** Price bounds for "filtered" volume — excludes trades where the outcome is
 *  effectively decided (price near 0 or 1). */
const FILTERED_PRICE_MIN = 0.01;
const FILTERED_PRICE_MAX = 0.99;

// ============ CLI Arguments ============

interface RefreshVolumeCLIOptions {
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): RefreshVolumeCLIOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function showHelp(): void {
  console.log(`
Usage: tsx scripts/refresh-volume.ts [options]

Fetches trades from Polymarket Data API for all active conditions, aggregates
volume per time window (1h, 4h, 24h, 7d), and submits updates to Sapience.
Also computes filtered volume excluding extreme-odds trades.

Options:
  --dry-run      Show what would be updated without submitting
  --help, -h     Show this help message

Environment Variables (required for API submission):
  SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests
`);
}

// ============ Polymarket Data API ============

export interface DataApiTrade {
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  transactionHash: string;
}

/**
 * Fetch trades for a single side (BUY or SELL) with cursor-based pagination.
 * Returns its own trade array and whether the offset cap was hit.
 */
async function fetchTradesForSide(
  marketParam: string,
  side: 'BUY' | 'SELL',
  cutoffTimestamp: number
): Promise<{
  trades: DataApiTrade[];
  hitCap: boolean;
  oldestTimestamp: number;
}> {
  const collected: DataApiTrade[] = [];
  const seenHashes = new Set<string>();
  let offset = 0;
  let lastMinTimestamp: number | null = null;
  let batchMinTimestamp = Infinity;

  while (true) {
    const url = `${POLYMARKET_DATA_API}/trades?market=${marketParam}&limit=${TRADES_PAGE_SIZE}&offset=${offset}&side=${side}`;

    const response = await fetchWithRetry(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      logError(
        `[RefreshVolume] Data API request failed (${side}): HTTP ${response.status}`
      );
      break;
    }

    const trades = (await response.json()) as Array<{
      conditionId: string;
      size: number;
      price: number;
      timestamp: number;
      transactionHash: string;
    }>;

    if (trades.length === 0) break;

    let newTradesCount = 0;

    for (const trade of trades) {
      if (trade.timestamp < cutoffTimestamp) continue;

      if (!seenHashes.has(trade.transactionHash)) {
        seenHashes.add(trade.transactionHash);
        collected.push({
          conditionId: trade.conditionId,
          size: trade.size,
          price: trade.price,
          timestamp: trade.timestamp,
          transactionHash: trade.transactionHash,
        });
        newTradesCount++;
      }

      if (trade.timestamp < batchMinTimestamp) {
        batchMinTimestamp = trade.timestamp;
      }
    }

    if (trades.length < TRADES_PAGE_SIZE || newTradesCount === 0) break;
    if (batchMinTimestamp <= cutoffTimestamp) break;

    if (lastMinTimestamp !== null && batchMinTimestamp === lastMinTimestamp) {
      offset += TRADES_PAGE_SIZE;
    } else {
      lastMinTimestamp = batchMinTimestamp;
      offset += TRADES_PAGE_SIZE;
    }

    if (offset >= MAX_OFFSET) {
      return {
        trades: collected,
        hitCap: true,
        oldestTimestamp: batchMinTimestamp,
      };
    }
  }

  return {
    trades: collected,
    hitCap: false,
    oldestTimestamp: batchMinTimestamp,
  };
}

/**
 * Fetch trades for a batch of condition IDs from the Polymarket Data API.
 * Queries BUY and SELL sides separately to double the effective trade cap
 * (4k per side = ~8k total). Deduplicates by transactionHash.
 */
async function fetchTradesForConditions(
  conditionIds: string[],
  cutoffTimestamp: number
): Promise<DataApiTrade[]> {
  const marketParam = conditionIds.join(',');

  // Fetch BUY and SELL in parallel — they're disjoint sets, doubling
  // the effective trade cap from 4k to ~8k per condition.
  const [buyResult, sellResult] = await Promise.all([
    fetchTradesForSide(marketParam, 'BUY', cutoffTimestamp),
    fetchTradesForSide(marketParam, 'SELL', cutoffTimestamp),
  ]);

  // Merge and deduplicate by transactionHash
  const seenHashes = new Set<string>();
  const allTrades: DataApiTrade[] = [];
  for (const trade of [...buyResult.trades, ...sellResult.trades]) {
    if (!seenHashes.has(trade.transactionHash)) {
      seenHashes.add(trade.transactionHash);
      allTrades.push(trade);
    }
  }

  // Log if either side hit the 4k cap
  const worstOldest = Math.max(
    buyResult.oldestTimestamp,
    sellResult.oldestTimestamp
  );
  if (buyResult.hitCap || sellResult.hitCap) {
    const oldestReached =
      worstOldest === Infinity
        ? 'unknown'
        : new Date(worstOldest * 1000).toISOString();
    const fourHoursAgo = Math.floor(Date.now() / 1000) - TIME_WINDOWS['4h'];
    const sides = [
      buyResult.hitCap ? 'BUY' : null,
      sellResult.hitCap ? 'SELL' : null,
    ]
      .filter(Boolean)
      .join('+');

    if (worstOldest > fourHoursAgo) {
      logError(
        `[RefreshVolume] Hit 4k cap (${sides}) for [${conditionIds.join(', ')}] — oldest: ${oldestReached}, does NOT cover last 4h.`
      );
    } else {
      log(
        `[RefreshVolume] Hit 4k cap (${sides}) for [${conditionIds.join(', ')}] — oldest: ${oldestReached}, covers last 4h.`
      );
    }
  }

  return allTrades;
}

// ============ Volume Aggregation ============

export interface ConditionVolume {
  id: string;
  similarMarketVolume1h: number;
  similarMarketVolume4h: number;
  similarMarketVolume24h: number;
  similarMarketVolume7d: number;
  similarMarketVolumeFiltered1h: number;
  similarMarketVolumeFiltered4h: number;
  similarMarketVolumeFiltered24h: number;
  similarMarketVolumeFiltered7d: number;
}

export function compactConditionVolumes(
  volumes: Array<ConditionVolume | undefined>
): ConditionVolume[] {
  return volumes.filter((v): v is ConditionVolume => v !== undefined);
}

/**
 * Aggregate trades into time-bucketed volumes per condition.
 */
export function aggregateVolumes(
  trades: DataApiTrade[],
  conditionIds: string[],
  nowTimestamp: number
): ConditionVolume[] {
  const cutoffs = {
    '1h': nowTimestamp - TIME_WINDOWS['1h'],
    '4h': nowTimestamp - TIME_WINDOWS['4h'],
    '24h': nowTimestamp - TIME_WINDOWS['24h'],
    '7d': nowTimestamp - TIME_WINDOWS['7d'],
  };

  // Initialize accumulators for all conditions (including those with 0 trades)
  const volumeMap = new Map<string, ConditionVolume>();
  for (const id of conditionIds) {
    volumeMap.set(id, {
      id,
      similarMarketVolume1h: 0,
      similarMarketVolume4h: 0,
      similarMarketVolume24h: 0,
      similarMarketVolume7d: 0,
      similarMarketVolumeFiltered1h: 0,
      similarMarketVolumeFiltered4h: 0,
      similarMarketVolumeFiltered24h: 0,
      similarMarketVolumeFiltered7d: 0,
    });
  }

  for (const trade of trades) {
    const vol = volumeMap.get(trade.conditionId);
    if (!vol) continue;

    const size = trade.size;
    const isFilteredPrice =
      trade.price >= FILTERED_PRICE_MIN && trade.price <= FILTERED_PRICE_MAX;

    if (trade.timestamp >= cutoffs['1h']) {
      vol.similarMarketVolume1h += size;
      if (isFilteredPrice) vol.similarMarketVolumeFiltered1h += size;
    }
    if (trade.timestamp >= cutoffs['4h']) {
      vol.similarMarketVolume4h += size;
      if (isFilteredPrice) vol.similarMarketVolumeFiltered4h += size;
    }
    if (trade.timestamp >= cutoffs['24h']) {
      vol.similarMarketVolume24h += size;
      if (isFilteredPrice) vol.similarMarketVolumeFiltered24h += size;
    }
    vol.similarMarketVolume7d += size;
    if (isFilteredPrice) vol.similarMarketVolumeFiltered7d += size;
  }

  return [...volumeMap.values()];
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
    const totalStart = performance.now();

    // 1. Fetch all active Polymarket condition IDs from Sapience
    log('[RefreshVolume] Fetching active conditions from Sapience...');
    const sapienceStart = performance.now();
    const conditionIds = await fetchActiveConditionIds(apiUrl);
    log(
      `[RefreshVolume] Found ${conditionIds.length} active conditions (${((performance.now() - sapienceStart) / 1000).toFixed(1)}s)`
    );

    if (conditionIds.length === 0) {
      log('[RefreshVolume] No active conditions to update');
      return;
    }

    // 2. Fetch trades from Data API per condition (parallel with concurrency limit)
    const nowTimestamp = Math.floor(Date.now() / 1000);
    const cutoff7d = nowTimestamp - TIME_WINDOWS['7d'];
    const allVolumes: Array<ConditionVolume | undefined> = new Array(
      conditionIds.length
    );
    let totalTradesFetched = 0;
    let completed = 0;
    let totalFetchFailures = 0;
    const fetchStart = performance.now();

    // Process conditions in waves of CONCURRENCY
    for (let i = 0; i < conditionIds.length; i += CONCURRENCY) {
      const wave = conditionIds.slice(i, i + CONCURRENCY);
      const waveResults = await Promise.allSettled(
        wave.map(async (conditionId, idx) => {
          const globalIdx = i + idx;
          const start = performance.now();
          const trades = await fetchTradesForConditions(
            [conditionId],
            cutoff7d
          );
          const ms = performance.now() - start;
          const volumes = aggregateVolumes(trades, [conditionId], nowTimestamp);
          return { globalIdx, trades: trades.length, ms, volume: volumes[0] };
        })
      );

      let waveFailed = 0;
      for (const r of waveResults) {
        if (r.status === 'fulfilled') {
          allVolumes[r.value.globalIdx] = r.value.volume;
          totalTradesFetched += r.value.trades;
        } else {
          waveFailed++;
          totalFetchFailures++;
          logError(
            `[RefreshVolume] Condition fetch failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`
          );
        }
        completed++;
      }

      // Log one line per wave
      const fulfilled = waveResults.filter(
        (
          r
        ): r is PromiseFulfilledResult<{
          globalIdx: number;
          trades: number;
          ms: number;
          volume: ConditionVolume;
        }> => r.status === 'fulfilled'
      );
      const waveTradeCount = fulfilled.reduce((s, r) => s + r.value.trades, 0);
      const waveMaxMs =
        fulfilled.length > 0
          ? Math.max(...fulfilled.map((r) => r.value.ms))
          : 0;
      const failedSuffix = waveFailed > 0 ? `, ${waveFailed} failed` : '';
      log(
        `[RefreshVolume]   ${completed}/${conditionIds.length}: ${wave.length} conditions, ${waveTradeCount} trades (${waveMaxMs.toFixed(0)}ms)${failedSuffix}`
      );

      // Brief delay between waves to stay friendly with rate limits
      if (i + CONCURRENCY < conditionIds.length) {
        await new Promise((resolve) => setTimeout(resolve, WAVE_DELAY_MS));
      }
    }

    const successfulVolumes = compactConditionVolumes(allVolumes);
    const fetchSec = ((performance.now() - fetchStart) / 1000).toFixed(1);
    log(
      `[RefreshVolume] Fetched ${totalTradesFetched.toLocaleString()} trades across ${conditionIds.length} conditions (${fetchSec}s)`
    );
    if (totalFetchFailures > 0) {
      logError(
        `[RefreshVolume] Skipping ${totalFetchFailures} failed condition fetch(es); submitting ${successfulVolumes.length} successful update(s)`
      );
    }

    // 3. Dry run: print what would be updated
    if (options.dryRun) {
      log('\n========== DRY RUN: Volume Refresh ==========\n');
      log(`Total conditions: ${conditionIds.length}`);
      log(`Successful updates: ${successfulVolumes.length}`);
      log(`Failed fetches: ${totalFetchFailures}`);

      const withVolume = successfulVolumes.filter(
        (v) => v.similarMarketVolume7d > 0
      );
      log(`Conditions with 7d volume: ${withVolume.length}`);

      for (const v of withVolume.slice(0, 15)) {
        log(
          `  ${v.id} → 1h: $${v.similarMarketVolume1h.toFixed(0)} | 4h: $${v.similarMarketVolume4h.toFixed(0)} | 24h: $${v.similarMarketVolume24h.toFixed(0)} | 7d: $${v.similarMarketVolume7d.toFixed(0)} | filtered7d: $${v.similarMarketVolumeFiltered7d.toFixed(0)}`
        );
      }
      if (withVolume.length > 15) {
        log(`  ... and ${withVolume.length - 15} more`);
      }

      const totalSec = ((performance.now() - totalStart) / 1000).toFixed(1);
      log(`\nTotal runtime: ${totalSec}s`);
      log('\n========== END DRY RUN ==========\n');
      return;
    }

    // 4. Submit volume updates
    if (hasAPICredentials && apiUrl && privateKey) {
      if (successfulVolumes.length === 0) {
        logError(
          '[RefreshVolume] No successful condition fetches; skipping volume submission'
        );
      } else {
        const submitStart = performance.now();
        await submitVolumeUpdates(apiUrl, privateKey, successfulVolumes);
        log(
          `[RefreshVolume] Submitted ${successfulVolumes.length} updates (${((performance.now() - submitStart) / 1000).toFixed(1)}s)`
        );
      }
    }

    const totalSec = ((performance.now() - totalStart) / 1000).toFixed(1);
    log(`[RefreshVolume] Total runtime: ${totalSec}s`);
  } catch (error) {
    logError('Error:', error);
    process.exit(1);
  }
}
