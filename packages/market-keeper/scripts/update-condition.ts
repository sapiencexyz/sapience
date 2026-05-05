#!/usr/bin/env node
/// <reference types="node" />
/**
 * One-off script: update the question (full name) and/or endTime for a single
 * Sapience condition. Targets `PUT /admin/conditions/:id`, which accepts a
 * partial update — pass only the fields you want changed.
 *
 * Usage:
 *   tsx scripts/update-condition.ts --id <conditionHash> [--question "..."] [--end-time <ISO|unix>] [--dry-run]
 *
 * Examples:
 *   tsx scripts/update-condition.ts \
 *     --id 0x6fb1af1cc7caa3b4479fa9a22ba149499795e99f39f807a5272cdbf89acba3b6 \
 *     --question "Will Trump endorse Ken Paxton for TX-Sen by Nov 2 2026 ET?" \
 *     --end-time 2026-11-04T00:00:00Z
 *
 *   tsx scripts/update-condition.ts --id 0x... --end-time 1762214400 --dry-run
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

interface CLIOptions {
  id?: string;
  question?: string;
  endTime?: number;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const opts: CLIOptions = { dryRun: false, help: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--id':
        opts.id = args[++i];
        break;
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
Usage: tsx scripts/update-condition.ts --id <conditionHash> [options]

Updates the question and/or endTime for a single Sapience condition via
PUT /admin/conditions/:id. At least one of --question or --end-time is required.

Options:
  --id <hash>          Condition hash (0x-prefixed 32-byte hex). Required.
  --question "..."     New question text (full name)
  --end-time <value>   New endTime as ISO 8601 (e.g. 2026-11-04T00:00:00Z) or unix seconds
  --dry-run            Print the payload without submitting
  --help, -h           Show this help message

Notes:
  - endTime cannot be changed on a settled condition (API returns 400).
  - The exact value is sent — no buffer is added.

Environment Variables (required for submission):
  SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests
`);
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

  if (!options.id) {
    logError('--id is required');
    showHelp();
    process.exit(1);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(options.id)) {
    logError(`Invalid --id format: ${options.id} (expected 0x-prefixed 32-byte hex)`);
    process.exit(1);
  }
  if (options.question === undefined && options.endTime === undefined) {
    logError('At least one of --question or --end-time is required');
    showHelp();
    process.exit(1);
  }

  const apiUrl = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;

  const payload: { question?: string; endTime?: number } = {};
  if (options.question !== undefined) payload.question = options.question;
  if (options.endTime !== undefined) payload.endTime = options.endTime;

  log(`[UpdateCondition] Target: ${apiUrl}/admin/conditions/${options.id}`);
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

  let privateKey: `0x${string}` | undefined;
  try {
    privateKey = validatePrivateKey(process.env.ADMIN_PRIVATE_KEY);
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  if (!privateKey) {
    logError('ADMIN_PRIVATE_KEY is required for submission (use --dry-run to preview)');
    process.exit(1);
  }

  await confirmProductionAccess(apiUrl);

  const authHeaders = await getAdminAuthHeaders(privateKey);
  const response = await fetchWithRetry(
    `${apiUrl}/admin/conditions/${options.id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logError(
      `[UpdateCondition] Failed: HTTP ${response.status} — ${body.slice(0, 500)}`
    );
    process.exit(1);
  }

  log(`[UpdateCondition] Updated condition ${options.id}`);
}

main().catch((error) => {
  logError('Fatal error:', error);
  process.exit(1);
});
