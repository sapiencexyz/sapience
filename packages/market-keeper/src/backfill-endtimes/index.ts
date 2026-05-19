/**
 * Backfill endTime for active Polymarket-sourced conditions.
 *
 * Re-runs the new endtime pipeline (Sonar → decideEndTime) against every
 * unsettled, Polymarket-sourced condition currently in the DB. Submits
 * updates to the existing `PUT /admin/conditions/batch-metadata` endpoint
 * (which we extended in this PR to accept `endTime` with a settled-row
 * guard).
 *
 * Scoped to PM-sourced markets — those are the ones the new pipeline knows
 * how to reach via Gamma. Non-PM markets (Pyth, manual) are out of scope
 * for backfill; they can be hand-patched via PUT /admin/conditions/:id.
 *
 * Safety: --dry-run by default. The script always prints a per-condition
 * diff plan and the LLM call-count estimate before submitting anything;
 * pass --execute to actually write.
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
import { submitMetadataUpdates } from '../generate/api';
import { decideEndTime } from '../generate/api';
import { extractEndTime } from '../generate/endtime';
import { isTemplatedMarket } from '../generate/templated';
import { enrichEndTimesWithLLM } from '../llm';
import { fetchMarketsByConditionIds } from '../refresh-metadata/fetch';
import {
  LLM_ENDTIME_SEARCH_ENABLED,
  OPENROUTER_API_KEY,
  LLM_ENDTIME_MODEL,
} from '../constants';
import type {
  PolymarketMarket,
  SapienceCondition,
  LlmEndTimeResult,
} from '../types';

interface BackfillCLIOptions {
  execute: boolean;
  limit: number | null;
  thresholdSeconds: number;
  help: boolean;
}

function parseArgs(): BackfillCLIOptions {
  const args = process.argv.slice(2);
  const limitArg = args.findIndex((a) => a === '--limit');
  const thresholdArg = args.findIndex((a) => a === '--threshold-seconds');
  return {
    execute: args.includes('--execute'),
    limit:
      limitArg !== -1 && args[limitArg + 1]
        ? parseInt(args[limitArg + 1], 10)
        : null,
    thresholdSeconds:
      thresholdArg !== -1 && args[thresholdArg + 1]
        ? parseInt(args[thresholdArg + 1], 10)
        : 60,
    help: args.includes('--help') || args.includes('-h'),
  };
}

function showHelp(): void {
  console.log(`
Usage: tsx scripts/backfill-endtimes.ts [options]

Re-runs the LLM-primary endtime pipeline against every unsettled
Polymarket-sourced condition in the Sapience DB and writes back any
endTime that changed by more than --threshold-seconds. Default is
dry-run; pass --execute to actually write.

Options:
  --execute               Submit changes (default: dry-run, prints only)
  --limit N               Cap the number of conditions processed (sorted by
                          createdAt asc — oldest first). Useful for the
                          first cautious live run.
  --threshold-seconds N   Only submit when |new - current| > N (default 60).
                          Filters out trivial precision differences.
  --help, -h              Show this help.

Environment Variables (required for --execute):
  SAPIENCE_API_URL        API URL (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY       64-char hex private key for signing admin requests
  OPENROUTER_API_KEY      Required (LLM is the primary source)
  LLM_ENABLED=true        Must be on for the script to run Sonar
`);
}

interface PageItem {
  id: string;
  question: string;
  description: string;
  endTime: number;
}

/**
 * Fetch every unsettled, PM-sourced condition (one with non-empty
 * similarMarkets). Returns id + the fields the pipeline needs to recompute
 * endTime. Deterministic ascending createdAt order so --limit picks the
 * oldest first (most likely to predate the new pipeline).
 */
async function fetchUnsettledPmConditions(
  apiUrl: string,
  maxResults: number | null
): Promise<PageItem[]> {
  const graphqlUrl = apiUrl.replace(/\/+$/, '') + '/graphql';
  const PAGE_SIZE = 100;
  const out: PageItem[] = [];
  const seen = new Set<string>();
  let skip = 0;
  let lastSize = 0;
  let zeroGrowthStreak = 0;

  while (true) {
    const query = `
      query BackfillCandidates($filters: ConditionFilters!, $take: Int!, $skip: Int!) {
        conditionsPage(filters: $filters, take: $take, skip: $skip, orderBy: CREATED_AT, orderDirection: asc) {
          hasMore
          items {
            id
            question
            description
            endTime
          }
        }
      }
    `;
    const response = await fetchWithRetry(graphqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {
          filters: {
            settled: false,
            visibility: 'PUBLIC',
            hasSimilarMarkets: true,
          },
          take: PAGE_SIZE,
          skip,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(
        `GraphQL conditionsPage failed: HTTP ${response.status} ${response.statusText}`
      );
    }
    const result = (await response.json()) as {
      data?: {
        conditionsPage?: {
          hasMore?: boolean | null;
          items?: Array<{
            id: string;
            question: string;
            description: string | null;
            endTime: number;
          }>;
        };
      };
    };
    const items = result.data?.conditionsPage?.items ?? [];
    const hasMore = result.data?.conditionsPage?.hasMore ?? false;
    for (const c of items) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({
        id: c.id,
        question: c.question,
        description: c.description ?? '',
        endTime: c.endTime,
      });
      if (maxResults !== null && out.length >= maxResults) return out;
    }
    // Safety: same infinite-loop guard as refresh-imminent-tag — break out
    // if hasMore=true keeps lying while the result set stops growing.
    if (out.length === lastSize) {
      zeroGrowthStreak++;
      if (zeroGrowthStreak >= 3) {
        logError(
          `[Backfill] WARN: 3 consecutive pages added 0 unique rows (hasMore=${hasMore}, skip=${skip}); aborting pagination to avoid an infinite loop`
        );
        break;
      }
    } else {
      zeroGrowthStreak = 0;
    }
    lastSize = out.length;
    if (!hasMore) break;
    skip += PAGE_SIZE;
  }
  return out;
}

/**
 * Build a synthetic SapienceCondition from the DB row + Polymarket Gamma
 * data. Only the fields decideEndTime reads need to be populated; the rest
 * carry placeholders.
 */
function buildSyntheticCondition(
  row: PageItem,
  pm: PolymarketMarket,
  llmResult: LlmEndTimeResult | undefined
): SapienceCondition {
  const regexEndTime = extractEndTime(row.question, row.description);
  return {
    conditionHash: row.id,
    question: row.question,
    shortName: row.question,
    categorySlug: 'unknown',
    endDate: pm.endDate,
    description: row.description,
    similarMarkets: [],
    tags: [],
    chainId: 0, // unused by decideEndTime
    endTimeOverride: regexEndTime ?? undefined,
    llmEndTime: llmResult,
    isTemplated: isTemplatedMarket(pm),
  };
}

export async function main(): Promise<void> {
  const options = parseArgs();
  if (options.help) {
    showHelp();
    return;
  }

  const apiUrl = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;
  const rawPrivateKey = process.env.ADMIN_PRIVATE_KEY;

  log(`[Backfill] API: ${apiUrl}`);
  log(`[Backfill] Mode: ${options.execute ? 'EXECUTE' : 'DRY-RUN'}`);
  log(`[Backfill] Threshold: ${options.thresholdSeconds}s`);
  if (options.limit !== null) {
    log(`[Backfill] Limit: ${options.limit} conditions`);
  }

  let privateKey: `0x${string}` | undefined;
  if (options.execute) {
    try {
      privateKey = validatePrivateKey(rawPrivateKey);
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
    await confirmProductionAccess(apiUrl);
  }

  // 1. Fetch active PM-sourced conditions
  log(`[Backfill] Fetching unsettled PM-sourced conditions...`);
  const rows = await fetchUnsettledPmConditions(apiUrl, options.limit);
  log(`[Backfill] Got ${rows.length} candidate conditions`);

  if (rows.length === 0) {
    log(`[Backfill] Nothing to do.`);
    return;
  }

  // 2. Re-fetch Polymarket markets via Gamma (chunks internally)
  log(
    `[Backfill] Re-fetching Polymarket Gamma data for ${rows.length} conditions...`
  );
  const pmMap = await fetchMarketsByConditionIds(rows.map((r) => r.id));
  log(
    `[Backfill] Gamma returned ${pmMap.size}/${rows.length} markets (others may be delisted)`
  );

  // Filter to only conditions where Gamma returned data
  const present = rows.filter((r) => pmMap.has(r.id));
  log(`[Backfill] Will process ${present.length} markets`);

  // 3. Build PolymarketMarket list for Sonar
  const polymarketMarkets: PolymarketMarket[] = present.map(
    (r) => pmMap.get(r.id)!
  );

  // 4. Sonar — runs on every market under the new pipeline (no regex-first gate)
  if (!LLM_ENDTIME_SEARCH_ENABLED || !OPENROUTER_API_KEY) {
    log(
      `[Backfill] WARNING: LLM disabled (LLM_ENABLED=${process.env.LLM_ENABLED}, hasKey=${!!OPENROUTER_API_KEY}). Backfill will use pm-fallback for everything.`
    );
  }
  const llmMap = await enrichEndTimesWithLLM(polymarketMarkets, {
    enabled: LLM_ENDTIME_SEARCH_ENABLED,
    apiKey: OPENROUTER_API_KEY,
    model: LLM_ENDTIME_MODEL,
  });

  // 5. Compute decision per condition, build diff list
  type Diff = {
    id: string;
    question: string;
    oldEndTime: number;
    newEndTime: number;
    deltaSeconds: number;
    source: string;
  };
  const diffs: Diff[] = [];
  const sourceCounts: Record<string, number> = {};

  for (const row of present) {
    const pm = pmMap.get(row.id)!;
    const llm = llmMap.get(row.id);
    const synthetic = buildSyntheticCondition(row, pm, llm);
    let decision;
    try {
      decision = decideEndTime(synthetic);
    } catch (e) {
      logError(
        `[Backfill] skip ${row.id.slice(0, 10)}…: ${e instanceof Error ? e.message : String(e)}`
      );
      continue;
    }
    sourceCounts[decision.source] = (sourceCounts[decision.source] ?? 0) + 1;
    const deltaSeconds = decision.ts - row.endTime;
    if (Math.abs(deltaSeconds) > options.thresholdSeconds) {
      diffs.push({
        id: row.id,
        question: row.question,
        oldEndTime: row.endTime,
        newEndTime: decision.ts,
        deltaSeconds,
        source: decision.source,
      });
    }
  }

  log(`\n[Backfill] Decision source distribution:`);
  for (const [src, n] of Object.entries(sourceCounts)) {
    log(`  ${src}: ${n}`);
  }
  log(
    `\n[Backfill] ${diffs.length} conditions would change by more than ${options.thresholdSeconds}s`
  );

  // Sort largest absolute drift first
  diffs.sort((a, b) => Math.abs(b.deltaSeconds) - Math.abs(a.deltaSeconds));

  // Print top 50 drifts
  const showN = Math.min(50, diffs.length);
  if (showN > 0) {
    log(`\n[Backfill] Top ${showN} drifts:`);
    for (const d of diffs.slice(0, showN)) {
      const oldIso = new Date(d.oldEndTime * 1000).toISOString();
      const newIso = new Date(d.newEndTime * 1000).toISOString();
      const deltaH = (d.deltaSeconds / 3600).toFixed(2);
      log(
        `  ${d.id.slice(0, 10)}… [${d.source.padEnd(15)}] ${oldIso} → ${newIso} (Δ ${deltaH}h)`
      );
      log(`    "${d.question.slice(0, 100)}"`);
    }
    if (diffs.length > showN) {
      log(`  ... and ${diffs.length - showN} more`);
    }
  }

  if (!options.execute) {
    log(
      `\n[Backfill] DRY-RUN: no changes submitted. Re-run with --execute to apply.`
    );
    return;
  }

  if (diffs.length === 0) {
    log(`\n[Backfill] Nothing to submit.`);
    return;
  }

  // 6. Submit
  log(`\n[Backfill] Submitting ${diffs.length} endTime updates...`);
  await submitMetadataUpdates(
    apiUrl,
    privateKey!,
    diffs.map((d) => ({
      conditionId: d.id,
      fields: { endTime: d.newEndTime },
    }))
  );
  log(`[Backfill] Done.`);
}
