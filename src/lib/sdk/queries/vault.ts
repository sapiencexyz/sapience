import { graphqlRequest } from './client/graphqlClient';
import { DEFAULT_MAX_PAGES } from './pagination';

/**
 * Per-vault economic snapshot series, fetched from the `vault(address:,
 * chainId:).statsHistory` surface. Backs the vault dashboard's TVL / PnL
 * charts.
 *
 * Only the fields the dashboard plots are selected. `cumulativePnl` is the
 * PnL line; `balance + deployedCollateral + claimableCollateral` is the TVL line.
 */
export interface VaultStat {
  /** Snapshot time, epoch seconds. */
  timestamp: number;
  /** Raw wUSDe held by the vault contract, wei (decimal string). */
  balance: string;
  /** Collateral deployed into escrow backing open positions, wei. */
  deployedCollateral: string;
  /** Liquid collateral not yet deployed to escrow, wei. */
  undeployedCollateral: string;
  /** Cumulative trading PnL the dashboard plots, wei. */
  cumulativePnl: string;
  /** wUSDe owed on resolved-but-unredeemed winning sides, net of claimed, wei. */
  claimableCollateral: string;
  /**
   * Mark-to-market assets-per-share as a decimal ratio string (e.g. "1.0234"
   * — dimensionless, NOT wei). Null for snapshots predating the share-price
   * feature or taken while the vault-quoter was unreachable.
   */
  sharePrice: string | null;
}

// `statsHistory` returns ascending (oldest-first) timestamps; the final
// `.sort()` below is a defensive no-op that also keeps a merged multi-page
// result ordered.
//
// `first` is left to the variable (nullable): omitting it lets the resolver
// return its default page size in one request — up to MAX_STATS_POINTS on
// deployments that keep the big-page path, or GRAPHQL_MAX_LIST_SIZE (25) on
// deployments that cap every page. A literal `first` above
// GRAPHQL_MAX_LIST_SIZE is rejected pre-execution, so an explicit `pageSize`
// must stay <= 25. `totalCount` lets fetchVaultStats plan reverse
// (newest-first) offset jumps when the series doesn't fit in one page.
export const GET_VAULT_STATS = /* GraphQL */ `
  query VaultStats(
    $address: Address!
    $chainId: Int
    $first: Int
    $after: String
    $filter: VaultStatFilter
  ) {
    vault(address: $address, chainId: $chainId) {
      statsHistory(first: $first, after: $after, filter: $filter) {
        nodes {
          timestamp
          balance
          deployedCollateral
          undeployedCollateral
          cumulativePnl
          claimableCollateral
          sharePrice
        }
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

type WireVaultStat = {
  timestamp: number;
  balance: string | number;
  deployedCollateral: string | number;
  undeployedCollateral: string | number;
  cumulativePnl: string | number;
  claimableCollateral: string | number;
  sharePrice?: string | null;
};

type VaultStatsConnection = {
  nodes: WireVaultStat[];
  totalCount?: number | null;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

/** `VaultStatFilter` input: snapshot timestamp window, epoch seconds, inclusive. */
type VaultStatsFilter = { timestamp?: { gte?: number; lte?: number } };

type VaultStatsResponse = {
  vault: {
    statsHistory: VaultStatsConnection;
  } | null;
};

// The BigInt scalar can serialize as string or number depending on the
// transport; normalize to decimal strings so consumers can BigInt() them.
const wei = (value: string | number): string => String(value);

function toVaultStat(node: WireVaultStat): VaultStat {
  return {
    timestamp: node.timestamp,
    balance: wei(node.balance),
    deployedCollateral: wei(node.deployedCollateral),
    undeployedCollateral: wei(node.undeployedCollateral),
    cumulativePnl: wei(node.cumulativePnl),
    claimableCollateral: wei(node.claimableCollateral),
    // Decimal ratio string, NOT a BigInt scalar — no wei() normalization.
    sharePrice: node.sharePrice ?? null,
  };
}

// `statsHistory` cursors are opaque strings on the wire, but structurally
// stable for this API: base64url(JSON `{k: "<row offset>", id: ""}`) — the
// resolver's offset cursor (see the API's relay/cursor.ts). Synthesizing one
// lets the client start a page at ANY offset, which is what makes
// newest-first loading possible on an ascending, forward-only connection.
// `startOffset` is the offset of the first row wanted; the server skips to
// `k + 1`.
const offsetCursor = (startOffset: number): string | null => {
  if (startOffset <= 0) return null;
  const json = JSON.stringify({ k: String(startOffset - 1), id: '' });
  const toB64 = (globalThis as { btoa?: (s: string) => string }).btoa;
  const b64 = toB64
    ? toB64(json)
    : Buffer.from(json, 'utf-8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

// In-flight tail chunks per batch. Small enough to be polite to the API,
// large enough that a long series backfills quickly behind the visible chart.
const CHUNK_CONCURRENCY = 4;

export interface FetchVaultStatsOptions {
  /**
   * Explicit per-page `first`. Must stay <= the API's GRAPHQL_MAX_LIST_SIZE
   * (25) — a larger literal is rejected pre-execution. Omit to take the
   * server's default page (larger on deployments that kept the big-page path).
   */
  pageSize?: number;
  /** Total request budget for one walk (default DEFAULT_MAX_PAGES). */
  maxPages?: number;
  /**
   * The COMPLETE ascending series returned by a previous successful call.
   * When provided, only the tail is re-fetched (by timestamp): the last known
   * bucket (it can be rewritten by a stats-writer re-run) plus anything after
   * it — an interval refetch costs one request instead of a full re-walk.
   * Never pass a streamed onProgress partial here: its missing head would be
   * treated as already-fetched and the hole would persist across refetches.
   */
  baseline?: VaultStat[];
  /**
   * Streaming callback fired as pages land, with the ascending series fetched
   * so far — always contiguous from the newest snapshot backward, so a chart
   * can render recent history immediately and grow leftward.
   */
  onProgress?: (stats: VaultStat[]) => void;
}

/**
 * Fetch a vault's full snapshot series, oldest-first — loading newest pages
 * FIRST.
 *
 * One request resolves the newest state of the series (`totalCount` + the
 * server's page size). When everything fits in a single page that's the only
 * round-trip. Otherwise the remaining pages are fetched newest-to-oldest via
 * synthesized offset cursors, `CHUNK_CONCURRENCY` at a time, invoking
 * `onProgress` as coverage grows backward from the newest snapshot. If the
 * series exceeds `maxPages`, the OLDEST pages are dropped (with a console
 * warning) — recent history always wins.
 *
 * Returns an empty array when the address is not a configured vault (the
 * `vault` field resolves null).
 */
export async function fetchVaultStats(
  address: string,
  chainId?: number,
  opts: FetchVaultStatsOptions = {}
): Promise<VaultStat[]> {
  const { pageSize, maxPages = DEFAULT_MAX_PAGES, baseline, onProgress } = opts;

  // Merge by timestamp: chunk boundaries are planned client-side, and a
  // server-side dedupe/backfill between requests could shift offsets by a
  // row — keying on timestamp makes overlap harmless.
  const byTimestamp = new Map<number, VaultStat>();
  const series = () =>
    Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
  const add = (nodes: WireVaultStat[] | undefined) => {
    for (const n of nodes ?? []) byTimestamp.set(n.timestamp, toVaultStat(n));
  };

  const requestPage = async (
    after: string | null,
    filter?: VaultStatsFilter
  ): Promise<VaultStatsConnection | null> => {
    const data: VaultStatsResponse = await graphqlRequest<VaultStatsResponse>(
      GET_VAULT_STATS,
      {
        address: address.toLowerCase(),
        chainId,
        first: pageSize ?? null,
        after,
        filter: filter ?? null,
      }
    );
    const history = data?.vault?.statsHistory;
    return history && Array.isArray(history.nodes) ? history : null;
  };

  // Forward endCursor walk from `after`. Used for the incremental tail and as
  // the fallback when the server doesn't report totalCount. Only server-issued
  // cursors are followed here, so it stays valid under any cursor scheme.
  const walkForward = async (
    after: string | null,
    budget: number,
    filter?: VaultStatsFilter
  ) => {
    let cursor = after;
    for (let page = 0; page < budget; page += 1) {
      const conn = await requestPage(cursor, filter);
      if (!conn) return;
      add(conn.nodes);
      onProgress?.(series());
      if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) return;
      cursor = conn.pageInfo.endCursor;
    }
  };

  // ── Incremental refetch ──
  // Re-fetch the tail by TIMESTAMP, not by offset: a cached series' length is
  // not a server row offset (server-side dedupes/backfills shift offsets, and
  // an offset resume would silently skip or hole the series if the baseline
  // were ever not a [0, N) prefix). `gte` includes the last known bucket so a
  // bucket rewritten by a stats-writer re-run refreshes too. Steady state is
  // one request; a long gap pages forward on server-issued cursors.
  if (baseline && baseline.length > 0) {
    for (const s of baseline) byTimestamp.set(s.timestamp, s);
    const lastKnownTs = baseline[baseline.length - 1].timestamp;
    await walkForward(null, maxPages, { timestamp: { gte: lastKnownTs } });
    return series();
  }

  // ── Full walk ──
  const head = await requestPage(null);
  if (!head) return [];
  const headNodes = head.nodes ?? [];
  const total = typeof head.totalCount === 'number' ? head.totalCount : null;

  // Whole series fit in one page — the common case for a short series.
  if (!head.pageInfo?.hasNextPage || headNodes.length === 0) {
    add(headNodes);
    onProgress?.(series());
    return series();
  }

  // The head page came back full, so its length IS the server's page size —
  // the stride for planning reverse offset jumps.
  const stride = headNodes.length;

  if (total === null || total <= stride) {
    // No totalCount to plan reverse jumps from; degrade to the classic
    // oldest-first endCursor walk rather than lose the series.
    add(headNodes);
    onProgress?.(series());
    await walkForward(head.pageInfo.endCursor, maxPages - 1);
    return series();
  }

  // Tail chunk start offsets, newest chunk first. The head page covered
  // [0, stride); each chunk covers [offset, offset + stride).
  const offsets: number[] = [];
  for (let o = stride; o < total; o += stride) offsets.push(o);
  offsets.reverse();

  // Budget (head already spent 1 request). Newest chunks win: the walk just
  // stops early, dropping the oldest part of the series.
  const budget = Math.max(1, maxPages - 1);
  const dropped = offsets.length - budget;
  const planned = dropped > 0 ? offsets.slice(0, budget) : offsets;
  if (dropped > 0) {
    console.warn(
      `fetchVaultStats: series of ${total} snapshots exceeds maxPages=${maxPages}; dropping the oldest ${dropped} page(s)`
    );
  }

  for (let i = 0; i < planned.length; i += CHUNK_CONCURRENCY) {
    const batch = planned.slice(i, i + CHUNK_CONCURRENCY);
    const results = await Promise.all(
      batch.map((offset) => requestPage(offsetCursor(offset)))
    );
    for (const conn of results) add(conn?.nodes);
    // The moment the walk reaches the head page's upper edge the gap closes
    // and the head rows join the series. Until then (and permanently, when
    // the budget dropped pages) they stay out — emitting them early would
    // put a hole in the middle of the chart's x-axis.
    if (batch[batch.length - 1] === stride) add(headNodes);
    onProgress?.(series());
  }

  return series();
}

export interface VaultAccountValue {
  /** Raw wUSDe held by the vault contract (`balanceOf`), excludes deployed, wei. */
  collateralBalance: string;
  /** Collateral deployed into escrow backing the vault's open positions, wei. */
  deployedCollateral: string;
  /** Settled/won collateral owed to the vault but not yet redeemed, wei. */
  claimableCollateral: string;
  /** Sum of collateralBalance + deployedCollateral + claimableCollateral, wei. */
  totalValue: string;
  /** Latest vault stats snapshot timestamp, epoch seconds. */
  timestamp: number | null;
}

// Sourced from the vault entity's live `stats` snapshot — NOT the
// `account(...)` surface. Both now compute `deployedCollateral` off the pick
// configuration's resolution (`Picks.resolved`/`resolvedAt`), so a position
// drops out of "deployed" the moment its pickConfig resolves — including a
// COUNTERPARTY_WINS loss that is never settled on-chain:
//
//   - `Vault.stats.deployedCollateral` (this query) — vaultAggregator.deployedAt.
//   - `Account.statsHistory.deployedCollateral` — queryAccountBalance SQL.
//
// They previously diverged: the account path keyed off Prediction.settledAt,
// and losing predictions are frequently never settled on-chain, so their
// counterpartyCollateral stayed counted as deployed forever — over-counting the
// headline balance (e.g. ~4x for a vault with a backlog of unsettled losses).
// Both paths now match the figure the PnL chart plots.
export const GET_VAULT_ACCOUNT_VALUE = /* GraphQL */ `
  query VaultAccountValue($address: Address!, $chainId: Int) {
    vault(address: $address, chainId: $chainId) {
      stats {
        timestamp
        balance
        deployedCollateral
        claimableCollateral
      }
    }
  }
`;

type WireVaultLiveStat = {
  timestamp: number;
  balance: string | number;
  deployedCollateral: string | number;
  claimableCollateral: string | number;
};

type VaultAccountValueResponse = {
  vault: {
    stats: WireVaultLiveStat | null;
  } | null;
};

export async function fetchVaultAccountValue(
  address: string,
  chainId?: number
): Promise<VaultAccountValue> {
  const data = await graphqlRequest<VaultAccountValueResponse>(
    GET_VAULT_ACCOUNT_VALUE,
    {
      address: address.toLowerCase(),
      chainId,
    }
  );
  // `stats` is null until the stats writer has recorded a snapshot, and `vault`
  // is null when the address is not a configured vault.
  const stats = data.vault?.stats;
  const collateralBalance = stats?.balance ? BigInt(wei(stats.balance)) : 0n;
  const deployedCollateral = stats?.deployedCollateral
    ? BigInt(wei(stats.deployedCollateral))
    : 0n;
  const claimableCollateral = stats?.claimableCollateral
    ? BigInt(wei(stats.claimableCollateral))
    : 0n;

  return {
    collateralBalance: collateralBalance.toString(),
    deployedCollateral: deployedCollateral.toString(),
    claimableCollateral: claimableCollateral.toString(),
    totalValue: (
      collateralBalance +
      deployedCollateral +
      claimableCollateral
    ).toString(),
    timestamp: stats?.timestamp ?? null,
  };
}
