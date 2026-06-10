import { cryptoEndTime } from './crypto';
import { snapshotEndTime } from './snapshot';
import { socialEndTime } from './social';
import { sportsEndTime } from './sports';
import { weatherEndTime } from './weather';

/**
 * Specialized endTime extractor for templated Polymarket families
 * (mention/social-post / weather / crypto / sports). `tag` (sourceTagSlug)
 * routes the tag-keyed families; when unknown it tries each in turn. Returns
 * unix SECONDS (matching extractEndTime), or null when no specialized pattern
 * applies — so callers can fall back to the general extractor.
 */
export function extractCategoryEndTime(
  question: string,
  description: string,
  tag?: string | null
): number | null {
  const q = question ?? '';
  const d = description ?? '';
  // Signature-driven, NOT tag-keyed: the mention ("What will X say") and
  // social-post-count ("# tweets / # posts") families live under
  // trump/politics/null tags, so we try them for every tag. The extractor is
  // anchored on the exact resolution sentence, so it declines cleanly on
  // everything else and can safely run first.
  const social = socialEndTime(q, d);
  if (social != null) return social;
  const snapshot = snapshotEndTime(q, d);
  if (snapshot != null) return snapshot;
  if (tag === 'weather') return weatherEndTime(q, d);
  if (tag === 'sports') return sportsEndTime(q);
  if (tag === 'crypto') return cryptoEndTime(q);
  // Unknown tag: try each family. Known non-target category: decline (so the
  // general extractor handles it) rather than misapply crypto date-patterns.
  if (tag == null)
    return weatherEndTime(q, d) ?? cryptoEndTime(q) ?? sportsEndTime(q);
  return null;
}

export {
  weatherEndTime,
  cryptoEndTime,
  sportsEndTime,
  socialEndTime,
  snapshotEndTime,
};
