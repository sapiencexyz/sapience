/**
 * `Query.protocol` — singleton entry point for protocol-wide stats and
 * breakdowns. Delegates to v1's stats helpers; `Protocol.statsHistory`
 * wraps the same fat-row pipeline in a forward-only Relay connection
 * (offset cursors; rows are already materialized in memory), while
 * `Protocol.stats` returns the single live/current `ProtocolStat`.
 *
 * `totalValueLocked` is computed by read-time aggregation across every
 * configured vault family (escrow + Σ undeployed available assets). The v1
 * `protocolStats` series scoped TVL to a single family and under-counted;
 * here both the live `stats` and each `statsHistory` row sum all families so
 * they agree.
 */

import type {
  ProtocolResolvers,
  QueryResolvers,
} from '../__generated__/resolvers';
import {
  buildConnection,
  clampTake,
  decodeCursor,
  encodeCursor,
} from '../relay/connection';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { normalizeLegacyEntry } from '@sapience/sdk/contracts';
import {
  protocolStats as v1ProtocolStats,
  openInterestByCategory as v1OIByCategory,
  openInterestByTimeToResolution as v1OIByTTR,
} from '../../sdl/resolvers/queries/analytics';
import {
  getConfiguredVaults,
  getLatestProtocolStats,
  getProtocolStatsTimeSeries,
  resolveSnapshotIntervalSeconds,
} from '../../../services/protocolStats';
import { CACHE_HINTS, setCacheHint } from '../cacheHints';

type V1Resolver = (parent: null, args: unknown, ctx: unknown) => unknown;

type V1StatRow = Record<string, unknown>;

const DAY = 86400;

// Fixed-width bucket sizes (seconds) for `statsHistory(interval:)`
// downsampling. MONTH is a fixed 30-day window (not calendar) — the analytics
// charts only request DAY, the rest are supported for completeness.
const INTERVAL_SECONDS: Record<string, number> = {
  HOUR: 3600,
  DAY,
  WEEK: 7 * DAY,
  MONTH: 30 * DAY,
};

// Maps v1's magic `bucket` int to the v2 `(min, max]` seconds-from-now
// window — left-exclusive, right-inclusive, matching the SQL `delta <= bound`
// ladder in `sdl/resolvers/queries/analytics.ts` (a prediction at exactly a
// boundary lands in the lower bucket). Must stay in sync with that ladder.
// Bucket 1's lower bound is null (it absorbs overdue predictions); bucket 7's
// upper bound is null (open-ended tail).
const TTR_BUCKET_BOUNDS: Record<
  number,
  { minSecondsFromNow: number | null; maxSecondsFromNow: number | null }
> = {
  1: { minSecondsFromNow: null, maxSecondsFromNow: DAY },
  2: { minSecondsFromNow: DAY, maxSecondsFromNow: 7 * DAY },
  3: { minSecondsFromNow: 7 * DAY, maxSecondsFromNow: 30 * DAY },
  4: { minSecondsFromNow: 30 * DAY, maxSecondsFromNow: 60 * DAY },
  5: { minSecondsFromNow: 60 * DAY, maxSecondsFromNow: 90 * DAY },
  6: { minSecondsFromNow: 90 * DAY, maxSecondsFromNow: 180 * DAY },
  7: { minSecondsFromNow: 180 * DAY, maxSecondsFromNow: null },
};

/**
 * Map a v1 protocolStats row to the public `ProtocolStat` wire shape. The
 * BigInt-typed volume / open-interest fields are passed through as their
 * source strings (the BigInt scalar serializes them); `totalValueLocked`
 * is supplied by the caller as an already-aggregated bigint. Renames v1's
 * `totalTradeCount` to the schema's `cumulativeTradeCount`.
 */
const mapProtocolStat = (row: V1StatRow, totalValueLocked: bigint) => ({
  timestamp: Number(row.timestamp ?? Math.floor(Date.now() / 1000)),
  cumulativeVolume: (row.cumulativeVolume as string) ?? '0',
  cumulativeTradeCount: Number(row.totalTradeCount ?? 0),
  periodVolume: (row.periodVolume as string) ?? '0',
  periodTradeCount: Number(row.periodTradeCount ?? 0),
  openInterest: (row.openInterest as string) ?? '0',
  escrowBalance: (row.escrowBalance as string) ?? '0',
  totalValueLocked,
});

/**
 * Live protocol TVL = chain-wide escrow + Σ undeployed available assets
 * across every configured vault family. escrowBalance is denormalized onto
 * each vault's snapshot, so take it once from the most-recent snapshot.
 */
const computeProtocolTvl = async (chainId: number): Promise<bigint> => {
  const snapshots = await Promise.all(
    getConfiguredVaults(chainId).map((v) =>
      getLatestProtocolStats(chainId, v.address.toLowerCase())
    )
  );
  let availableAssetsSum = 0n;
  let latestEscrow = 0n;
  let latestTimestamp = -1;
  for (const snapshot of snapshots) {
    if (!snapshot) continue;
    availableAssetsSum += BigInt(snapshot.vaultAvailableAssets || '0');
    if (snapshot.timestamp > latestTimestamp) {
      latestTimestamp = snapshot.timestamp;
      latestEscrow = BigInt(snapshot.escrowBalance || '0');
    }
  }
  return latestEscrow + availableAssetsSum;
};

/**
 * Per-(raw)-timestamp sum of undeployed available assets across every vault
 * family, for the historical TVL series. Rows are deduped per family (a
 * single timestamp can carry both a current-primary and a since-demoted
 * legacy row; the primary wins) so a family is never double-counted — the
 * same guard v1 applies before its per-family series.
 */
const crossFamilyAvailableByRawTs = async (
  chainId: number
): Promise<Map<number, bigint>> => {
  const addressToFamily = new Map<string, string>();
  for (const v of getConfiguredVaults(chainId)) {
    const primary = v.address.toLowerCase();
    addressToFamily.set(primary, primary);
    for (const le of v.config.legacy ?? []) {
      addressToFamily.set(
        normalizeLegacyEntry(le).address.toLowerCase(),
        primary
      );
    }
  }

  const allRows = await getProtocolStatsTimeSeries(undefined, chainId);
  const deduped = new Map<string, (typeof allRows)[number]>();
  for (const row of allRows) {
    const family = addressToFamily.get(row.vaultAddress.toLowerCase());
    if (!family) continue;
    const key = `${family}:${row.timestamp}`;
    const existing = deduped.get(key);
    if (!existing || row.vaultAddress.toLowerCase() === family) {
      deduped.set(key, row);
    }
  }

  const byTs = new Map<number, bigint>();
  for (const row of deduped.values()) {
    byTs.set(
      row.timestamp,
      (byTs.get(row.timestamp) ?? 0n) + BigInt(row.vaultAvailableAssets || '0')
    );
  }
  return byTs;
};

const PROTOCOL_V2_TTL_MS = 60_000;

/**
 * Minimal single-flight TTL memo keyed by chainId. Mirrors the
 * `protocolStatsCache` pattern in the v1 analytics resolver: the cached value
 * is the in-flight promise — so the dashboard's concurrent `stats` +
 * `statsHistory` (and any history pagination) collapse onto one computation
 * per window instead of each re-running the full snapshot-table read — and a
 * rejection evicts the entry so a transient DB blip isn't pinned for the whole
 * TTL.
 */
const singleFlightByChain = <T>(
  fn: (chainId: number) => Promise<T>,
  ttlMs: number
) => {
  const cache = new Map<number, { promise: Promise<T>; expiresAt: number }>();
  const run = (chainId: number): Promise<T> => {
    const now = Date.now();
    const hit = cache.get(chainId);
    if (hit && hit.expiresAt > now) return hit.promise;
    const promise = fn(chainId).catch((err) => {
      cache.delete(chainId);
      throw err;
    });
    cache.set(chainId, { promise, expiresAt: now + ttlMs });
    return promise;
  };
  run.clear = () => cache.clear();
  return run;
};

// (B) statsHistory called `crossFamilyAvailableByRawTs` on every page — a full
// `protocolStatsSnapshot` read each time. (C) stats called `computeProtocolTvl`
// (a per-vault latest-snapshot fan-out) on every request. Both are memoized
// per chainId so the dashboard pays each at most once per TTL window.
const cachedCrossFamilyAvailableByRawTs = singleFlightByChain(
  crossFamilyAvailableByRawTs,
  PROTOCOL_V2_TTL_MS
);
const cachedComputeProtocolTvl = singleFlightByChain(
  computeProtocolTvl,
  PROTOCOL_V2_TTL_MS
);

/** Test hook — drop the memoized TVL / cross-family entries. */
export const __clearProtocolCaches = (): void => {
  cachedCrossFamilyAvailableByRawTs.clear();
  cachedComputeProtocolTvl.clear();
};

export const protocol: NonNullable<QueryResolvers['protocol']> = () =>
  ({}) as never;

export const Protocol: ProtocolResolvers = {
  stats: async (_parent, _args, _ctx, info) => {
    setCacheHint(info, CACHE_HINTS.SNAPSHOT_MINUTE);
    const chainId = DEFAULT_CHAIN_ID;
    const [rows, totalValueLocked] = await Promise.all([
      (v1ProtocolStats as unknown as V1Resolver)(null, {}, null) as Promise<
        V1StatRow[]
      >,
      cachedComputeProtocolTvl(chainId),
    ]);
    // v1 appends the in-progress (live) candle as the last row; fall back to
    // a zero-valued current snapshot when no snapshots exist at all.
    const live = rows.length > 0 ? rows[rows.length - 1] : {};
    return mapProtocolStat(live, totalValueLocked) as never;
  },

  statsHistory: async (_parent, args, _ctx, info) => {
    setCacheHint(info, CACHE_HINTS.SNAPSHOT_MINUTE);
    const chainId = DEFAULT_CHAIN_ID;
    const interval = resolveSnapshotIntervalSeconds();
    const [allRows, availableByRawTs] = await Promise.all([
      // v1 `protocolStats` takes only `vaultAddress` (defaults to the protocol
      // family) — it has no time-window args, so `filter.timestamp` is applied
      // here, in-resolver, against each row's (display) timestamp.
      (v1ProtocolStats as unknown as V1Resolver)(null, {}, null) as Promise<
        V1StatRow[]
      >,
      cachedCrossFamilyAvailableByRawTs(chainId),
    ]);

    // Keep only recorded snapshots within the requested window. A v1 row's
    // display timestamp is `rawTimestamp − interval`, so a recorded row maps
    // back to a known raw snapshot; the appended live candle (labelled at the
    // current boundary) has no matching raw snapshot and is dropped — it's
    // served by `stats`. The `filter.timestamp` bounds are inclusive and match
    // the node's surfaced (display) `timestamp`.
    const rawTsOf = (row: V1StatRow) => Number(row.timestamp ?? 0) + interval;
    const window = args.filter?.timestamp;
    const historyRows = allRows.filter((row) => {
      if (!availableByRawTs.has(rawTsOf(row))) return false;
      const ts = Number(row.timestamp ?? 0);
      if (window?.gte != null && ts < window.gte) return false;
      if (window?.lte != null && ts > window.lte) return false;
      return true;
    });

    // Each row already carries the TVL inputs; `rawTsOf(row)` maps its display
    // ts back to the snapshot ts used to key the cross-family available-assets
    // sum.
    const tvlOf = (row: V1StatRow): bigint =>
      BigInt((row.escrowBalance as string) ?? '0') +
      (availableByRawTs.get(rawTsOf(row)) ?? 0n);

    // Optional server-side downsampling. The snapshot series is sub-daily
    // (~4-hourly in prod), so without bucketing the analytics dashboard pages
    // through thousands of rows it only ever renders as daily points. With an
    // `interval`, collapse each fixed-width window to one node: stock fields
    // (cumulative*, OI, escrow, TVL) take the bucket's last (latest) row; flow
    // fields (period*) sum across it; the label is the bucket start — matching
    // the client's `floor(ts / interval) * interval` grid, so its own
    // bucketing becomes an idempotent no-op.
    const intervalSeconds =
      args.interval != null ? INTERVAL_SECONDS[args.interval] : undefined;

    type Node = ReturnType<typeof mapProtocolStat>;
    let nodes: Node[];
    if (intervalSeconds) {
      const buckets = new Map<number, V1StatRow[]>();
      for (const row of historyRows) {
        const displayTs = Number(row.timestamp ?? 0);
        const bucketStart =
          Math.floor(displayTs / intervalSeconds) * intervalSeconds;
        const group = buckets.get(bucketStart);
        if (group) group.push(row);
        else buckets.set(bucketStart, [row]);
      }
      // historyRows are oldest-first, so each group's last element is the
      // latest snapshot in that bucket.
      nodes = [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([bucketStart, group]) => {
          const last = group[group.length - 1];
          const node = mapProtocolStat(last, tvlOf(last));
          node.timestamp = bucketStart;
          node.periodVolume = group
            .reduce(
              (sum, r) => sum + BigInt((r.periodVolume as string) ?? '0'),
              0n
            )
            .toString();
          node.periodTradeCount = group.reduce(
            (sum, r) => sum + Number(r.periodTradeCount ?? 0),
            0
          );
          return node;
        });
    } else {
      nodes = historyRows.map((row) => mapProtocolStat(row, tvlOf(row)));
    }

    const first = clampTake(args.first ?? nodes.length, {
      defaultTake: nodes.length || 100,
      maxTake: 1000,
    });
    const after = args.after ? decodeCursor(args.after) : null;
    const start = after && /^\d+$/.test(after.k) ? Number(after.k) + 1 : 0;
    const slice = nodes.slice(start, start + first + 1);

    return buildConnection({
      rows: slice,
      first,
      totalCount: nodes.length,
      getNode: (node) => node,
      getCursor: (node, idx) =>
        encodeCursor({
          k: String(start + idx),
          id: String(node.timestamp ?? ''),
        }),
    }) as never;
  },

  openInterestByCategory: () =>
    (v1OIByCategory as unknown as V1Resolver)(null, {}, null) as never,
  openInterestByTimeToResolution: async () => {
    const rows = (await (v1OIByTTR as unknown as V1Resolver)(
      null,
      {},
      null
    )) as Array<{
      bucket: number;
      openInterest: string;
      predictionCount: number;
    }>;
    return rows.map((row) => ({
      ...TTR_BUCKET_BOUNDS[row.bucket],
      openInterest: row.openInterest,
      predictionCount: row.predictionCount,
    })) as never;
  },
};
