import { graphqlRequestV2 } from './client/graphqlClient';

/**
 * Per-vault economic snapshot series, fetched from the v2 `vault(address:,
 * chainId:).statsHistory` surface. Backs the vault dashboard's TVL / PnL
 * charts (the migration off v1's `protocolStats(vaultAddress:)`).
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
// `.sort()` below is a defensive no-op that also keeps the merged multi-page
// result ordered.
//
// The resolver caps `first` per page (daily snapshots, bounded series), so we
// page on `pageInfo` until exhausted rather than over-fetching a single page —
// otherwise a vault older than the cap would silently lose the earliest chart
// history.
export const GET_VAULT_STATS = /* GraphQL */ `
  query VaultStats(
    $address: Address!
    $chainId: Int
    $first: Int!
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
 * Fetch a vault's full snapshot series, oldest-first. Pages through
 * `statsHistory` until the connection is exhausted (the resolver caps page
 * size), so the chart gets the complete history regardless of vault age.
 * Returns an empty array when the address is not a configured vault (the v2
 * `vault` field resolves null).
 */
export async function fetchVaultStats(
  address: string,
  chainId?: number,
  // Must stay <= the API's GRAPHQL_MAX_LIST_SIZE (100); a larger `first` is
  // rejected pre-execution with PAGINATION_LIMIT_EXCEEDED. The loop below pages
  // on `pageInfo`, so a 100-row page still yields the full series.
  pageSize = 100
): Promise<VaultStat[]> {
  const nodes: WireVaultStat[] = [];
  let after: string | null = null;
  // Bound the loop defensively against a non-progressing cursor; a daily
  // series can't realistically exceed a few thousand snapshots.
  for (let page = 0; page < 50; page += 1) {
    const data: VaultStatsResponse = await graphqlRequestV2<VaultStatsResponse>(
      GET_VAULT_STATS,
      {
        address: address.toLowerCase(),
        chainId,
        first: pageSize,
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
  /** Current indexed wUSDe balance held by the vault wallet, wei. */
  collateralBalance: string;
  /** Collateral deployed into open positions by the vault account, wei. */
  deployedCollateral: string;
  /** Settled/won collateral owed to the vault account but not redeemed, wei. */
  claimableCollateral: string;
  /** Sum of collateralBalance + deployedCollateral + claimableCollateral, wei. */
  totalValue: string;
  /** Latest account stats bucket timestamp, epoch seconds. */
  timestamp: number | null;
}

// `statsHistory` is intentionally called without `first`: the API's
// pre-execution validation rejects any literal `first` above
// GRAPHQL_MAX_LIST_SIZE (100) with PAGINATION_LIMIT_EXCEEDED, and the daily
// series needs the full rolling-year window. With no `first` the resolver
// defaults to its MAX_STATS_POINTS (366) cap — the whole [now-365d, now] grid,
// oldest-first — so `.at(-1)` is always the latest (today's) bucket.
export const GET_VAULT_ACCOUNT_VALUE = /* GraphQL */ `
  query VaultAccountValue($address: Address!, $chainId: Int) {
    account(address: $address, chainId: $chainId) {
      collateralBalance {
        amount
      }
      statsHistory(interval: DAY) {
        nodes {
          timestamp
          deployedCollateral
          claimableCollateral
        }
      }
    }
  }
`;

type WireVaultAccountStat = {
  timestamp: number;
  deployedCollateral: string | number;
  claimableCollateral: string | number;
};

type VaultAccountValueResponse = {
  account: {
    collateralBalance: { amount: string | number };
    statsHistory: { nodes: WireVaultAccountStat[] };
  };
};

export async function fetchVaultAccountValue(
  address: string,
  chainId?: number
): Promise<VaultAccountValue> {
  const data = await graphqlRequestV2<VaultAccountValueResponse>(
    GET_VAULT_ACCOUNT_VALUE,
    {
      address: address.toLowerCase(),
      chainId,
    }
  );
  const latestStat = data.account.statsHistory.nodes.at(-1);
  const collateralBalance = BigInt(wei(data.account.collateralBalance.amount));
  const deployedCollateral = latestStat?.deployedCollateral
    ? BigInt(wei(latestStat.deployedCollateral))
    : 0n;
  const claimableCollateral = latestStat?.claimableCollateral
    ? BigInt(wei(latestStat.claimableCollateral))
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
    timestamp: latestStat?.timestamp ?? null,
  };
}
