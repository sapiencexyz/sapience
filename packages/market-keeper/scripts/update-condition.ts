#!/usr/bin/env node
/// <reference types="node" />
/**
 * One-off script: update the question (full name) and/or endTime for Sapience
 * conditions. Targets `PUT /admin/conditions/:id`, which accepts a partial
 * update — pass only the fields you want changed.
 *
 * Two modes:
 *   --id <conditionHash>   update a single condition (question and/or endTime)
 *   --event <pm-slug>      update EVERY Sapience condition whose conditionId
 *                          matches a market in the given Polymarket event(s).
 *                          Repeatable. endTime only — the same value is applied
 *                          to all legs (correct for a basket: every leg of
 *                          e.g. "World Cup Winner" resolves at the same time).
 *                          Conditions not present on Sapience (404) are skipped.
 *
 * Usage:
 *   tsx scripts/update-condition.ts --id <conditionHash> [--question "..."] [--end-time <ISO|unix>] [--dry-run]
 *   tsx scripts/update-condition.ts --event <pm-slug> [--event <pm-slug> ...] --end-time <ISO|unix> [--dry-run]
 *
 * Examples:
 *   tsx scripts/update-condition.ts \
 *     --id 0x6fb1af1cc7caa3b4479fa9a22ba149499795e99f39f807a5272cdbf89acba3b6 \
 *     --question "Will Trump endorse Ken Paxton for TX-Sen by Nov 2 2026 ET?" \
 *     --end-time 2026-11-04T00:00:00Z
 *
 *   tsx scripts/update-condition.ts --event world-cup-winner --end-time 2026-07-19T22:00:00Z --dry-run
 *
 * Environment Variables (required for API submission):
 *   SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
 *   ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests
 */

import 'dotenv/config';
import { DEFAULT_SAPIENCE_API_URL } from '../src/constants';
import {
  validatePrivateKey,
  confirmProductionAccess,
  fetchWithRetry,
  log,
  logError,
} from '../src/utils';
import { getAdminAuthHeaders } from '../src/utils/auth';
import { fetchConditionIdsForSlugs } from '../src/generate/from-event-slugs';

interface CLIOptions {
  id?: string;
  events: string[];
  question?: string;
  endTime?: number;
  dryRun: boolean;
  help: boolean;
}

interface ConditionUpdate {
  question?: string;
  endTime?: number;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const opts: CLIOptions = { events: [], dryRun: false, help: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--id':
        opts.id = args[++i];
        break;
      case '--event': {
        const slug = args[++i];
        if (!slug) throw new Error('--event requires a Polymarket event slug');
        opts.events.push(slug);
        break;
      }
      case '--question':
        opts.question = args[++i];
        break;
      case '--end-time': {
        const raw = args[++i];
        opts.endTime = parseEndTime(raw);
        break;
      }
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

// Accept ISO 8601 strings or unix-seconds integers; reject anything else so a
// silent NaN never reaches the API.
function parseEndTime(raw: string | undefined): number {
  if (!raw) throw new Error('--end-time requires a value');

  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) throw new Error(`Invalid endTime: ${raw}`);
    return n;
  }

  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) {
    throw new Error(
      `Invalid --end-time: "${raw}". Pass ISO 8601 (e.g. 2026-11-04T00:00:00Z) or unix seconds.`
    );
  }
  return Math.floor(ts / 1000);
}

function showHelp(): void {
  console.log(`
Usage:
  tsx scripts/update-condition.ts --id <conditionHash> [--question "..."] [--end-time <value>] [--dry-run]
  tsx scripts/update-condition.ts --event <pm-slug> [--event <pm-slug> ...] --end-time <value> [--dry-run]

--id mode: update a single condition's question and/or endTime.
--event mode: resolve the Polymarket event(s) to their market conditionIds and
  apply the SAME endTime to every matching condition on Sapience. Conditions not
  present on Sapience are skipped (404). --question is not allowed here (it would
  overwrite every market with identical text).

Options:
  --id <hash>          Condition hash (0x-prefixed 32-byte hex)
  --event <slug>       Polymarket event slug (repeatable)
  --question "..."     New question text (full name) — --id mode only
  --end-time <value>   New endTime as ISO 8601 (e.g. 2026-11-04T00:00:00Z) or unix seconds
  --dry-run            Print what would be sent without submitting
  --help, -h           Show this help message

Notes:
  - endTime cannot be changed on a settled condition (API returns 400).
  - The exact value is sent — no buffer is added.

Environment Variables (required for submission):
  SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests
`);
}

interface PutResult {
  ok: boolean;
  status: number;
  body: string;
}

/** Apply a partial update to one condition via PUT /admin/conditions/:id. */
async function putCondition(
  apiUrl: string,
  id: string,
  payload: ConditionUpdate,
  privateKey: `0x${string}`
): Promise<PutResult> {
  // Sign per request — a long --event loop can outlive a single signature's
  // timestamp window.
  const authHeaders = await getAdminAuthHeaders(privateKey);
  const response = await fetchWithRetry(`${apiUrl}/admin/conditions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(payload),
  });
  const body = response.ok ? '' : await response.text().catch(() => '');
  return { ok: response.ok, status: response.status, body };
}

function requirePrivateKey(): `0x${string}` {
  let privateKey: `0x${string}` | undefined;
  try {
    privateKey = validatePrivateKey(process.env.ADMIN_PRIVATE_KEY);
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  if (!privateKey) {
    logError(
      'ADMIN_PRIVATE_KEY is required for submission (use --dry-run to preview)'
    );
    process.exit(1);
  }
  return privateKey;
}

/** --id mode: update a single condition. */
async function runSingle(apiUrl: string, options: CLIOptions): Promise<void> {
  const id = options.id!;
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
    logError(`Invalid --id format: ${id} (expected 0x-prefixed 32-byte hex)`);
    process.exit(1);
  }
  if (options.question === undefined && options.endTime === undefined) {
    logError('At least one of --question or --end-time is required');
    showHelp();
    process.exit(1);
  }

  const payload: ConditionUpdate = {};
  if (options.question !== undefined) payload.question = options.question;
  if (options.endTime !== undefined) payload.endTime = options.endTime;

  log(`[UpdateCondition] Target: ${apiUrl}/admin/conditions/${id}`);
  log(`[UpdateCondition] Payload: ${JSON.stringify(payload, null, 2)}`);
  if (options.endTime !== undefined) {
    log(
      `[UpdateCondition]   endTime ${options.endTime} = ${new Date(options.endTime * 1000).toISOString()}`
    );
  }

  if (options.dryRun) {
    log('[UpdateCondition] Dry run — not submitting');
    return;
  }

  const privateKey = requirePrivateKey();
  await confirmProductionAccess(apiUrl);

  const result = await putCondition(apiUrl, id, payload, privateKey);
  if (!result.ok) {
    logError(
      `[UpdateCondition] Failed: HTTP ${result.status} — ${result.body.slice(0, 500)}`
    );
    process.exit(1);
  }
  log(`[UpdateCondition] Updated condition ${id}`);
}

/** --event mode: update every Sapience condition under the given PM event(s). */
async function runEvent(apiUrl: string, options: CLIOptions): Promise<void> {
  if (options.endTime === undefined) {
    logError('--event requires --end-time');
    showHelp();
    process.exit(1);
  }
  if (options.question !== undefined) {
    logError(
      '--question cannot be combined with --event (it would overwrite every market with identical text)'
    );
    process.exit(1);
  }

  log(
    `[UpdateCondition] Resolving Polymarket event(s): ${options.events.join(', ')}`
  );
  const conditionIds = await fetchConditionIdsForSlugs(options.events);
  if (conditionIds.length === 0) {
    logError('No markets found for the given event slug(s).');
    process.exit(1);
  }

  const payload: ConditionUpdate = { endTime: options.endTime };
  log(
    `[UpdateCondition] ${conditionIds.length} market conditionId(s) resolved; ` +
      `endTime ${options.endTime} = ${new Date(options.endTime * 1000).toISOString()}`
  );

  if (options.dryRun) {
    log('[UpdateCondition] Dry run — would PUT the above endTime to each of:');
    for (const id of conditionIds) log(`  ${id}`);
    return;
  }

  const privateKey = requirePrivateKey();
  log(`[UpdateCondition] Target: ${apiUrl}/admin/conditions/:id`);
  await confirmProductionAccess(apiUrl);

  let updated = 0;
  let notOnSapience = 0;
  let failed = 0;
  for (const id of conditionIds) {
    const result = await putCondition(apiUrl, id, payload, privateKey);
    if (result.ok) {
      updated++;
      log(`  ✓ ${id} updated`);
    } else if (result.status === 404) {
      notOnSapience++;
      log(`  – ${id} not on Sapience (404), skipped`);
    } else {
      failed++;
      logError(
        `  ✗ ${id} HTTP ${result.status} — ${result.body.slice(0, 200)}`
      );
    }
  }

  log(
    `[UpdateCondition] Done: ${updated} updated, ${notOnSapience} not on Sapience, ` +
      `${failed} failed (of ${conditionIds.length})`
  );
  if (failed > 0) process.exit(1);
}

async function main(): Promise<void> {
  let options: CLIOptions;
  try {
    options = parseArgs();
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    showHelp();
    process.exit(1);
  }

  if (options.help) {
    showHelp();
    return;
  }

  const useEvent = options.events.length > 0;
  const useId = options.id !== undefined;
  if (useEvent && useId) {
    logError('Use --id OR --event, not both');
    process.exit(1);
  }
  if (!useEvent && !useId) {
    logError('One of --id or --event is required');
    showHelp();
    process.exit(1);
  }

  const apiUrl = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;

  if (useEvent) {
    await runEvent(apiUrl, options);
  } else {
    await runSingle(apiUrl, options);
  }
}

main().catch((error) => {
  logError('Fatal error:', error);
  process.exit(1);
});
