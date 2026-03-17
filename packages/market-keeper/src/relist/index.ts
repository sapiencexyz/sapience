/**
 * Main entry point for relist keeper
 *
 * Fetches Polymarket markets with past endDates that are still actively traded
 * and creates new conditions on Sapience for never-listed markets.
 * Already-listed conditions are never touched.
 */

import 'dotenv/config';
import { DEFAULT_SAPIENCE_API_URL, RELIST_FORWARD_DAYS } from '../constants';
import {
  validatePrivateKey,
  confirmProductionAccess,
  log,
  logError,
} from '../utils';
import { fetchPastEndDateMarkets } from './market';
import { groupMarkets, exportJSON } from '../generate/grouping';
import { printDryRun, submitToAPI } from '../generate/api';
import { checkExistingConditions } from '../generate/pipeline';

// ============ CLI Arguments ============

interface RelistCLIOptions {
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): RelistCLIOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function showHelp(): void {
  console.log(`
Usage: tsx scripts/relist.ts [options]

Fetches Polymarket markets with past end dates that are still actively traded,
and lists them on Sapience with endTime = now + 7 days.
Already-listed conditions are skipped (endTime is never overwritten).

Options:
  --dry-run      Show what would be submitted without actually submitting
  --help, -h     Show this help message

Environment Variables (required for API submission):
  SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests
`);
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
    // 1. Fetch past-endDate markets still traded on Polymarket
    const markets = await fetchPastEndDateMarkets();

    if (markets.length === 0) {
      log('[Relist] No past-endDate markets found that are still traded');
      return;
    }

    // 2. Compute new endDate (now + RELIST_FORWARD_DAYS)
    const newEndDate = new Date(
      Date.now() + RELIST_FORWARD_DAYS * 24 * 60 * 60 * 1000
    );
    const newEndDateISO = newEndDate.toISOString();

    log(`[Relist] New endDate for new markets: ${newEndDateISO}`);

    // 3. Check which markets already exist in Sapience (skip them entirely)
    const allConditionIds = markets.map((m) => m.conditionId);
    const existingConditions = await checkExistingConditions(
      apiUrl,
      allConditionIds
    );

    log(
      `[Relist] ${existingConditions.size} already listed (skipping), ${markets.length - existingConditions.size} new`
    );

    // 4. Filter to only new markets
    const newMarkets = markets.filter(
      (m) => !existingConditions.has(m.conditionId)
    );

    if (newMarkets.length === 0) {
      log('[Relist] No new markets to create');
      return;
    }

    // Override endDate on each market before passing to groupMarkets
    for (const market of newMarkets) {
      market.endDate = newEndDateISO;
    }

    // 5. Process through existing pipeline (grouping, LLM enrichment, etc.)
    const sapienceData = await groupMarkets(newMarkets, apiUrl);

    log(
      `[Relist] ${sapienceData.metadata.totalConditions} new conditions to create`
    );

    exportJSON(sapienceData, 'sapience-relist-conditions.json');

    if (options.dryRun) {
      printDryRun(sapienceData);
      return;
    }

    // 6. Submit new conditions to API
    if (hasAPICredentials && apiUrl && privateKey) {
      await submitToAPI(apiUrl, privateKey, sapienceData);
    }
  } catch (error) {
    logError('Error:', error);
    process.exit(1);
  }
}
