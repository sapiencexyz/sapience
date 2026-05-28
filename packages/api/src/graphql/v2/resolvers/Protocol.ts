/**
 * `Query.protocol` — singleton entry point for protocol-wide stats and
 * breakdowns. Delegates to v1's stats helpers; v2's `Protocol.stats`
 * wraps the same fat-row pipeline in a forward-only Relay connection
 * with offset cursors (the rows are already materialized in memory).
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
import {
  protocolStats as v1ProtocolStats,
  openInterestByCategory as v1OIByCategory,
  openInterestByTimeToResolution as v1OIByTTR,
} from '../../sdl/resolvers/queries/analytics';
import {
  getConfiguredVaults,
  getLatestProtocolStats,
} from '../../../services/protocolStats';
import { CACHE_HINTS, setCacheHint } from '../cacheHints';

type V1Resolver = (parent: null, args: unknown, ctx: unknown) => unknown;

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

export const protocol: NonNullable<QueryResolvers['protocol']> = () =>
  ({}) as never;

export const Protocol: ProtocolResolvers = {
  stats: async (_parent, args, _ctx, info) => {
    // Stats are materialized by a once-per-minute snapshot writer.
    setCacheHint(info, CACHE_HINTS.SNAPSHOT_MINUTE);
    const rows = (await (v1ProtocolStats as unknown as V1Resolver)(
      null,
      {
        from: args.filter?.timestamp?.gte ?? undefined,
        to: args.filter?.timestamp?.lte ?? undefined,
      },
      null
    )) as Array<Record<string, unknown>>;
    const first = clampTake(args.first ?? rows.length, {
      defaultTake: rows.length || 100,
      maxTake: 1000,
    });
    const after = args.after ? decodeCursor(args.after) : null;
    const start = after && /^\d+$/.test(after.k) ? Number(after.k) + 1 : 0;
    const slice = rows.slice(start, start + first + 1);

    return buildConnection({
      rows: slice as never[],
      first,
      totalCount: rows.length,
      getCursor: (row, idx) =>
        encodeCursor({
          k: String(start + idx),
          id: String((row as { timestamp?: unknown }).timestamp ?? ''),
        }),
    });
  },

  tvl: async () => {
    const chainId = DEFAULT_CHAIN_ID;
    // TVL = chain-wide escrow balance + undeployed available assets summed
    // across every configured vault family (protocol / pyth / single-leg /
    // strategy-b), not just the default. escrowBalance is denormalized onto
    // each vault's snapshot, so take it once from the most-recent snapshot.
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
    return (latestEscrow + availableAssetsSum) as never;
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
