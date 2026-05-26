/**
 * Query.popularTags — top 20 most-used tags across public conditions,
 * excluding a hard-coded deny list of internal/meta tags that flow in
 * from Polymarket metadata.
 *
 * Reads from the `popular_tag` materialized table (refreshed by the
 * keeper via `refreshPopularTags`) — that turns the resolver into a
 * 20-row index scan vs. the `unnest(tags)` aggregation over the entire
 * `condition` table.
 *
 * Fallback: when the table is empty (fresh deploy, before the keeper
 * has populated it), the resolver computes the list inline and writes
 * it back so callers don't get a temporarily empty surface. The
 * in-process TTL stays in place to absorb the cold-start fan-in.
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { TtlCache } from '../../../../lib/ttlCache';
import { CACHE_HINTS, setCacheHint } from '../../../v2/cacheHints';

const popularTagsCache = new TtlCache<string, string[]>({
  ttlMs: 60 * 60 * 1000,
});
/** Versioned so old caches invalidate when the deny list / SQL changes. */
const CACHE_KEY = 'popularTags:v2';

const computePopularTags = async (): Promise<string[]> => {
  const result = await prisma.$queryRaw<{ tag: string; cnt: bigint }[]>`
      SELECT t AS tag, COUNT(*) AS cnt
      FROM condition, unnest(tags) AS t
      WHERE public = true
        AND array_length(tags, 1) > 0
        AND t NOT LIKE 'Rewards%'
        AND t NOT LIKE 'Finance Rewards%'
        AND t NOT IN (
          'Hide From New', 'Recurring', 'Weekly', 'Monthly',
          'Monthly Hit', 'Multi Strikes', 'Neg Risk', 'Hit Price',
          'Daily Temperature', 'Precipitation',
          'Tweet Markets', 'Crypto Prices', 'Games'
        )
      GROUP BY t
      ORDER BY cnt DESC
      LIMIT 20
    `;
  return result.map((r) => r.tag);
};

/**
 * Recompute the materialized list and overwrite the `popular_tag`
 * table. Idempotent; safe to invoke from a keeper cron at any cadence
 * (recommended: same window as condition_group aggregate refresh).
 */
export const refreshPopularTags = async (): Promise<string[]> => {
  const result = await prisma.$queryRaw<{ tag: string; cnt: bigint }[]>`
      SELECT t AS tag, COUNT(*) AS cnt
      FROM condition, unnest(tags) AS t
      WHERE public = true
        AND array_length(tags, 1) > 0
        AND t NOT LIKE 'Rewards%'
        AND t NOT LIKE 'Finance Rewards%'
        AND t NOT IN (
          'Hide From New', 'Recurring', 'Weekly', 'Monthly',
          'Monthly Hit', 'Multi Strikes', 'Neg Risk', 'Hit Price',
          'Daily Temperature', 'Precipitation',
          'Tweet Markets', 'Crypto Prices', 'Games'
        )
      GROUP BY t
      ORDER BY cnt DESC
      LIMIT 20
    `;
  const rows = result.map((r, idx) => ({
    tag: r.tag,
    rank: idx,
    count: Number(r.cnt),
  }));
  await prisma.$transaction([
    prisma.popularTag.deleteMany({}),
    prisma.popularTag.createMany({ data: rows, skipDuplicates: true }),
  ]);
  popularTagsCache.clear();
  return rows.map((r) => r.tag);
};

export const popularTags: NonNullable<QueryResolvers['popularTags']> = async (
  _parent,
  _args,
  _ctx,
  info
) => {
  // The cache hint enables CDN edge caching and the bundled
  // responseCachePlugin's in-process result cache. 5min upper bound
  // matches the doc-recommended top-N refresh cadence.
  setCacheHint(info, CACHE_HINTS.STABLE_FIVE_MINUTES);
  const cached = popularTagsCache.get(CACHE_KEY);
  if (cached) return cached;

  const materialized = await prisma.popularTag.findMany({
    orderBy: { rank: 'asc' },
    take: 20,
    select: { tag: true },
  });
  if (materialized.length > 0) {
    const tags = materialized.map((r) => r.tag);
    popularTagsCache.set(CACHE_KEY, tags);
    return tags;
  }

  // Cold start: keeper hasn't populated the table yet. Compute inline
  // so the surface isn't empty; the keeper will overwrite later.
  const tags = await computePopularTags();
  popularTagsCache.set(CACHE_KEY, tags);
  return tags;
};

/** Test-only: clear cache between test cases. */
export const __clearPopularTagsCache = () => popularTagsCache.clear();
