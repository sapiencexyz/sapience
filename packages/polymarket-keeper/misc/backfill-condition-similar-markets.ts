/**
 * One-off script to backfill similarMarkets for individual conditions
 *
 * For each condition across all groups, fetches the event slug from Polymarket API
 * using the condition's conditionHash, and updates the condition's similarMarkets URL.
 *
 * Usage:
 *   npx tsx backfill-condition-similar-markets.ts --dry-run
 *   npx tsx backfill-condition-similar-markets.ts --execute
 */

import 'dotenv/config';
import { getAdminAuthHeaders, validatePrivateKey, confirmProductionAccess } from '../src/utils';
import { fetchWithRetry } from '../src/utils/fetch';
import { DEFAULT_SAPIENCE_API_URL } from '../src/constants';

const SAPIENCE_API_URL = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;

interface Condition {
  id: string; // conditionHash (0x-prefixed 32-byte hex)
  question: string;
  similarMarkets: string[];
}

interface ConditionGroup {
  id: number;
  name: string;
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
Usage: npx tsx backfill-condition-similar-markets.ts [options]

Backfills similarMarkets for individual conditions by fetching event slugs from Polymarket API.

Options:
  --dry-run      Show what would be updated without making changes (default)
  --execute      Actually update the conditions
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
    if (!response.ok) return null;
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
    if (!response.ok) return null;
    const market = await response.json();
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
  const gammaResult = await fetchMarketFromGammaApi(conditionId);
  if (gammaResult) return gammaResult;
  return fetchMarketFromClobApi(conditionId);
}

async function updateConditionSimilarMarkets(
  apiUrl: string,
  privateKey: `0x${string}`,
  conditionHash: string,
  question: string,
  similarMarkets: string[]
): Promise<boolean> {
  try {
    const authHeaders = await getAdminAuthHeaders(privateKey);
    const response = await fetchWithRetry(`${apiUrl}/admin/conditions/${conditionHash}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ similarMarkets }),
    });
    if (response.ok) {
      console.log(`[OK] Updated "${question.slice(0, 60)}" (${conditionHash.slice(0, 10)}...)`);
      return true;
    }
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    console.error(`[FAIL] Update failed for "${question.slice(0, 60)}": HTTP ${response.status}: ${errorData.message || response.statusText}`);
    return false;
  } catch (error) {
    console.error(`[FAIL] Update error for "${question.slice(0, 60)}": ${error instanceof Error ? error.message : String(error)}`);
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

  await confirmProductionAccess(SAPIENCE_API_URL);

  console.log('Fetching all condition groups...');
  const groups = await fetchAllGroups(SAPIENCE_API_URL, privateKey);
  console.log(`Found ${groups.length} groups`);

  // Collect all conditions across all groups (deduplicated by conditionHash)
  const seen = new Set<string>();
  const conditions: Condition[] = [];
  for (const group of groups) {
    for (const condition of group.condition) {
      if (!seen.has(condition.id)) {
        seen.add(condition.id);
        conditions.push(condition);
      }
    }
  }

  console.log(`Found ${conditions.length} unique conditions`);
  console.log('');

  if (conditions.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  for (const condition of conditions) {
    console.log(`Processing "${condition.question.slice(0, 60)}" (${condition.id.slice(0, 10)}...)...`);

    const market = await fetchMarketByConditionId(condition.id);

    if (!market) {
      console.log(`[SKIP] Could not fetch market data`);
      skippedCount++;
      continue;
    }

    const eventSlug = market.events?.[0]?.slug;

    let similarMarkets: string[];
    if (eventSlug) {
      similarMarkets = [`https://polymarket.com/event/${eventSlug}#${market.slug}`];
    } else if (market.slug) {
      similarMarkets = [`https://polymarket.com#${market.slug}`];
    } else {
      console.log(`[SKIP] No event or market slug found`);
      skippedCount++;
      continue;
    }

    if (options.dryRun) {
      console.log(`[DRY RUN] Would update with: ${similarMarkets[0]}`);
    } else {
      const ok = await updateConditionSimilarMarkets(
        SAPIENCE_API_URL,
        privateKey,
        condition.id,
        condition.question,
        similarMarkets
      );
      if (ok) successCount++;
      else failCount++;
    }
  }

  console.log('');
  if (options.dryRun) {
    console.log(`Summary: ${conditions.length - skippedCount} conditions would be updated, ${skippedCount} skipped`);
  } else {
    console.log(`Summary: ${successCount} updated, ${failCount} failed, ${skippedCount} skipped`);
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main();
