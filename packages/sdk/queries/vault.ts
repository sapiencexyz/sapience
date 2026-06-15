import { graphqlRequestV2 } from './client/graphqlClient';

/**
 * Per-vault economic snapshot series, fetched from the v2 `vault(address:,
 * chainId:).statsHistory` surface. Backs the vault dashboard's TVL / PnL
 * charts (the migration off v1's `protocolStats(vaultAddress:)`).
 *
 * Only the fields the dashboard plots are selected. `cumulativePnl` is the
 * PnL line; `balance + deployedCollateral + unredeemedClaim` is the TVL line.
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
  unredeemedClaim: string;
}

// `statsHistory` defaults to TIMESTAMP DESC; the chart wants ascending, so the
// mapper sorts oldest-first (mirroring `protocol.ts`'s statsHistory handling).
export const GET_VAULT_STATS = /* GraphQL */ `
  query VaultStats($address: Address!, $chainId: Int, $first: Int!) {
    vault(address: $address, chainId: $chainId) {
      statsHistory(first: $first) {
        nodes {
          timestamp
          balance
          deployedCollateral
          undeployedCollateral
          cumulativePnl
          unredeemedClaim
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
  unredeemedClaim: string | number;
};

type VaultStatsResponse = {
  vault: {
    statsHistory: { nodes: WireVaultStat[] };
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
    unredeemedClaim: wei(node.unredeemedClaim),
  };
}

/**
 * Fetch a vault's snapshot series, oldest-first. Returns an empty array when
 * the address is not a configured vault (the v2 `vault` field resolves null).
 */
export async function fetchVaultStats(
  address: string,
  chainId?: number,
  first = 1000
): Promise<VaultStat[]> {
  const data = await graphqlRequestV2<VaultStatsResponse>(GET_VAULT_STATS, {
    address: address.toLowerCase(),
    chainId,
    first,
  });
  const nodes = data?.vault?.statsHistory?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.map(toVaultStat).sort((a, b) => a.timestamp - b.timestamp);
}
