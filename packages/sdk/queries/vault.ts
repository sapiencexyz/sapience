import { graphqlRequest } from './client/graphqlClient';

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
}

// `statsHistory` returns ascending (oldest-first) timestamps; the final
// `.sort()` below is a defensive no-op that also keeps a merged multi-page
// result ordered.
//
// `first` is left to the variable (nullable): omitting it lets the resolver
// return up to its MAX_STATS_POINTS cap in one page, so the common case is a
// single request. The query still selects `pageInfo` and threads `after` so
// fetchVaultStats can page forward if a vault ever exceeds that cap — the
// series stays complete without re-introducing a fixed chain of round-trips.
// A literal `first` above GRAPHQL_MAX_LIST_SIZE (100) is rejected
// pre-execution, so an explicit `pageSize` must stay <= 100.
export const GET_VAULT_STATS = /* GraphQL */ `
  query VaultStats(
    $address: Address!
    $chainId: Int
    $first: Int
    $after: String
  ) {
    vault(address: $address, chainId: $chainId) {
      statsHistory(first: $first, after: $after) {
        nodes {
          timestamp
          balance
          deployedCollateral
          undeployedCollateral
          cumulativePnl
          claimableCollateral
        }
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
};

type VaultStatsResponse = {
  vault: {
    statsHistory: {
      nodes: WireVaultStat[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
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
  };
}

/**
 * Fetch a vault's full snapshot series, oldest-first.
 *
 * The resolver returns up to its MAX_STATS_POINTS cap per page, so for a
 * normal vault this completes in a single request. The loop pages on
 * `pageInfo` only if a vault's series ever exceeds the cap, so the chart never
 * silently loses history. Returns an empty array when the address is not a
 * configured vault (the `vault` field resolves null).
 *
 * `pageSize` (optional) forces an explicit per-page `first` — it must stay
 * <= the API's GRAPHQL_MAX_LIST_SIZE (100), since a larger literal is rejected
 * pre-execution. Omit it to use the resolver's single-page cap.
 */
export async function fetchVaultStats(
  address: string,
  chainId?: number,
  pageSize?: number
): Promise<VaultStat[]> {
  const nodes: WireVaultStat[] = [];
  let after: string | null = null;
  // Bound the loop defensively against a non-progressing cursor; the daily
  // series can't realistically exceed a few thousand snapshots.
  for (let page = 0; page < 50; page += 1) {
    const data: VaultStatsResponse = await graphqlRequest<VaultStatsResponse>(
      GET_VAULT_STATS,
      {
        address: address.toLowerCase(),
        chainId,
        first: pageSize ?? null,
        after,
      }
    );
    const history = data?.vault?.statsHistory;
    if (!history || !Array.isArray(history.nodes)) break;
    nodes.push(...history.nodes);
    if (!history.pageInfo?.hasNextPage || !history.pageInfo.endCursor) break;
    after = history.pageInfo.endCursor;
  }
  return nodes.map(toVaultStat).sort((a, b) => a.timestamp - b.timestamp);
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
