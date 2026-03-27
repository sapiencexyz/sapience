#!/usr/bin/env node
/// <reference types="node" />
/**
 * One-off script: extend endTimes for all conditions past their endTime
 *
 * 1. Fetches all expired, unsettled, public conditions from Sapience
 * 2. Looks up their Polymarket market data (question, description, endDate)
 * 3. Runs the endTime pipeline (regex pre-pass + Sonar fallback)
 * 4. For each condition, takes max(currentDbEndTime, pipelineEndTime + buffer)
 * 5. Updates via PUT /admin/conditions/:id
 *
 * Usage:
 *   tsx scripts/extend-endtimes.ts              # dry run (default)
 *   tsx scripts/extend-endtimes.ts --execute     # apply updates
 */

import 'dotenv/config';
import {
  DEFAULT_SAPIENCE_API_URL,
  END_TIME_BUFFER_SECONDS,
  OPENROUTER_API_KEY,
  LLM_ENDTIME_MODEL,
} from '../src/constants.js';
import {
  validatePrivateKey,
  confirmProductionAccess,
  fetchWithRetry,
  log,
  logError,
} from '../src/utils/index.js';
import { getAdminAuthHeaders } from '../src/utils/auth.js';
import { enrichEndTimesWithLLM } from '../src/llm/enrichment.js';
import type { PolymarketMarket } from '../src/types/polymarket.js';

// ============ CLI ============

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !args.includes('--execute');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: tsx scripts/extend-endtimes.ts [options]

Extends endTimes for all expired, unsettled conditions in Sapience.
Runs the regex + Sonar pipeline against Polymarket data, then updates
each condition with max(currentEndTime, pipelineEndTime + 4h buffer).

Options:
  --dry-run    Show what would be updated without submitting (default)
  --execute    Apply updates
  --help, -h   Show this help message

Environment Variables:
  SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY    Hex private key for admin auth
  OPENROUTER_API_KEY   For Sonar endTime lookups
  LLM_ENABLED          Must be 'true' to use Sonar
`);
  process.exit(0);
}

// ============ Sapience API ============

interface ExpiredCondition {
  id: string;
  endTime: number;
  question: string;
  description: string;
}

const PAGE_SIZE = 100;

async function fetchExpiredConditions(
  apiUrl: string
): Promise<ExpiredCondition[]> {
  const graphqlUrl = apiUrl.replace(/\/+$/, '') + '/graphql';
  const nowTs = Math.floor(Date.now() / 1000);
  const all: ExpiredCondition[] = [];
  let skip = 0;

  while (true) {
    const query = `
      query ExpiredUnsettled($now: Int!, $take: Int!, $skip: Int!) {
        conditions(
          where: {
            AND: [
              { endTime: { lt: $now } }
              { settled: { equals: false } }
              { public: { equals: true } }
            ]
          }
          orderBy: { endTime: asc }
          take: $take
          skip: $skip
        ) {
          id
          endTime
          question
          description
        }
      }
    `;

    const response = await fetchWithRetry(graphqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { now: nowTs, take: PAGE_SIZE, skip },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`GraphQL failed: HTTP ${response.status} ${body.slice(0, 500)}`);
    }

    const result = (await response.json()) as {
      data?: { conditions?: ExpiredCondition[] };
      errors?: Array<{ message: string }>;
    };

    if (result.errors?.length) {
      throw new Error(
        `GraphQL errors: ${result.errors.map((e) => e.message).join('; ')}`
      );
    }

    const page = result.data?.conditions ?? [];
    all.push(...page);

    log(`[ExtendEndTimes]   Fetched ${all.length} conditions so far...`);

    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return all;
}

// ============ Polymarket Gamma API ============

async function fetchPolymarketMarkets(
  conditionIds: string[]
): Promise<Map<string, PolymarketMarket>> {
  const map = new Map<string, PolymarketMarket>();
  const BATCH_SIZE = 50;

  for (let i = 0; i < conditionIds.length; i += BATCH_SIZE) {
    const batch = conditionIds.slice(i, i + BATCH_SIZE);
    const url = `https://gamma-api.polymarket.com/markets?${batch.map((id) => `condition_ids=${id}`).join('&')}&limit=${BATCH_SIZE}`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        logError(
          `[Gamma] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: HTTP ${response.status}`
        );
        continue;
      }

      const markets = (await response.json()) as PolymarketMarket[];
      for (const m of markets) {
        map.set(m.conditionId, m);
      }
    } catch (error) {
      logError(
        `[Gamma] Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return map;
}

// ============ Update single condition endTime ============

async function updateConditionEndTime(
  apiUrl: string,
  privateKey: `0x${string}`,
  conditionId: string,
  newEndTime: number
): Promise<boolean> {
  const authHeaders = await getAdminAuthHeaders(privateKey);
  const response = await fetchWithRetry(
    `${apiUrl}/admin/conditions/${conditionId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ endTime: newEndTime }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logError(
      `[Update] ${conditionId} failed: HTTP ${response.status} — endTime=${newEndTime} (${new Date(newEndTime * 1000).toISOString()}) — ${body}`
    );
    return false;
  }
  return true;
}

// ============ Main ============

async function main() {
  const apiUrl = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;
  const rawKey = process.env.ADMIN_PRIVATE_KEY;

  let privateKey: `0x${string}` | undefined;
  try {
    privateKey = validatePrivateKey(rawKey);
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (!privateKey) {
    logError('ADMIN_PRIVATE_KEY is required');
    process.exit(1);
  }

  if (!dryRun) {
    await confirmProductionAccess(apiUrl);
  }

  // 1. Fetch expired conditions from Sapience
  log('[ExtendEndTimes] Fetching expired unsettled conditions...');
  const expired = await fetchExpiredConditions(apiUrl);
  log(`[ExtendEndTimes] Found ${expired.length} expired unsettled conditions`);

  if (expired.length === 0) {
    log('[ExtendEndTimes] Nothing to do');
    return;
  }

  // 2. Look up Polymarket market data for these conditions
  log('[ExtendEndTimes] Fetching Polymarket market data...');
  const conditionIds = expired.map((c) => c.id);
  const polyMarkets = await fetchPolymarketMarkets(conditionIds);
  log(
    `[ExtendEndTimes] Got Polymarket data for ${polyMarkets.size}/${expired.length} conditions`
  );

  // Build PolymarketMarket objects for the pipeline.
  // Use Polymarket's endDate when available (for the 14-day sanity check in
  // enrichEndTimesWithLLM). For conditions not found on Polymarket, synthesize
  // a minimal market object — set endDate to empty string so the sanity check
  // is skipped (enrichEndTimesWithLLM requires a truthy endDate to run it).
  const marketsForPipeline: PolymarketMarket[] = expired.map((c) => {
    const polyMarket = polyMarkets.get(c.id);
    if (polyMarket) return polyMarket;

    // Synthesize minimal market for regex extraction.
    // Empty endDate → sanity check skipped, regex result accepted as-is.
    return {
      id: c.id,
      conditionId: c.id,
      question: c.question,
      description: c.description,
      endDate: '',
      outcomes: '["Yes","No"]',
      volume: '0',
      liquidity: '0',
      slug: '',
      active: true,
      closed: false,
    };
  });

  // 3. Run endTime pipeline (regex + Sonar)
  log('[ExtendEndTimes] Running endTime pipeline (regex + Sonar)...');
  const pipelineEndTimes = await enrichEndTimesWithLLM(marketsForPipeline, {
    enabled: !!OPENROUTER_API_KEY,
    apiKey: OPENROUTER_API_KEY || undefined,
    model: LLM_ENDTIME_MODEL,
  });
  log(
    `[ExtendEndTimes] Pipeline produced endTimes for ${pipelineEndTimes.size}/${expired.length} conditions`
  );

  // 4. Compute new endTimes: max(currentDbEndTime, pipelineResult + buffer)
  const updates: Array<{
    id: string;
    question: string;
    currentEndTime: number;
    pipelineEndTime: number;
    newEndTime: number;
  }> = [];

  for (const condition of expired) {
    const pipelineTs = pipelineEndTimes.get(condition.id);
    if (pipelineTs === undefined) continue; // pipeline couldn't determine — skip

    const pipelineWithBuffer = pipelineTs + END_TIME_BUFFER_SECONDS;
    const newEndTime = Math.max(condition.endTime, pipelineWithBuffer);

    if (newEndTime <= condition.endTime) continue; // no improvement

    updates.push({
      id: condition.id,
      question: condition.question,
      currentEndTime: condition.endTime,
      pipelineEndTime: pipelineTs,
      newEndTime,
    });
  }

  log(
    `[ExtendEndTimes] ${updates.length} conditions have extended endTimes (${expired.length - pipelineEndTimes.size} skipped: no pipeline result, ${pipelineEndTimes.size - updates.length} skipped: no improvement)`
  );

  if (updates.length === 0) {
    log('[ExtendEndTimes] No updates to apply');
    return;
  }

  // 5. Print summary / apply updates
  const fmtTs = (ts: number) => new Date(ts * 1000).toISOString();

  const deltas = updates.map((u) => u.newEndTime - u.currentEndTime);
  const minDelta = Math.min(...deltas);
  const maxDelta = Math.max(...deltas);
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const medianDelta = [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)];

  // Bucket by extension size
  const buckets = { '<1d': 0, '1-3d': 0, '3-7d': 0, '7-14d': 0, '>14d': 0 };
  for (const d of deltas) {
    const days = d / 86400;
    if (days < 1) buckets['<1d']++;
    else if (days < 3) buckets['1-3d']++;
    else if (days < 7) buckets['3-7d']++;
    else if (days < 14) buckets['7-14d']++;
    else buckets['>14d']++;
  }

  const fmtDelta = (s: number) => {
    const d = s / 86400;
    return d >= 1 ? `${d.toFixed(1)}d` : `${(s / 3600).toFixed(1)}h`;
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${dryRun ? 'DRY RUN' : 'EXECUTING'}: ${updates.length} endTime extensions`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\n  Extension stats:`);
  console.log(`    min: ${fmtDelta(minDelta)}  max: ${fmtDelta(maxDelta)}  avg: ${fmtDelta(avgDelta)}  median: ${fmtDelta(medianDelta)}`);
  console.log(`    distribution: ${Object.entries(buckets).map(([k, v]) => `${k}: ${v}`).join('  ')}`);
  console.log(`    coverage: ${updates.length}/${expired.length} expired conditions (${((updates.length / expired.length) * 100).toFixed(0)}%)\n`);

  for (const u of updates) {
    const delta = u.newEndTime - u.currentEndTime;
    console.log(
      `  ${u.id.slice(0, 10)}... "${u.question.slice(0, 60)}${u.question.length > 60 ? '...' : ''}"`
    );
    console.log(
      `    current: ${fmtTs(u.currentEndTime)}  →  new: ${fmtTs(u.newEndTime)}  (+${fmtDelta(delta)})`
    );
  }

  if (dryRun) {
    console.log(`\nDry run complete. Re-run with --execute to apply.\n`);
    return;
  }

  // Apply updates
  let successCount = 0;
  let failCount = 0;

  for (const u of updates) {
    const ok = await updateConditionEndTime(apiUrl, privateKey, u.id, u.newEndTime);
    if (ok) {
      successCount++;
      log(`[Update] ${u.id.slice(0, 10)}... → ${fmtTs(u.newEndTime)}`);
    } else {
      failCount++;
    }
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  log(
    `[ExtendEndTimes] Done: ${successCount} updated, ${failCount} failed`
  );
}

main().catch((error) => {
  logError('Fatal error:', error);
  process.exit(1);
});
