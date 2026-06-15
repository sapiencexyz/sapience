/**
 * Query.popularTags — top 20 most-used tags across public conditions,
 * excluding a hard-coded deny list of internal/meta tags that flow in
 * from Polymarket metadata.
 *
 * Reads from the `popular_tag` materialized table — that turns the
 * resolver into a 20-row index scan vs. the `unnest(tags)` aggregation
 * over the entire `condition` table.
 *
 * There is no scheduled refresher: reads keep the materialization
 * alive. When the table is empty (fresh deploy) or its newest row is
 * older than POPULAR_TAGS_MAX_AGE_MS, the resolver recomputes inline
 * via `refreshPopularTags` and writes the result back, so callers
 * never see an empty or permanently frozen surface. The in-process
 * TTL stays in place to absorb the refresh fan-in.
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { TtlCache } from '../../../../lib/ttlCache';
import { CACHE_HINTS, setCacheHint } from '../../../v2/cacheHints';

const popularTagsCache = new TtlCache<string, string[]>({
  ttlMs: 60 * 60 * 1000,
});
/** Versioned so old caches invalidate when the deny list / SQL changes. */
const CACHE_KEY = 'popularTags:v1';

/**
 * Max age of the materialization before a read triggers an inline
 * refresh. Matches the in-process TTL cache above so the two layers
 * expire on the same cadence.
 */
export const POPULAR_TAGS_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * True when the materialized rows are absent or their newest
 * `refreshedAt` is older than POPULAR_TAGS_MAX_AGE_MS. Shared by the
 * v1 `popularTags` and v2 `tags` resolvers so both endpoints refresh
 * on the same staleness rule.
 */
export const isPopularTagsStale = (
  rows: ReadonlyArray<{ refreshedAt: Date }>
): boolean => {
  if (rows.length === 0) return true;
  const newest = Math.max(...rows.map((r) => r.refreshedAt.getTime()));
  return Date.now() - newest >= POPULAR_TAGS_MAX_AGE_MS;
};

/**
 * Recompute the materialized list and overwrite the `popular_tag`
 * table. In-process callers are coalesced onto one in-flight refresh,
 * so a stampede of stale reads recomputes once. Cross-process overlap
 * is tolerated rather than locked: concurrent runs compute
 * near-identical sets seconds apart, and `skipDuplicates` keeps a
 * colliding insert from aborting either transaction.
 */
let refreshInFlight: Promise<string[]> | null = null;

export const refreshPopularTags = (): Promise<string[]> => {
  refreshInFlight ??= doRefreshPopularTags().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};

const doRefreshPopularTags = async (): Promise<string[]> => {
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
    select: { tag: true, refreshedAt: true },
  });
  if (!isPopularTagsStale(materialized)) {
    const tags = materialized.map((r) => r.tag);
    popularTagsCache.set(CACHE_KEY, tags);
    return tags;
  }

  // Empty (fresh deploy) or stale: recompute and write back so this
  // and the v2 `tags` endpoint both serve a current set.
  const tags = await refreshPopularTags();
  popularTagsCache.set(CACHE_KEY, tags);
  return tags;
};

/** Test-only: clear cache between test cases. */
export const __clearPopularTagsCache = () => popularTagsCache.clear();
