/**
 * Main entry point for relist keeper
 *
 * Fetches Polymarket markets with past endDates that are still actively traded,
 * creates new conditions on Sapience for never-listed markets, and extends
 * endTime on already-listed unsettled conditions.
 */

import 'dotenv/config';
import { DEFAULT_SAPIENCE_API_URL, RELIST_FORWARD_DAYS } from '../constants';
import {
  validatePrivateKey,
  confirmProductionAccess,
  fetchWithRetry,
  getAdminAuthHeaders,
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
and lists them on Sapience with endTime = now + 7 days. Also extends endTime
for already-listed conditions that are still traded.

Options:
  --dry-run      Show what would be submitted without actually submitting
  --help, -h     Show this help message

Environment Variables (required for API submission):
  SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests
`);
}

// ============ EndTime Extension ============

const SUBMISSION_DELAY_MS = 300;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Extend endTime on an existing condition via PUT /admin/conditions/:id
 */
async function extendConditionEndTime(
  apiUrl: string,
  privateKey: `0x${string}`,
  conditionId: string,
  newEndTimeUnix: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const authHeaders = await getAdminAuthHeaders(privateKey);

    const response = await fetchWithRetry(
      `${apiUrl}/admin/conditions/${conditionId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ endTime: newEndTimeUnix }),
      }
    );

    if (response.ok) {
      return { success: true };
    }

    const errorData = await response
      .json()
      .catch(() => ({ message: 'Unknown error' }));
    const errorMsg = `HTTP ${response.status}: ${errorData.message || response.statusText}`;
    return { success: false, error: errorMsg };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
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
    const newEndTimeUnix = Math.floor(newEndDate.getTime() / 1000);

    log(`[Relist] New endDate for all markets: ${newEndDateISO}`);

    // 3. Check which markets already exist in Sapience
    const allConditionIds = markets.map((m) => m.conditionId);
    const existingIds = await checkExistingConditions(apiUrl, allConditionIds);

    log(
      `[Relist] ${existingIds.size} already listed, ${markets.length - existingIds.size} new`
    );

    // 4. Extend endTime for existing conditions
    if (
      existingIds.size > 0 &&
      hasAPICredentials &&
      privateKey &&
      !options.dryRun
    ) {
      log(
        `[Relist] Extending endTime for ${existingIds.size} existing conditions...`
      );
      let extended = 0;
      let skipped = 0;
      let failed = 0;

      for (const conditionId of existingIds) {
        const result = await extendConditionEndTime(
          apiUrl,
          privateKey,
          conditionId,
          newEndTimeUnix
        );
        if (result.success) {
          extended++;
          log(`[Relist] Extended endTime: ${conditionId}...`);
        } else if (
          result.error?.includes('settled') ||
          result.error?.includes('shortened')
        ) {
          skipped++;
        } else {
          failed++;
          logError(
            `[Relist] Failed to extend ${conditionId}...: ${result.error}`
          );
        }
        await delay(SUBMISSION_DELAY_MS);
      }

      log(
        `[Relist] EndTime extension: ${extended} extended, ${skipped} skipped, ${failed} failed`
      );
    } else if (existingIds.size > 0 && options.dryRun) {
      log(
        `[Relist] DRY RUN: Would extend endTime for ${existingIds.size} existing conditions to ${newEndDateISO}`
      );
    }

    // 5. Override endDate for new market submissions
    const newMarkets = markets.filter((m) => !existingIds.has(m.conditionId));

    if (newMarkets.length === 0) {
      log('[Relist] No new markets to create');
      return;
    }

    // Override endDate on each market before passing to groupMarkets
    for (const market of newMarkets) {
      market.endDate = newEndDateISO;
    }

    // 6. Process through existing pipeline (grouping, LLM enrichment, etc.)
    const sapienceData = await groupMarkets(newMarkets, apiUrl);

    log(
      `[Relist] ${sapienceData.metadata.totalConditions} new conditions to create`
    );

    exportJSON(sapienceData, 'sapience-relist-conditions.json');

    if (options.dryRun) {
      printDryRun(sapienceData);
      return;
    }

    // 7. Submit new conditions to API
    if (hasAPICredentials && apiUrl && privateKey) {
      await submitToAPI(apiUrl, privateKey, sapienceData);
    }
  } catch (error) {
    logError('Error:', error);
    process.exit(1);
  }
}
