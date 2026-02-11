/**
 * One-off script to backfill similarMarkets for conditionGroups
 *
 * For each group with empty similarMarkets, fetches the event slug from Polymarket API
 * using the first condition's conditionId, and creates the similarMarkets URL.
 *
 * Usage:
 *   npx tsx backfill-similar-markets.ts --dry-run
 *   npx tsx backfill-similar-markets.ts --execute
 */

import 'dotenv/config';
import { getAdminAuthHeaders, validatePrivateKey, confirmProductionAccess } from '../src/utils';
import { fetchWithRetry } from '../src/utils/fetch';
import { DEFAULT_SAPIENCE_API_URL } from '../src/constants';

const SAPIENCE_API_URL = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;

interface Condition {
  id: string;
}

interface ConditionGroup {
  id: number;
  name: string;
  similarMarkets: string[];
  condition: Condition[];
}

interface PolymarketMarket {
  conditionId: string;
  slug: string;
  events?: Array<{ slug?: string }>;
}

interface CLIOptions {
  dryRun: boolean;
  execute: boolean;
  help: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);

  const hasArg = (name: string): boolean =>
    args.includes(`--${name}`) || args.some(a => a.startsWith(`--${name}=`));

  return {
    dryRun: hasArg('dry-run') || !hasArg('execute'),
    execute: hasArg('execute'),
    help: hasArg('help') || hasArg('h'),
  };
}

function showHelp(): void {
  console.log(`
Usage: npx tsx backfill-similar-markets.ts [options]

Backfills similarMarkets for conditionGroups by fetching event slugs from Polymarket API.

Options:
  --dry-run      Show what would be updated without making changes (default)
  --execute      Actually update the groups
  --help, -h     Show this help message

Environment Variables:
  SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests
`);
}

async function fetchAllGroups(
  apiUrl: string,
  privateKey: `0x${string}`
): Promise<ConditionGroup[]> {
  const authHeaders = await getAdminAuthHeaders(privateKey);

  const response = await fetchWithRetry(`${apiUrl}/admin/conditionGroups`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch groups: HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchMarketFromGammaApi(conditionId: string): Promise<PolymarketMarket | null> {
  try {
    const url = `https://gamma-api.polymarket.com/markets?condition_ids=${conditionId}`;
    const response = await fetchWithRetry(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    const markets: PolymarketMarket[] = await response.json();
    return markets[0] || null;
  } catch {
    return null;
  }
}

async function fetchMarketFromClobApi(conditionId: string): Promise<PolymarketMarket | null> {
  try {
    const url = `https://clob.polymarket.com/markets/${conditionId}`;
    const response = await fetchWithRetry(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    const market = await response.json();
    // CLOB API returns a single market object, not an array
    // Map CLOB fields to our expected structure
    return {
      conditionId: market.condition_id || conditionId,
      slug: market.market_slug || '',
      events: market.event_slug ? [{ slug: market.event_slug }] : undefined,
    };
  } catch {
    return null;
  }
}

async function fetchMarketByConditionId(conditionId: string): Promise<PolymarketMarket | null> {
  // Try Gamma API first
  const gammaResult = await fetchMarketFromGammaApi(conditionId);
  if (gammaResult) {
    return gammaResult;
  }

  // Fallback to CLOB API
  const clobResult = await fetchMarketFromClobApi(conditionId);
  if (clobResult) {
    return clobResult;
  }

  return null;
}

async function updateGroupSimilarMarkets(
  apiUrl: string,
  privateKey: `0x${string}`,
  groupId: number,
  groupName: string,
  similarMarkets: string[]
): Promise<boolean> {
  try {
    const authHeaders = await getAdminAuthHeaders(privateKey);

    const response = await fetchWithRetry(`${apiUrl}/admin/conditionGroups/${groupId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ similarMarkets }),
    });

    if (response.ok) {
      console.log(`[OK] Updated "${groupName}" (id: ${groupId}) with ${similarMarkets.length} similar markets`);
      return true;
    }

    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    console.error(`[FAIL] Update failed for "${groupName}": HTTP ${response.status}: ${errorData.message || response.statusText}`);
    return false;
  } catch (error) {
    console.error(`[FAIL] Update error for "${groupName}": ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const privateKey = validatePrivateKey(process.env.ADMIN_PRIVATE_KEY);
  if (!privateKey) {
    console.error('Error: ADMIN_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  console.log(`API: ${SAPIENCE_API_URL}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log('');

  // Confirm production access if pointing to production without NODE_ENV=production
  await confirmProductionAccess(SAPIENCE_API_URL);

  // Fetch all groups with their conditions
  console.log('Fetching all condition groups...');
  const groups = await fetchAllGroups(SAPIENCE_API_URL, privateKey);
  console.log(`Found ${groups.length} groups`);
  console.log('');

  // Find groups that need backfilling (empty similarMarkets with at least one condition)
  const groupsToProcess = groups.filter(
    g => (!g.similarMarkets || g.similarMarkets.length === 0) &&
         g.condition && g.condition.length > 0
  );

  console.log(`Found ${groupsToProcess.length} groups needing backfill`);
  console.log('');

  if (groupsToProcess.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Process each group - fetch event slug from Polymarket
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  for (const group of groupsToProcess) {
    // Use first condition to look up the event
    const firstConditionId = group.condition[0].id;

    console.log(`Processing "${group.name}" (condition: ${firstConditionId})...`);

    const market = await fetchMarketByConditionId(firstConditionId);

    if (!market) {
      console.log(`[SKIP] Could not fetch market data for "${group.name}"`);
      skippedCount++;
      continue;
    }

    // Extract event slug
    const eventSlug = market.events?.[0]?.slug;

    if (!eventSlug) {
      // Fallback to market slug if no event slug
      const slug = market.slug;
      if (!slug) {
        console.log(`[SKIP] No event or market slug found for "${group.name}"`);
        skippedCount++;
        continue;
      }
      const similarMarkets = [`https://polymarket.com#${slug}`];

      if (options.dryRun) {
        console.log(`[DRY RUN] Would update "${group.name}" (id: ${group.id}) with:`);
        console.log(`  - ${similarMarkets[0]} (market slug fallback)`);
      } else {
        const ok = await updateGroupSimilarMarkets(
          SAPIENCE_API_URL,
          privateKey,
          group.id,
          group.name,
          similarMarkets
        );
        if (ok) successCount++;
        else failCount++;
      }
      continue;
    }

    const similarMarkets = [`https://polymarket.com#${eventSlug}`];

    if (options.dryRun) {
      console.log(`[DRY RUN] Would update "${group.name}" (id: ${group.id}) with:`);
      console.log(`  - ${similarMarkets[0]}`);
    } else {
      const ok = await updateGroupSimilarMarkets(
        SAPIENCE_API_URL,
        privateKey,
        group.id,
        group.name,
        similarMarkets
      );
      if (ok) successCount++;
      else failCount++;
    }
  }

  // Summary
  console.log('');
  if (options.dryRun) {
    console.log(`Summary: ${groupsToProcess.length - skippedCount} groups would be updated, ${skippedCount} skipped`);
  } else {
    console.log(`Summary: ${successCount} updated, ${failCount} failed, ${skippedCount} skipped`);
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main();
