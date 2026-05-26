/**
 * Query.popularTags — top 20 most-used tags across public conditions,
 * excluding a hard-coded deny list of internal/meta tags that flow in
 * from Polymarket metadata.
 *
 * Wrapped in a 1h TTL cache: the underlying SQL does `unnest(tags)` over
 * every public condition row (full-table-ish scan), but tag distribution
 * shifts on the order of hours/days. One cached value serves all callers
 * since this resolver takes no arguments.
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

export const popularTags: NonNullable<QueryResolvers['popularTags']> = async (
  _parent,
  _args,
  _ctx,
  info
) => {
  // The in-process TTL above already collapses concurrent calls; the
  // cache hint additionally enables CDN edge caching and the bundled
  // responseCachePlugin's in-process result cache. 5min upper bound
  // matches the doc-recommended top-N refresh cadence.
  setCacheHint(info, CACHE_HINTS.STABLE_FIVE_MINUTES);
  const cached = popularTagsCache.get(CACHE_KEY);
  if (cached) return cached;

  const result = await prisma.$queryRaw<{ tag: string }[]>`
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
  const tags = result.map((r) => r.tag);
  popularTagsCache.set(CACHE_KEY, tags);
  return tags;
};

/** Test-only: clear cache between test cases. */
export const __clearPopularTagsCache = () => popularTagsCache.clear();
