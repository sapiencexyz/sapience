#!/usr/bin/env tsx
/**
 * Backfill tags on existing conditions from Polymarket event data.
 *
 * NOTE: Run this AFTER merging PR #1363 (feat/index-polymarket-tags),
 * which adds the `tags` field to the Condition model and GraphQL schema.
 *
 * Extracts event slugs from condition.similarMarkets URLs,
 * fetches tags from Polymarket's /events endpoint per slug,
 * and updates conditions via the Sapience admin PUT API.
 *
 * Usage:
 *   pnpm --filter market-keeper exec tsx scripts/backfill-tags.ts              # dry run
 *   pnpm --filter market-keeper exec tsx scripts/backfill-tags.ts --execute    # apply updates
 *
 * Environment:
 *   ADMIN_PRIVATE_KEY  — required for --execute mode
 *   SAPIENCE_API_URL   — optional, defaults to https://api.sapience.xyz
 */

import { getAdminAuthHeaders, validatePrivateKey } from '../src/utils';
import { fetchWithRetry } from '../src/utils/fetch';
import { DEFAULT_SAPIENCE_API_URL } from '../src/constants';

const API_URL = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;
const EXECUTE = process.argv.includes('--execute');
const GQL_PAGE_SIZE = 100;
const DELAY_MS = 100;

// ── types ────────────────────────────────────────────────────────────────────

interface ConditionRow {
  id: string;
  question: string;
  similarMarkets: string[];
  tags: string[];
}

interface PolymarketEvent {
  slug?: string;
  tags?: Array<{ label?: string; slug?: string }>;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract event slug from a similarMarkets URL.
 *   https://polymarket.com/event/{eventSlug}#{marketSlug}
 *   https://polymarket.com#{eventSlug}
 */
function extractEventSlug(url: string): string | null {
  const match = url.match(/polymarket\.com(?:\/event\/([^#/?]+))?#(.+)/);
  if (match) return match[1] || match[2];
  return null;
}

// ── fetch conditions via GraphQL ─────────────────────────────────────────────

async function fetchAllConditions(): Promise<ConditionRow[]> {
  const all: ConditionRow[] = [];
  let skip = 0;

  while (true) {
    const query = `{
      conditions(take: ${GQL_PAGE_SIZE}, skip: ${skip}) {
        id
        question
        similarMarkets
        tags
      }
    }`;

    const res = await fetchWithRetry(`${API_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GraphQL failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    const page: ConditionRow[] = json.data?.conditions ?? [];
    all.push(...page);

    if (page.length < GQL_PAGE_SIZE) break;
    skip += GQL_PAGE_SIZE;

    if (skip % 500 === 0) {
      console.log(`  Fetched ${all.length} conditions so far…`);
    }
  }

  return all;
}

// ── fetch tags from Polymarket by slug ───────────────────────────────────────

async function fetchTagsForSlugs(
  slugs: string[]
): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>();

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    try {
      const url = `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`;
      const res = await fetchWithRetry(url, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        console.warn(`  [Tags] HTTP ${res.status} for slug "${slug}"`);
        continue;
      }

      const events: PolymarketEvent[] = await res.json();
      for (const event of events) {
        if (!event.slug) continue;
        const labels = (event.tags ?? [])
          .map((t) => t.label)
          .filter((l): l is string => !!l && l !== 'All');
        if (labels.length > 0) {
          tagMap.set(event.slug, [...new Set(labels)]);
        }
      }
    } catch (err) {
      console.warn(`  [Tags] Error for slug "${slug}":`, err);
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));

    if ((i + 1) % 100 === 0) {
      console.log(`  Fetched tags for ${i + 1}/${slugs.length} slugs…`);
    }
  }

  return tagMap;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rawKey = process.env.ADMIN_PRIVATE_KEY;
  const privateKey = rawKey ? validatePrivateKey(rawKey) : undefined;

  if (EXECUTE && !privateKey) {
    console.error('ADMIN_PRIVATE_KEY is required for --execute mode');
    process.exit(1);
  }

  console.log(`API: ${API_URL}`);
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}\n`);

  // 1. Fetch all conditions
  console.log('Fetching all conditions…');
  const allConditions = await fetchAllConditions();
  console.log(`Found ${allConditions.length} total conditions`);

  // 2. Filter to those with empty tags
  const needsBackfill = allConditions.filter(
    (c) => !c.tags || c.tags.length === 0
  );
  console.log(`${needsBackfill.length} conditions need tag backfill\n`);

  if (needsBackfill.length === 0) {
    console.log('Nothing to backfill!');
    return;
  }

  // 3. Extract event slugs from similarMarkets URLs
  const slugToConditions = new Map<string, ConditionRow[]>();
  let noSlugCount = 0;

  for (const c of needsBackfill) {
    let eventSlug: string | null = null;
    for (const url of c.similarMarkets) {
      eventSlug = extractEventSlug(url);
      if (eventSlug) break;
    }
    if (eventSlug) {
      const list = slugToConditions.get(eventSlug) ?? [];
      list.push(c);
      slugToConditions.set(eventSlug, list);
    } else {
      noSlugCount++;
    }
  }

  console.log(`${slugToConditions.size} unique event slugs`);
  if (noSlugCount > 0) {
    console.log(`${noSlugCount} conditions have no Polymarket event slug (skipped)`);
  }

  // 4. Fetch tags from Polymarket by slug
  console.log('\nFetching tags from Polymarket…');
  const uniqueSlugs = [...slugToConditions.keys()];
  const eventTagMap = await fetchTagsForSlugs(uniqueSlugs);
  console.log(`Got tags for ${eventTagMap.size}/${uniqueSlugs.length} event slugs\n`);

  // 5. Build update plan
  const updates: Array<{ condition: ConditionRow; tags: string[] }> = [];

  for (const [slug, conditions] of slugToConditions) {
    const tags = eventTagMap.get(slug);
    if (!tags || tags.length === 0) continue;
    for (const condition of conditions) {
      updates.push({ condition, tags });
    }
  }

  console.log(`${updates.length} conditions to update\n`);

  if (updates.length === 0) {
    console.log('No tag matches found.');
    return;
  }

  // 6. Dry run: show what would be updated
  if (!EXECUTE) {
    for (const { condition, tags } of updates.slice(0, 20)) {
      console.log(
        `  ${condition.id.slice(0, 10)}… "${condition.question.slice(0, 50)}" → [${tags.join(', ')}]`
      );
    }
    if (updates.length > 20) {
      console.log(`  … and ${updates.length - 20} more`);
    }
    console.log('\nDRY RUN complete. Run with --execute to apply.');
    return;
  }

  // 7. Execute updates (re-sign for each request so timestamp stays fresh)
  let updated = 0;
  let failed = 0;

  for (const { condition, tags } of updates) {
    try {
      const authHeaders = await getAdminAuthHeaders(privateKey!);
      const res = await fetchWithRetry(
        `${API_URL}/admin/conditions/${condition.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ tags }),
        }
      );

      if (res.ok) {
        updated++;
        if (updated % 50 === 0) {
          console.log(`  Progress: ${updated}/${updates.length} updated`);
        }
      } else {
        failed++;
        if (failed <= 5) {
          const text = await res.text().catch(() => '');
          console.error(`  [FAIL] ${condition.id}: HTTP ${res.status} — ${text}`);
        }
      }
    } catch (err) {
      failed++;
      if (failed <= 5) console.error(`  [ERROR] ${condition.id}:`, err);
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\n=== Done ===`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped (no tags found): ${needsBackfill.length - updates.length}`);
  console.log(`  No event slug: ${noSlugCount}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
