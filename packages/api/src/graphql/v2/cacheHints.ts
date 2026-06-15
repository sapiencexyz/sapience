/**
 * Helpers for setting Apollo Server cache hints from inside resolvers.
 *
 * The `httpCacheHeadersPlugin` already translates Apollo's
 * `overallCachePolicy.maxAge` into `Cache-Control: s-maxage=...` on the
 * outgoing response, and the bundled `responseCachePlugin` uses it to
 * cache the response in-process. The piece missing on v2 has been the
 * upstream signal: nothing in the resolver layer was telling Apollo
 * what's actually cacheable.
 *
 * Setting hints programmatically (rather than via SDL `@cacheControl`
 * directives) keeps the directive-definition surface out of the v2 SDL
 * for now and limits the change to one explicit line per cacheable
 * resolver. Types are inlined to avoid pulling in
 * `@apollo/cache-control-types` as a direct dependency — Apollo Server
 * exposes the same shape on `info.cacheControl` at runtime.
 */

import type { GraphQLResolveInfo } from 'graphql';

type CacheScope = 'PUBLIC' | 'PRIVATE';

export interface CacheHintOptions {
  /** Seconds the response stays fresh. Required. */
  maxAge: number;
  /** `PUBLIC` (shareable across sessions) or `PRIVATE`. Defaults to PUBLIC. */
  scope?: CacheScope;
}

interface InfoCacheControl {
  setCacheHint?: (hint: { maxAge?: number; scope?: CacheScope }) => void;
}

/**
 * Apply a cache hint from inside a resolver. Safe to call when cache
 * control isn't wired up (unit tests, introspection); the helper is a
 * no-op rather than throwing.
 */
export const setCacheHint = (
  info: GraphQLResolveInfo | null | undefined,
  options: CacheHintOptions
): void => {
  if (!info) return;
  const cacheControl = (info as unknown as { cacheControl?: InfoCacheControl })
    .cacheControl;
  if (!cacheControl?.setCacheHint) return;
  cacheControl.setCacheHint({
    maxAge: options.maxAge,
    scope: options.scope ?? 'PUBLIC',
  });
};

/** Common hint presets so call sites stay consistent. */
export const CACHE_HINTS = {
  /** 60s — backed by a once-per-minute snapshot writer. */
  SNAPSHOT_MINUTE: { maxAge: 60 } as const,
  /** 5min — slowly-changing lists (categories, top-N tags). */
  STABLE_FIVE_MINUTES: { maxAge: 300 } as const,
  /** 1h — statically configured catalogs. */
  STATIC_ONE_HOUR: { maxAge: 3600 } as const,
} satisfies Record<string, CacheHintOptions>;
