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

// Maps v1's magic `bucket` int to the v2 `[min, max)` seconds-from-now
// window. Must stay in sync with the CASE ladder in
// `sdl/resolvers/queries/analytics.ts`. Bucket 1's lower bound is null
// (it absorbs overdue predictions); bucket 7's upper bound is null
// (open-ended tail).
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
      computeProtocolTvl(chainId),
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
      crossFamilyAvailableByRawTs(chainId),
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

    const first = clampTake(args.first ?? historyRows.length, {
      defaultTake: historyRows.length || 100,
      maxTake: 1000,
    });
    const after = args.after ? decodeCursor(args.after) : null;
    const start = after && /^\d+$/.test(after.k) ? Number(after.k) + 1 : 0;
    const slice = historyRows.slice(start, start + first + 1);

    return buildConnection({
      rows: slice,
      first,
      totalCount: historyRows.length,
      getNode: (row) =>
        mapProtocolStat(
          row,
          BigInt((row.escrowBalance as string) ?? '0') +
            (availableByRawTs.get(rawTsOf(row)) ?? 0n)
        ),
      getCursor: (row, idx) =>
        encodeCursor({
          k: String(start + idx),
          id: String(row.timestamp ?? ''),
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
