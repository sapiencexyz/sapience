/**
 * Refresh the "today" tag on conditions whose question OR description
 * text mentions today's or tomorrow's UTC date.
 *
 * Designed to run once daily from start.js. Idempotent — re-running the
 * same day reports zero updates. The day after, yesterday's matches drop
 * the tag and today's gain it.
 *
 * Pulls only public + unsettled conditions: settled conditions can't be
 * traded on so the tag has no UI value for them, and the admin endpoint
 * doesn't reject tag changes the way it does endTime changes.
 */

import 'dotenv/config';
import { DEFAULT_SAPIENCE_API_URL } from '../constants';
import {
  validatePrivateKey,
  confirmProductionAccess,
  log,
  logError,
} from '../utils';
import { submitMetadataUpdates } from '../generate/api';
import { fetchAllUnsettledConditions } from './fetch';
import {
  conditionMentionsImminentDate,
  computeDesiredTags,
  TODAY_TAG,
} from './match';

interface ImminentTagCLIOptions {
  dryRun: boolean;
  limit: number | null;
  help: boolean;
}

const DEFAULT_DRY_RUN_LIMIT = 1000;

function parseArgs(): ImminentTagCLIOptions {
  const args = process.argv.slice(2);
  const limitIdx = args.findIndex((a) => a === '--limit');
  const dryRun = args.includes('--dry-run');
  const explicitLimit =
    limitIdx !== -1 && args[limitIdx + 1]
      ? parseInt(args[limitIdx + 1], 10)
      : null;
  return {
    dryRun,
    // Dry-runs cap at 1000 by default so a casual smoke-test doesn't pull
    // every unsettled condition. Live runs have no implicit cap — the
    // daily job needs to see every market. `--limit N` overrides both.
    limit: explicitLimit ?? (dryRun ? DEFAULT_DRY_RUN_LIMIT : null),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function showHelp(): void {
  console.log(`
Usage: tsx scripts/refresh-imminent-tag.ts [options]

Tags every public + unsettled condition whose question or description
references today's or tomorrow's UTC date (literal "today"/"tomorrow",
"May 18"/"18 May", ISO "2026-05-18") with the "${TODAY_TAG}" tag, and strips the tag from
markets that no longer match. (The tag string is "${TODAY_TAG}" — the
match logic also covers tomorrow, since markets resolving tomorrow are
imminent enough that users want them in the same UI bucket.)

Options:
  --dry-run      Show what would be tagged/untagged without submitting.
                 Defaults to fetching only ${DEFAULT_DRY_RUN_LIMIT} conditions; override with --limit.
  --limit N      Cap the number of conditions fetched (sorted by createdAt asc).
                 Default: ${DEFAULT_DRY_RUN_LIMIT} in --dry-run, unlimited in live mode.
  --help, -h     Show this help

Environment Variables (required for live run):
  SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests
`);
}

/** Set-equality (order-insensitive) for two string[] tag lists. */
function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export async function main(): Promise<void> {
  const runStart = Date.now();
  const options = parseArgs();
  if (options.help) {
    showHelp();
    return;
  }

  const apiUrl = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;
  const rawPrivateKey = process.env.ADMIN_PRIVATE_KEY;

  log(`[TodayTag] ==============================================`);
  log(`[TodayTag] API:     ${apiUrl}`);
  log(`[TodayTag] Mode:    ${options.dryRun ? 'DRY-RUN' : 'LIVE'}`);
  log(
    `[TodayTag] Limit:   ${options.limit === null ? 'unlimited' : options.limit}`
  );
  log(`[TodayTag] Tag:     "${TODAY_TAG}"`);
  log(`[TodayTag] ==============================================`);

  let privateKey: `0x${string}` | undefined;
  if (!options.dryRun) {
    try {
      privateKey = validatePrivateKey(rawPrivateKey);
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
    log(`[TodayTag] Confirming prod access (LIVE mode)...`);
    await confirmProductionAccess(apiUrl);
  }

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400 * 1000)
    .toISOString()
    .slice(0, 10);
  log(
    `[TodayTag] Reference: today=${todayIso}  tomorrow=${tomorrow}  (UTC; both are tagged)`
  );

  log(`[TodayTag] [1/3] Fetching conditions (sorted newest first)...`);
  const fetchStart = Date.now();
  const conditions = await fetchAllUnsettledConditions(apiUrl, options.limit);
  log(
    `[TodayTag] [1/3] Fetched ${conditions.length} conditions in ${((Date.now() - fetchStart) / 1000).toFixed(1)}s`
  );

  // Show a few sample titles so 0-match results are diagnosable —
  // user can eyeball whether any of these *should* have matched.
  const peek = conditions.slice(0, 5);
  if (peek.length > 0) {
    log(`[TodayTag]   Sample titles scanned (first ${peek.length}):`);
    for (const c of peek) {
      log(`    · "${c.question.slice(0, 100)}"`);
    }
  }

  log(
    `[TodayTag] [2/3] Matching question + description against reference dates...`
  );
  type Update = {
    id: string;
    question: string;
    oldTags: string[];
    newTags: string[];
    matched: boolean;
  };
  const updates: Update[] = [];
  let matchedCount = 0;

  for (const c of conditions) {
    const matched = conditionMentionsImminentDate(
      c.question,
      c.description,
      now
    );
    if (matched) matchedCount++;
    const desired = computeDesiredTags(c.tags, matched);
    if (!tagsEqual(c.tags, desired)) {
      updates.push({
        id: c.id,
        question: c.question,
        oldTags: c.tags,
        newTags: desired,
        matched,
      });
    }
  }

  const additions = updates.filter((u) => u.matched);
  const removals = updates.filter((u) => !u.matched);
  log(
    `[TodayTag] [2/3] Matched ${matchedCount}/${conditions.length} questions (${((matchedCount / Math.max(conditions.length, 1)) * 100).toFixed(1)}%)`
  );
  log(
    `[TodayTag] [2/3] Diff vs DB: ${additions.length} would gain "${TODAY_TAG}", ${removals.length} would lose "${TODAY_TAG}" (${conditions.length - updates.length} unchanged)`
  );

  // Show a sample
  const sample = updates.slice(0, 20);
  if (sample.length > 0) {
    log(`[TodayTag] Sample (first ${sample.length} of ${updates.length}):`);
    for (const u of sample) {
      log(
        `  ${u.matched ? '+' : '-'} ${u.id.slice(0, 10)}… ${u.matched ? 'GAIN' : 'LOSE'}: "${u.question.slice(0, 80)}"`
      );
    }
    if (updates.length > sample.length) {
      log(`  ... and ${updates.length - sample.length} more`);
    }
  }

  if (options.dryRun) {
    log(
      `[TodayTag] [3/3] DRY-RUN: no changes submitted. Re-run without --dry-run to apply.`
    );
    log(
      `[TodayTag] Total wall-clock: ${((Date.now() - runStart) / 1000).toFixed(1)}s`
    );
    return;
  }

  if (updates.length === 0) {
    log(`[TodayTag] [3/3] No changes needed (idempotent re-run).`);
    log(
      `[TodayTag] Total wall-clock: ${((Date.now() - runStart) / 1000).toFixed(1)}s`
    );
    return;
  }

  log(`[TodayTag] [3/3] Submitting ${updates.length} tag updates...`);
  const submitStart = Date.now();
  await submitMetadataUpdates(
    apiUrl,
    privateKey!,
    updates.map((u) => ({
      conditionId: u.id,
      fields: { tags: u.newTags },
    }))
  );
  log(
    `[TodayTag] [3/3] Submit done in ${((Date.now() - submitStart) / 1000).toFixed(1)}s`
  );
  log(
    `[TodayTag] Total wall-clock: ${((Date.now() - runStart) / 1000).toFixed(1)}s`
  );
}
