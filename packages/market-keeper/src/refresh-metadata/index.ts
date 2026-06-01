/**
 * Refresh metadata (similarMarkets, tags, question, description, etc.) for
 * every public + unsettled Sapience condition by re-fetching its market
 * from Polymarket Gamma.
 *
 * Solves the coverage gap where the generate cron only refreshes metadata
 * for markets in the ending-soonest fetch window. Anything that's still
 * public + unsettled but past that window goes stale, including the
 * `similarMarkets` URL fragment used by downstream consumers to look up
 * the canonical Polymarket slug.
 */

import 'dotenv/config';
import { DEFAULT_SAPIENCE_API_URL } from '../constants';
import {
  validatePrivateKey,
  confirmProductionAccess,
  log,
  logError,
} from '../utils';
import {
  computeMetadataUpdates,
  computeGroupMetadataUpdates,
} from '../generate/grouping';
import {
  submitMetadataUpdates,
  submitGroupMetadataUpdates,
} from '../generate/api';
import type { PolymarketMarket } from '../types';
import {
  fetchAllExistingConditions,
  fetchMarketsByConditionIds,
  fetchEventTagsByIds,
} from './fetch';

interface RefreshMetadataCLIOptions {
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): RefreshMetadataCLIOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function showHelp(): void {
  console.log(`
Usage: tsx scripts/refresh-metadata.ts [options]

Walks every public + unsettled Sapience condition, re-fetches its market from
Polymarket Gamma, and submits metadata updates for any drifted Polymarket-owned
field (similarMarkets, tags, question, description, etc.). Settled / private
conditions are not touched.

Options:
  --dry-run      Show what would be updated without submitting
  --help, -h     Show this help message

Environment Variables (required for API submission):
  SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests
`);
}

/**
 * Synthesize the `groups[]` argument shape that computeMetadataUpdates and
 * computeGroupMetadataUpdates expect. Each market becomes its own one-market
 * group keyed off its parent event — same shape groupMarkets() builds in
 * the generate path.
 */
function synthesizeGroups(markets: PolymarketMarket[]): Array<{
  title: string;
  markets: PolymarketMarket[];
  eventSlug?: string;
}> {
  return markets.map((market) => ({
    title: market.events?.[0]?.title ?? '',
    markets: [market],
    eventSlug: market.events?.[0]?.slug,
  }));
}

/**
 * Print dry-run output in the same format generate's old metadata dry-run
 * used (so existing operator muscle memory carries over).
 */
function printDryRun(
  metadataUpdates: ReturnType<typeof computeMetadataUpdates>,
  groupMetadataUpdates: ReturnType<typeof computeGroupMetadataUpdates>
): void {
  log('\n========== DRY RUN: Metadata Refresh ==========\n');
  if (metadataUpdates.length > 0) {
    log(
      `Would update metadata for ${metadataUpdates.length} existing conditions:`
    );
    for (const u of metadataUpdates) {
      const changedKeys = Object.keys(u.fields);
      log(`  ${u.conditionId.slice(0, 10)}... → ${changedKeys.join(', ')}`);
      const oldRec = u.old as Record<string, unknown>;
      const newRec = u.fields as Record<string, unknown>;
      for (const key of changedKeys) {
        log(
          `    ${key}: ${JSON.stringify(oldRec[key])} → ${JSON.stringify(newRec[key])}`
        );
      }
    }
  } else {
    log('No condition metadata drift.');
  }
  if (groupMetadataUpdates.length > 0) {
    log(
      `\nWould update metadata for ${groupMetadataUpdates.length} existing condition groups:`
    );
    for (const u of groupMetadataUpdates) {
      const changedKeys = Object.keys(u.fields);
      log(`  group ${u.groupId} → ${changedKeys.join(', ')}`);
      const oldRec = u.old as Record<string, unknown>;
      const newRec = u.fields as Record<string, unknown>;
      for (const key of changedKeys) {
        log(
          `    ${key}: ${JSON.stringify(oldRec[key])} → ${JSON.stringify(newRec[key])}`
        );
      }
    }
  } else {
    log('No group metadata drift.');
  }
  log('\n========== END DRY RUN ==========\n');
}

export async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const apiUrl = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;
  const rawPrivateKey = process.env.ADMIN_PRIVATE_KEY;

  // The key only signs *submitted* admin requests. --dry-run never
  // submits, so don't make a missing key block a safe local preview.
  let privateKey: `0x${string}` | undefined;
  try {
    privateKey = validatePrivateKey(rawPrivateKey);
  } catch (error) {
    if (options.dryRun) {
      log(
        '[RefreshMetadata] No ADMIN_PRIVATE_KEY available; continuing in dry-run mode only.'
      );
    } else {
      logError(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  const hasAPICredentials = apiUrl && privateKey;

  if (hasAPICredentials && !options.dryRun) {
    await confirmProductionAccess(apiUrl);
  }

  try {
    const totalStart = performance.now();

    log(
      '[RefreshMetadata] Fetching public + unsettled conditions from Sapience...'
    );
    const sapienceStart = performance.now();
    const existing = await fetchAllExistingConditions(apiUrl);
    log(
      `[RefreshMetadata] Found ${existing.size} conditions (${((performance.now() - sapienceStart) / 1000).toFixed(1)}s)`
    );

    if (existing.size === 0) {
      log('[RefreshMetadata] No conditions to refresh');
      return;
    }

    const conditionIds = [...existing.keys()];

    log(
      `[RefreshMetadata] Fetching ${conditionIds.length} markets from Polymarket Gamma...`
    );
    const gammaStart = performance.now();
    const marketMap = await fetchMarketsByConditionIds(conditionIds);
    log(
      `[RefreshMetadata] Got ${marketMap.size}/${conditionIds.length} markets back (${((performance.now() - gammaStart) / 1000).toFixed(1)}s)`
    );

    const markets = [...marketMap.values()];
    const missing = conditionIds.length - marketMap.size;
    if (missing > 0) {
      log(
        `[RefreshMetadata] ${missing} conditions had no Gamma response (delisted or condition_id unknown) — leaving stored values alone`
      );
    }

    if (markets.length === 0) {
      log('[RefreshMetadata] No markets returned by Gamma; nothing to diff');
      return;
    }

    // Build the inputs computeMetadataUpdates / computeGroupMetadataUpdates
    // already expect — so we get exactly the same diff semantics that the
    // generate path used for the ending-soonest cohort.
    const groups = synthesizeGroups(markets);

    // Targeted tag fetch: batch /events?id=<a>&id=<b>... for only the events
    // we actually need (one per market), 50 IDs per request, parallelized.
    // Avoids the 50k-event date-window walk that fetchEventTags does in
    // generate. Map is keyed by event SLUG to match what computeMetadataUpdates
    // looks up.
    const eventIds = markets
      .map((m) => m.events?.[0]?.id)
      .filter((id): id is string => !!id);
    log(
      `[RefreshMetadata] Fetching event tags for ${new Set(eventIds).size} unique event IDs...`
    );
    const tagsStart = performance.now();
    const eventTagMap = await fetchEventTagsByIds(eventIds);
    log(
      `[RefreshMetadata] Got ${eventTagMap.size} event tag mappings (${((performance.now() - tagsStart) / 1000).toFixed(1)}s)`
    );

    log('[RefreshMetadata] Computing diffs...');
    const diffStart = performance.now();
    const metadataUpdates = computeMetadataUpdates(
      markets,
      groups,
      existing,
      eventTagMap
    );
    const groupMetadataUpdates = computeGroupMetadataUpdates(groups, existing);
    log(
      `[RefreshMetadata] Diff complete: ${metadataUpdates.length} condition updates, ${groupMetadataUpdates.length} group updates (${((performance.now() - diffStart) / 1000).toFixed(1)}s)`
    );

    if (options.dryRun) {
      printDryRun(metadataUpdates, groupMetadataUpdates);
      const totalSec = ((performance.now() - totalStart) / 1000).toFixed(1);
      log(`[RefreshMetadata] Total runtime: ${totalSec}s`);
      return;
    }

    if (hasAPICredentials && apiUrl && privateKey) {
      if (metadataUpdates.length > 0) {
        await submitMetadataUpdates(apiUrl, privateKey, metadataUpdates);
      } else {
        log('[RefreshMetadata] No condition metadata drift; skipping submit');
      }
      if (groupMetadataUpdates.length > 0) {
        await submitGroupMetadataUpdates(
          apiUrl,
          privateKey,
          groupMetadataUpdates
        );
      } else {
        log('[RefreshMetadata] No group metadata drift; skipping submit');
      }
    }

    const totalSec = ((performance.now() - totalStart) / 1000).toFixed(1);
    log(`[RefreshMetadata] Total runtime: ${totalSec}s`);
  } catch (error) {
    logError('Error:', error);
    process.exit(1);
  }
}
