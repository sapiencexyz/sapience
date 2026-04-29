import prisma from '../../core/db';
import { SettlementResult } from '../../../generated/prisma';
import { resolveVaultAddress } from './vaultConfig';
import type {
  VaultPnLResult,
  VaultFlowsResult,
  VaultSecondaryFlowsResult,
} from './types';

/**
 * Calculate vault's realized PnL from resolved predictions.
 *
 * Uses Picks.resolved (set automatically when all conditions settle)
 * rather than Prediction.settled (requires an explicit on-chain settle() call
 * that may never happen for losing predictions).
 */
export async function calculateVaultPnL(
  chainId: number,
  beforeTimestamp?: number,
  vaultAddressArg?: string
): Promise<VaultPnLResult> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) {
    return {
      realizedPnL: 0n,
      positionsWon: 0,
      positionsLost: 0,
      totalCollateralWon: 0n,
      totalCollateralLost: 0n,
    };
  }

  // Gross payouts: actual wUSDe the vault received from settlement-related
  // wUSDe transfers. The protocol has two disjoint payout mechanisms — we
  // sum both because each transfers wUSDe to the holder via on-chain
  // safeTransfer:
  //
  //   1. `redeem()`  → TokensRedeemed → Claim (post-resolution, per-holder).
  //      Holder calls; gets their proportional payout from the resolved
  //      pickConfig pool.
  //   2. `burn()`    → PositionsBurned → Close (bilateral pre/post-resolution
  //      exit). Both sides burn together; payouts go to predictorHolder AND
  //      counterpartyHolder in the same tx.
  //
  // Using ONLY Close (1634) would miss per-holder redemptions; ONLY Claim
  // would miss bilateral-burn payouts. Both can land in the vault when it's
  // a holder of either side.
  const [claims, closes] = await Promise.all([
    prisma.claim.findMany({
      where: {
        chainId,
        holder: vaultAddress,
        ...(beforeTimestamp ? { redeemedAt: { lte: beforeTimestamp } } : {}),
      },
      select: { collateralPaid: true },
    }),
    prisma.close.findMany({
      where: {
        chainId,
        ...(beforeTimestamp ? { burnedAt: { lte: beforeTimestamp } } : {}),
        OR: [
          { predictorHolder: vaultAddress },
          { counterpartyHolder: vaultAddress },
        ],
      },
      select: {
        predictorHolder: true,
        counterpartyHolder: true,
        predictorPayout: true,
        counterpartyPayout: true,
      },
    }),
  ]);

  let grossPayouts = 0n;
  let totalCollateralWon = 0n;
  let positionsWon = 0;
  for (const c of claims) {
    const payout = BigInt(c.collateralPaid);
    grossPayouts += payout;
    totalCollateralWon += payout;
    positionsWon++;
  }
  for (const c of closes) {
    if (c.predictorHolder.toLowerCase() === vaultAddress) {
      const payout = BigInt(c.predictorPayout);
      grossPayouts += payout;
      totalCollateralWon += payout;
      if (payout > 0n) positionsWon++;
    }
    if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
      const payout = BigInt(c.counterpartyPayout);
      grossPayouts += payout;
      totalCollateralWon += payout;
      if (payout > 0n) positionsWon++;
    }
  }

  // Cost basis: primary-creation collateral the vault committed for
  // predictions whose pickConfig has now resolved. Sold-on-secondary
  // positions still count here — the cost was paid at creation, and the
  // sale proceeds are tracked separately in vaultSecondarySold. We use
  // Prediction (creator-side attribution) deliberately: PnL relative to
  // *vault's* economic exposure is `wUSDe in − wUSDe out`, where in =
  // claims for vault and out = primary collateral vault committed.
  const predictions = await prisma.prediction.findMany({
    where: {
      chainId,
      pickConfigId: { not: null },
      pickConfiguration: {
        resolved: true,
        result: { not: SettlementResult.UNRESOLVED },
        ...(beforeTimestamp ? { resolvedAt: { lte: beforeTimestamp } } : {}),
      },
      OR: [{ predictor: vaultAddress }, { counterparty: vaultAddress }],
    },
    include: {
      pickConfiguration: { select: { result: true } },
    },
  });

  let primaryCollateral = 0n;
  let positionsLost = 0;
  for (const p of predictions) {
    const predictorIsVault = p.predictor.toLowerCase() === vaultAddress;
    const counterpartyIsVault = p.counterparty.toLowerCase() === vaultAddress;
    if (predictorIsVault) {
      primaryCollateral += BigInt(p.predictorCollateral);
    }
    if (counterpartyIsVault) {
      primaryCollateral += BigInt(p.counterpartyCollateral);
    }
    const pc = p.pickConfiguration;
    if (!pc) continue;
    const vaultLost =
      (predictorIsVault && pc.result === SettlementResult.COUNTERPARTY_WINS) ||
      (counterpartyIsVault && pc.result === SettlementResult.PREDICTOR_WINS);
    if (vaultLost) positionsLost++;
  }

  return {
    realizedPnL: grossPayouts - primaryCollateral,
    positionsWon,
    positionsLost,
    totalCollateralWon,
    totalCollateralLost: primaryCollateral,
  };
}

/**
 * Calculate vault's cumulative secondary-market trade flow.
 *
 * Sums total wUSDe paid (`bought`) and received (`sold`) by the vault on
 * the secondary market up through `beforeTimestamp` (exclusive of later
 * trades when supplied). These are gross cash movements; PnL realized
 * from secondary trades is `sold − bought` netted against any cost basis
 * still represented inside `realizedPnL`.
 */
export async function calculateVaultSecondaryFlows(
  chainId: number,
  beforeTimestamp?: number,
  vaultAddressArg?: string
): Promise<VaultSecondaryFlowsResult> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) return { bought: 0n, sold: 0n };

  const trades = await prisma.secondaryTrade.findMany({
    where: {
      chainId,
      ...(beforeTimestamp ? { executedAt: { lte: beforeTimestamp } } : {}),
      OR: [{ buyer: vaultAddress }, { seller: vaultAddress }],
    },
    select: { buyer: true, seller: true, price: true },
  });

  let bought = 0n;
  let sold = 0n;
  for (const t of trades) {
    if (t.buyer.toLowerCase() === vaultAddress) bought += BigInt(t.price);
    if (t.seller.toLowerCase() === vaultAddress) sold += BigInt(t.price);
  }
  return { bought, sold };
}

/**
 * Calculate vault's airdrop gains: wUSDe transferred into the vault from
 * sources the protocol doesn't otherwise track.
 *
 *   airdrop = sum(CollateralTransfer.value where to = vault)
 *           − sum(VaultFlowEvent deposits)
 *           − sum(Close payouts to vault holder)
 *           − sum(SecondaryTrade.price where seller = vault)
 *
 * In a fully-reconciled state this is zero unless real wUSDe arrives via
 * a path outside the protocol (sapience emissions, partner rewards, etc).
 * Clamped at zero — a negative residual indicates an indexer gap and is
 * surfaced via the snapshot console log rather than corrupting the chart.
 */
export async function calculateVaultAirdrops(
  chainId: number,
  beforeTimestamp?: number,
  vaultAddressArg?: string
): Promise<bigint> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) return 0n;

  const transferWhere: {
    chainId: number;
    to: string;
    timestamp?: { lte: Date };
  } = {
    chainId,
    to: vaultAddress,
  };
  if (beforeTimestamp) {
    transferWhere.timestamp = { lte: new Date(beforeTimestamp * 1000) };
  }

  const transfers = await prisma.collateralTransfer.findMany({
    where: transferWhere,
    select: { value: true },
  });
  let transfersIn = 0n;
  for (const t of transfers) transfersIn += BigInt(t.value);

  const flows = await calculateVaultFlows(
    chainId,
    beforeTimestamp,
    vaultAddressArg
  );

  // Settlement inflow: union of Claim (per-holder redeem) and Close
  // (bilateral burn). Mirrors `calculateVaultPnL` — both transfer wUSDe to
  // the vault when it holds a side, and they are disjoint event-streams.
  const [claims, closes] = await Promise.all([
    prisma.claim.findMany({
      where: {
        chainId,
        holder: vaultAddress,
        ...(beforeTimestamp ? { redeemedAt: { lte: beforeTimestamp } } : {}),
      },
      select: { collateralPaid: true },
    }),
    prisma.close.findMany({
      where: {
        chainId,
        ...(beforeTimestamp ? { burnedAt: { lte: beforeTimestamp } } : {}),
        OR: [
          { predictorHolder: vaultAddress },
          { counterpartyHolder: vaultAddress },
        ],
      },
      select: {
        predictorHolder: true,
        counterpartyHolder: true,
        predictorPayout: true,
        counterpartyPayout: true,
      },
    }),
  ]);
  let settlementInflow = 0n;
  for (const c of claims) settlementInflow += BigInt(c.collateralPaid);
  for (const c of closes) {
    if (c.predictorHolder.toLowerCase() === vaultAddress) {
      settlementInflow += BigInt(c.predictorPayout);
    }
    if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
      settlementInflow += BigInt(c.counterpartyPayout);
    }
  }

  const secondary = await calculateVaultSecondaryFlows(
    chainId,
    beforeTimestamp,
    vaultAddressArg
  );

  const explained = flows.totalDeposits + settlementInflow + secondary.sold;
  return transfersIn > explained ? transfersIn - explained : 0n;
}

/**
 * Calculate a vault's cumulative deposits and withdrawals from indexed flow
 * events. Events are scoped per-vault via the `vaultAddress` column added in
 * 20260422_add_vault_address_to_vault_flow_event — that migration TRUNCATEs
 * the table, so by the time this code runs every row has a non-null vaultAddress.
 */
export async function calculateVaultFlows(
  chainId: number,
  beforeTimestamp?: number,
  vaultAddressArg?: string
): Promise<VaultFlowsResult> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) return { totalDeposits: 0n, totalWithdrawals: 0n };

  const whereClause: {
    chainId: number;
    vaultAddress: string;
    timestamp?: { lte: number };
  } = { chainId, vaultAddress };

  if (beforeTimestamp) {
    whereClause.timestamp = { lte: beforeTimestamp };
  }

  const events = await prisma.vaultFlowEvent.findMany({ where: whereClause });

  let totalDeposits = 0n;
  let totalWithdrawals = 0n;

  for (const event of events) {
    const assets = BigInt(event.assets);
    if (event.eventType === 'deposit') {
      totalDeposits += assets;
    } else {
      totalWithdrawals += assets;
    }
  }

  return { totalDeposits, totalWithdrawals };
}
