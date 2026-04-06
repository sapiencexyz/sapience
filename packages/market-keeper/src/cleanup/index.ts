/**
 * Cleanup-polymarket: monitors unsettled conditions and privates resolved ones with no engagement.
 *
 * For each unsettled, public condition with no engagement:
 * 1. Checks if resolved on Polygon CTF (canRequestResolution)
 * 2. If resolved + OI=0 + no attestations → private the condition
 * 3. If resolved + (OI>0 or attestations) → skip (settle-polymarket handles it)
 * 4. If not resolved → skip (wait for next cron cycle)
 *
 * Race condition safeguard:
 * After privating, waits 15 seconds (indexer poll interval + buffer),
 * then re-checks privated conditions. If any gained OI or attestations,
 * settles them directly via requestResolution on Polygon CTF.
 */

import {
  createPolygonClient,
  createPolygonWalletClient,
  batchCanRequestResolution,
} from '../polygon/client';
import { batchCheckGammaResolution } from '../polymarket-api';
import { validatePrivateKey, confirmProductionAccess, log } from '../utils';
import {
  fetchNoEngagementConditions,
  privateConditions,
  republishConditions,
  fetchConditionsWithEngagement,
  settleConditionOnPolygon,
} from './api';

// Indexer polls every 10s + 5s buffer
const SAFEGUARD_WAIT_MS = 15_000;

interface CLIOptions {
  dryRun: boolean;
  execute: boolean;
  help: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const hasArg = (name: string): boolean =>
    args.includes(`--${name}`) || args.some((a) => a.startsWith(`--${name}=`));

  return {
    dryRun: hasArg('dry-run') || !hasArg('execute'),
    execute: hasArg('execute'),
    help: hasArg('help') || hasArg('h'),
  };
}

function showHelp(): void {
  console.log(`
Usage: tsx scripts/cleanup-polymarket.ts [options]

Privates expired Polymarket conditions that resolved on-chain with no engagement
(zero open interest and no attestations).

Options:
  --dry-run      Check conditions without making changes (default)
  --execute      Actually private conditions and settle race-condition cases
  --help, -h     Show this help message

Environment Variables:
  POLYGON_RPC_URL        Polygon RPC URL (required)
  ADMIN_PRIVATE_KEY      Private key for signing admin requests (required for --execute)
  SAPIENCE_API_URL       Sapience API URL (default: https://api.sapience.xyz)
`);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return;
  }

  const polygonRpcUrl = process.env.POLYGON_RPC_URL;
  const apiUrl = process.env.SAPIENCE_API_URL || 'https://api.sapience.xyz';
  const privateKey = validatePrivateKey(process.env.ADMIN_PRIVATE_KEY);

  if (!polygonRpcUrl) {
    console.error('POLYGON_RPC_URL environment variable is required');
    process.exit(1);
  }

  if (options.execute && !privateKey) {
    console.error(
      'ADMIN_PRIVATE_KEY environment variable is required for --execute mode'
    );
    process.exit(1);
  }

  await confirmProductionAccess(process.env.SAPIENCE_API_URL);

  const polygonClient = createPolygonClient(polygonRpcUrl);

  // Fetch unsettled, public conditions with no engagement
  const conditions = await fetchNoEngagementConditions(apiUrl);

  if (conditions.length === 0) {
    log('[Cleanup] No unresolved no-engagement conditions found');
    return;
  }

  log(
    `[Cleanup] Processing ${conditions.length} conditions (mode: ${options.dryRun ? 'dry-run' : 'execute'})`
  );

  const results = {
    total: 0,
    resolved: 0,
    privated: 0,
    skippedActive: 0,
    skippedUnresolved: 0,
    errors: 0,
  };

  const conditionMap = new Map(conditions.map((c) => [c.id, c]));
  // Deduplicate — the GraphQL query can return the same condition ID multiple times
  const allIds = [...new Set(conditions.map((c) => c.id))];
  if (allIds.length < conditions.length) {
    log(
      `[Cleanup] Deduplicated ${conditions.length} → ${allIds.length} unique condition IDs`
    );
  }
  results.total = allIds.length;

  // Step 1: Check Gamma API for closed markets (free, no RPC)
  log(`[Cleanup] Checking Gamma API for ${allIds.length} conditions...`);
  const gamma = await batchCheckGammaResolution(allIds);

  const toPrivate: string[] = [];
  const needsOnChainCheck: string[] = [];

  // Classify each condition based on Gamma status
  for (const id of allIds) {
    const c = conditionMap.get(id);
    const q = c ? `"${c.question}"` : '';
    const status = gamma.statuses.get(id) ?? 'not_found';

    switch (status) {
      case 'closed':
        log(
          `[${id}] ${q} — Gamma: closed → ${options.dryRun ? 'DRY RUN — would private' : 'will private'}`
        );
        toPrivate.push(id);
        results.resolved++;
        break;
      case 'active':
        log(`[${id}] ${q} — Gamma: active → skipping`);
        results.skippedActive++;
        break;
      case 'archived':
      case 'not_found':
      case 'api_error':
        log(`[${id}] ${q} — Gamma: ${status} → will check on-chain`);
        needsOnChainCheck.push(id);
        break;
    }
  }

  // Step 2: Batch on-chain check for unresolved conditions via multicall
  if (needsOnChainCheck.length > 0) {
    log(
      `[Cleanup] Checking ${needsOnChainCheck.length} conditions on-chain via multicall...`
    );
    try {
      const onChainResults = await batchCanRequestResolution(
        polygonClient,
        needsOnChainCheck
      );

      for (const [id, canResolve] of onChainResults) {
        const c = conditionMap.get(id);
        const question = c ? `"${c.question}"` : '';
        log(`[${id}] ${question} — canRequestResolution = ${canResolve}`);

        if (canResolve) {
          log(
            `[${id}] ${options.dryRun ? 'DRY RUN — would private' : 'will private'} (resolved on-chain, no engagement)`
          );
          toPrivate.push(id);
          results.resolved++;
        } else {
          results.skippedUnresolved++;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`[Cleanup] Multicall error: ${msg}`);
      results.errors += needsOnChainCheck.length;
    }
  }

  // Batch private all resolved conditions with no engagement
  let privatedIds: string[] = [];
  if (toPrivate.length > 0 && options.execute) {
    log(
      `[Cleanup] Sending batch private for ${toPrivate.length} condition(s): ${toPrivate.map((id) => id.slice(0, 10) + '...').join(', ')}`
    );
    const result = await privateConditions(apiUrl, privateKey!, toPrivate);
    log(
      `[Cleanup] Batch private response: success=${result.success}, updated=${result.updated}, error=${result.error}`
    );
    if (result.success) {
      log(`[Cleanup] Batch privated ${result.updated} condition(s)`);
      results.privated = result.updated ?? 0;
      privatedIds = toPrivate;
    } else {
      log(`[Cleanup] Batch private failed: ${result.error}`);
      results.errors += toPrivate.length;
    }
  } else if (toPrivate.length > 0) {
    results.privated = toPrivate.length;
  }

  // Race condition safeguard: re-check privated conditions after wait
  if (privatedIds.length > 0 && options.execute) {
    log(
      `[Cleanup] Waiting ${SAFEGUARD_WAIT_MS / 1000}s before race condition re-check...`
    );
    await delay(SAFEGUARD_WAIT_MS);

    const engagedIds = await fetchConditionsWithEngagement(apiUrl, privatedIds);

    if (engagedIds.length > 0) {
      log(
        `[Cleanup] ${engagedIds.length} privated condition(s) gained engagement — re-publishing and settling`
      );

      // Re-publish so users can see their positions
      const republishResult = await republishConditions(
        apiUrl,
        privateKey!,
        engagedIds
      );
      if (republishResult.success) {
        log(`[Cleanup] Re-published ${republishResult.updated} condition(s)`);
      } else {
        log(`[Cleanup] Re-publish failed: ${republishResult.error}`);
      }

      const walletClient = createPolygonWalletClient(
        polygonRpcUrl,
        privateKey!
      );

      for (const conditionId of engagedIds) {
        try {
          const settleResult = await settleConditionOnPolygon(
            polygonClient,
            walletClient,
            conditionId
          );
          if (settleResult.success) {
            log(
              `[${conditionId}] Settled directly (race condition recovery, tx: ${settleResult.txHash})`
            );
          } else {
            log(`[${conditionId}] Failed to settle: ${settleResult.error}`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          log(`[${conditionId}] Settlement error: ${msg}`);
        }
      }
    } else {
      log('[Cleanup] Re-check passed — no race conditions detected');
    }
  }

  // Summary
  log('\n--- Cleanup Summary ---');
  log(`Total conditions:            ${results.total}`);
  log(`Resolved (Gamma + on-chain): ${results.resolved}`);
  log(`Privated (no engagement):    ${results.privated}`);
  log(`Skipped (active on Gamma):   ${results.skippedActive}`);
  log(`Skipped (not resolved):      ${results.skippedUnresolved}`);
  log(`Errors:                      ${results.errors}`);
}
