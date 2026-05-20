/**
 * One-shot backfill: walk every public condition, apply the per-word
 * Title Case normalizer to its tags array, and submit changed rows via
 * PUT /admin/conditions/batch-metadata. Idempotent — a second run
 * reports zero updates.
 *
 * Backfills settled rows too because `popularTags` and SQL prefix
 * filters in graphql/sdl/resolvers/queries/questions.ts don't filter on
 * `settled`, so case-consistency on legacy data matters for those reads.
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
import { normalizeTagLabel } from '../generate/tags';

interface BackfillCLIOptions {
  dryRun: boolean;
  limit: number | null;
  help: boolean;
}

const DEFAULT_DRY_RUN_LIMIT = 1000;

function parseArgs(): BackfillCLIOptions {
  const args = process.argv.slice(2);
  const limitIdx = args.findIndex((a) => a === '--limit');
  const dryRun = args.includes('--dry-run');
  const explicitLimit =
    limitIdx !== -1 && args[limitIdx + 1]
      ? parseInt(args[limitIdx + 1], 10)
      : null;
  return {
    dryRun,
    limit: explicitLimit ?? (dryRun ? DEFAULT_DRY_RUN_LIMIT : null),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function showHelp(): void {
  console.log(`
Usage: tsx scripts/backfill-tag-casing.ts [options]

Walks every public condition and renormalizes its tags using the
per-word Title Case rule with acronym guard (e.g. "Primary elections" →
"Primary Elections", "UFC" stays "UFC"). Rows whose tags are already
correct are skipped.

Options:
  --dry-run      Show what would change without submitting.
                 Defaults to fetching only ${DEFAULT_DRY_RUN_LIMIT} conditions; override with --limit.
  --limit N      Cap the number of conditions fetched (sorted by createdAt desc).
                 Default: ${DEFAULT_DRY_RUN_LIMIT} in --dry-run, unlimited in live mode.
  --help, -h     Show this help

Environment Variables (required for live run):
  SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
  ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests
`);
}

interface PageItem {
  id: string;
  tags: string[];
}

async function fetchAllPublicConditions(
  apiUrl: string,
  maxResults: number | null
): Promise<PageItem[]> {
  const graphqlUrl = apiUrl.replace(/\/+$/, '') + '/graphql';
  const PAGE_SIZE = 100;
  const out: PageItem[] = [];
  const seen = new Set<string>();
  let after: string | null = null;
  let pageCount = 0;
  let lastSize = 0;
  let zeroGrowthStreak = 0;

  // Uses the Relay-shaped `conditionsConnection` resolver. `filter:
  // { visibility: PUBLIC }` covers both settled and unsettled public
  // rows — we want case-consistency across the whole public set.
  const query = `
    query TagBackfillCandidates($filter: ConditionFilter!, $first: Int!, $after: String) {
      conditionsConnection(filter: $filter, first: $first, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes {
          id
          tags
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  while (true) {
    pageCount++;
    const pageStart = Date.now();
    const response = await fetchWithRetry(graphqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {
          filter: { visibility: 'PUBLIC' },
          first: PAGE_SIZE,
          after,
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable body)');
      throw new Error(
        `GraphQL conditionsConnection failed: HTTP ${response.status} ${response.statusText}\nResponse body: ${body.slice(0, 2000)}`
      );
    }
    const result = (await response.json()) as {
      data?: {
        conditionsConnection?: {
          nodes?: Array<{ id: string; tags: string[] }>;
          pageInfo?: {
            hasNextPage?: boolean | null;
            endCursor?: string | null;
          } | null;
        };
      };
      errors?: Array<{ message: string }>;
    };
    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `GraphQL conditionsConnection returned errors: ${JSON.stringify(result.errors, null, 2)}`
      );
    }
    const nodes = result.data?.conditionsConnection?.nodes ?? [];
    const pageInfo = result.data?.conditionsConnection?.pageInfo;
    const hasMore = pageInfo?.hasNextPage ?? false;
    for (const c of nodes) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ id: c.id, tags: c.tags ?? [] });
      if (maxResults !== null && out.length >= maxResults) {
        log(
          `[TagBackfill]   page ${pageCount}: fetched ${nodes.length} (cumulative ${out.length}, ${Date.now() - pageStart}ms) — hit --limit ${maxResults}, stopping`
        );
        return out;
      }
    }
    log(
      `[TagBackfill]   page ${pageCount}: fetched ${nodes.length} (cumulative ${out.length}, ${Date.now() - pageStart}ms, hasMore=${hasMore})`
    );
    // Zero-growth abort guard: cursor pagination shouldn't loop, but
    // protect against a server-side bug that re-emits the same cursor.
    if (out.length === lastSize) {
      zeroGrowthStreak++;
      if (zeroGrowthStreak >= 3) {
        logError(
          `[TagBackfill] WARN: 3 consecutive pages added 0 unique rows (hasMore=${hasMore}, after=${after}); aborting pagination to avoid an infinite loop`
        );
        break;
      }
    } else {
      zeroGrowthStreak = 0;
    }
    lastSize = out.length;
    if (!hasMore) break;
    after = pageInfo?.endCursor ?? null;
    if (!after) break;
  }
  return out;
}

function tagsEqualOrdered(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
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

  log(`[TagBackfill] ==============================================`);
  log(`[TagBackfill] API:     ${apiUrl}`);
  log(`[TagBackfill] Mode:    ${options.dryRun ? 'DRY-RUN' : 'LIVE'}`);
  log(
    `[TagBackfill] Limit:   ${options.limit === null ? 'unlimited' : options.limit}`
  );
  log(`[TagBackfill] ==============================================`);

  let privateKey: `0x${string}` | undefined;
  if (!options.dryRun) {
    try {
      privateKey = validatePrivateKey(rawPrivateKey);
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
    log(`[TagBackfill] Confirming prod access (LIVE mode)...`);
    await confirmProductionAccess(apiUrl);
  }

  log(`[TagBackfill] [1/3] Fetching public conditions...`);
  const fetchStart = Date.now();
  const conditions = await fetchAllPublicConditions(apiUrl, options.limit);
  log(
    `[TagBackfill] [1/3] Fetched ${conditions.length} conditions in ${((Date.now() - fetchStart) / 1000).toFixed(1)}s`
  );

  log(`[TagBackfill] [2/3] Renormalizing tags...`);
  type Update = {
    id: string;
    oldTags: string[];
    newTags: string[];
  };
  const updates: Update[] = [];
  // Track unique rename transitions for a clearer summary.
  const renameCounts = new Map<string, number>();

  for (const c of conditions) {
    const newTags = c.tags.map(normalizeTagLabel);
    if (!tagsEqualOrdered(c.tags, newTags)) {
      updates.push({ id: c.id, oldTags: c.tags, newTags });
      for (let i = 0; i < c.tags.length; i++) {
        if (c.tags[i] !== newTags[i]) {
          const key = `${c.tags[i]} → ${newTags[i]}`;
          renameCounts.set(key, (renameCounts.get(key) ?? 0) + 1);
        }
      }
    }
  }

  log(
    `[TagBackfill] [2/3] ${updates.length} rows have at least one tag to rename (${conditions.length - updates.length} unchanged)`
  );

  if (renameCounts.size > 0) {
    const ranked = [...renameCounts.entries()].sort((a, b) => b[1] - a[1]);
    log(`[TagBackfill] Tag transitions (count × "old → new"):`);
    for (const [transition, count] of ranked) {
      log(`  ${String(count).padStart(5)} × "${transition}"`);
    }
  }

  const sample = updates.slice(0, 10);
  if (sample.length > 0) {
    log(
      `[TagBackfill] Sample rows (first ${sample.length} of ${updates.length}):`
    );
    for (const u of sample) {
      log(
        `  ${u.id.slice(0, 10)}… ${JSON.stringify(u.oldTags)} → ${JSON.stringify(u.newTags)}`
      );
    }
    if (updates.length > sample.length) {
      log(`  ... and ${updates.length - sample.length} more`);
    }
  }

  if (options.dryRun) {
    log(
      `[TagBackfill] [3/3] DRY-RUN: no changes submitted. Re-run without --dry-run to apply.`
    );
    log(
      `[TagBackfill] Total wall-clock: ${((Date.now() - runStart) / 1000).toFixed(1)}s`
    );
    return;
  }

  if (updates.length === 0) {
    log(`[TagBackfill] [3/3] No changes needed (idempotent re-run).`);
    log(
      `[TagBackfill] Total wall-clock: ${((Date.now() - runStart) / 1000).toFixed(1)}s`
    );
    return;
  }

  log(`[TagBackfill] [3/3] Submitting ${updates.length} tag updates...`);
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
    `[TagBackfill] [3/3] Submit done in ${((Date.now() - submitStart) / 1000).toFixed(1)}s`
  );
  log(
    `[TagBackfill] Total wall-clock: ${((Date.now() - runStart) / 1000).toFixed(1)}s`
  );
}
