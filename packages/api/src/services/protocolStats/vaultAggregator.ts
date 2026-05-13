import prisma from '../../core/db';
import { SettlementResult } from '../../../generated/prisma';
import { getConfiguredVaultDeploymentAddresses } from './vaultConfig';
import {
  decomposeVaultGapInMemory,
  emptyDecomposition,
} from './gapDecomposition';
import type {
  VaultAggregator,
  VaultPnLResult,
  VaultFlowsResult,
  VaultSecondaryFlowsResult,
  VaultGapDecomposition,
} from './types';

/**
 * Synchronous, in-memory replacements for `fetchVaultDeployed`,
 * `calculateVaultPnL`, and `calculateVaultFlows`. The backfill loop calls all
 * three per snapshot; doing each as a `findMany` round-trip causes N×table_scan
 * amplification (e.g. 541 snapshots × full prediction-table scan). The
 * underlying tables don't change during a backfill, so we pre-fetch the
 * superset once and aggregate in JS for each timestamp.
 *
 * Multi-vault: a single prefetch over every configured vault on the chain is
 * cheaper than one prefetch per vault. The closures take `vaultAddressLower`
 * as a per-call argument and filter the in-memory superset.
 *
 * The cron path + GraphQL resolver still call the original async helpers —
 * those run once per request, so this micro-optimization isn't worth the
 * complexity there.
 */
export async function buildVaultAggregator(
  chainId: number
): Promise<VaultAggregator> {
  const vaultAddresses = getConfiguredVaultDeploymentAddresses(chainId);
  if (vaultAddresses.length === 0) {
    return {
      deployedAt: () => 0n,
      pnlAt: () => ({
        realizedPnL: 0n,
        positionsWon: 0,
        positionsLost: 0,
        totalCollateralWon: 0n,
        totalCollateralLost: 0n,
      }),
      flowsAt: () => ({ totalDeposits: 0n, totalWithdrawals: 0n }),
      unredeemedClaimAt: () => 0n,
      secondaryAt: () => ({ bought: 0n, sold: 0n }),
      airdropsAt: () => 0n,
      gapDecompositionAt: () => emptyDecomposition(),
    };
  }

  // Fetch the union of every prediction either the deployed-collateral
  // aggregator or the PnL aggregator could possibly need across all configured
  // vaults: anything where any configured vault is on either side of the trade.
  // `vaultFlowEvent` is similarly chain-scoped — `vaultAddress` is set on every
  // row by the backfill script (the migration TRUNCATEd legacy rows).
  // `claim` rows are filtered by `holder ∈ vaultAddresses` for the
  // unredeemed-claim aggregator (one Claim row per on-chain `redeem()` call).
  const [predictions, flows, claims, closes, trades, transfers] =
    await Promise.all([
      prisma.prediction.findMany({
        where: {
          chainId,
          OR: [
            { predictor: { in: vaultAddresses } },
            { counterparty: { in: vaultAddresses } },
          ],
        },
        select: {
          onChainCreatedAt: true,
          counterpartyCollateral: true,
          predictorCollateral: true,
          predictor: true,
          counterparty: true,
          pickConfigId: true,
          pickConfiguration: {
            select: { resolved: true, resolvedAt: true, result: true },
          },
        },
      }),
      prisma.vaultFlowEvent.findMany({
        where: { chainId },
        select: {
          timestamp: true,
          eventType: true,
          assets: true,
          vaultAddress: true,
        },
      }),
      prisma.claim.findMany({
        where: { chainId, holder: { in: vaultAddresses } },
        select: { holder: true, collateralPaid: true, redeemedAt: true },
      }),
      prisma.close.findMany({
        where: {
          chainId,
          OR: [
            { predictorHolder: { in: vaultAddresses } },
            { counterpartyHolder: { in: vaultAddresses } },
          ],
        },
        select: {
          burnedAt: true,
          pickConfigId: true,
          predictorHolder: true,
          counterpartyHolder: true,
          predictorPayout: true,
          counterpartyPayout: true,
        },
      }),
      prisma.secondaryTrade.findMany({
        where: {
          chainId,
          OR: [
            { buyer: { in: vaultAddresses } },
            { seller: { in: vaultAddresses } },
          ],
        },
        select: { executedAt: true, buyer: true, seller: true, price: true },
      }),
      prisma.collateralTransfer.findMany({
        where: { chainId, to: { in: vaultAddresses } },
        select: { to: true, timestamp: true, value: true },
      }),
    ]);

  // Predicate ports of the SQL filters in `fetchVaultDeployed` /
  // `calculateVaultPnL` / `calculateVaultFlows`. Keep these inline so a future
  // reader can audit the JS branches against the SQL directly.
  const deployedAt = (t: number, vaultAddress: string): bigint => {
    let total = 0n;
    for (const p of predictions) {
      if (p.counterparty.toLowerCase() !== vaultAddress) continue;
      if (p.onChainCreatedAt > t) continue;
      const pc = p.pickConfiguration;
      const stillDeployed =
        p.pickConfigId === null ||
        (pc != null &&
          (pc.resolved === false ||
            (pc.resolved === true &&
              pc.resolvedAt !== null &&
              pc.resolvedAt > t)));
      if (stillDeployed) total += BigInt(p.counterpartyCollateral);
    }
    return total;
  };

  // Settlement PnL: gross payouts = Claim (TokensRedeemed) ∪ Close
  // (PositionsBurned), the two disjoint mechanisms by which the contract
  // can transfer wUSDe to a vault that holds a side. See
  // `calculateVaultPnL` for the why.
  const pnlAt = (t: number, vaultAddress: string): VaultPnLResult => {
    let grossPayouts = 0n;
    let positionsWon = 0;
    let totalCollateralWon = 0n;

    for (const c of claims) {
      if (c.holder.toLowerCase() !== vaultAddress) continue;
      if (c.redeemedAt > t) continue;
      const payout = BigInt(c.collateralPaid);
      grossPayouts += payout;
      totalCollateralWon += payout;
      positionsWon++;
    }
    for (const c of closes) {
      if (c.burnedAt > t) continue;
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

    let primaryCollateral = 0n;
    let positionsLost = 0;
    for (const p of predictions) {
      if (p.pickConfigId === null) continue;
      const pc = p.pickConfiguration;
      if (!pc || !pc.resolved) continue;
      if (pc.result === SettlementResult.UNRESOLVED) continue;
      if (pc.resolvedAt === null || pc.resolvedAt > t) continue;

      const predictorIsVault = p.predictor.toLowerCase() === vaultAddress;
      const counterpartyIsVault = p.counterparty.toLowerCase() === vaultAddress;
      if (predictorIsVault) {
        primaryCollateral += BigInt(p.predictorCollateral);
      }
      if (counterpartyIsVault) {
        primaryCollateral += BigInt(p.counterpartyCollateral);
      }
      const vaultLost =
        (predictorIsVault &&
          pc.result === SettlementResult.COUNTERPARTY_WINS) ||
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
  };

  const secondaryAt = (
    t: number,
    vaultAddress: string
  ): VaultSecondaryFlowsResult => {
    let bought = 0n;
    let sold = 0n;
    for (const tr of trades) {
      if (tr.executedAt > t) continue;
      if (tr.buyer.toLowerCase() === vaultAddress) bought += BigInt(tr.price);
      if (tr.seller.toLowerCase() === vaultAddress) sold += BigInt(tr.price);
    }
    return { bought, sold };
  };

  // Airdrops: total wUSDe transfers in to vault, minus inflows already
  // accounted for via deposits, settlement payouts, and secondary sales.
  // Mirrors the async `calculateVaultAirdrops` definition.
  const airdropsAt = (t: number, vaultAddress: string): bigint => {
    let transfersIn = 0n;
    for (const tr of transfers) {
      if (tr.to.toLowerCase() !== vaultAddress) continue;
      if (Math.floor(tr.timestamp.getTime() / 1000) > t) continue;
      transfersIn += BigInt(tr.value);
    }

    // Settlement inflow: union of Claim (per-holder redeem) and Close
    // (bilateral burn). Mirrors `calculateVaultAirdrops`.
    let settlementInflow = 0n;
    for (const c of claims) {
      if (c.holder.toLowerCase() !== vaultAddress) continue;
      if (c.redeemedAt > t) continue;
      settlementInflow += BigInt(c.collateralPaid);
    }
    for (const c of closes) {
      if (c.burnedAt > t) continue;
      if (c.predictorHolder.toLowerCase() === vaultAddress) {
        settlementInflow += BigInt(c.predictorPayout);
      }
      if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
        settlementInflow += BigInt(c.counterpartyPayout);
      }
    }

    const flowsRes = flowsAt(t, vaultAddress);
    const secondary = secondaryAt(t, vaultAddress);
    const explained =
      flowsRes.totalDeposits + settlementInflow + secondary.sold;
    return transfersIn > explained ? transfersIn - explained : 0n;
  };

  const flowsAt = (t: number, vaultAddress: string): VaultFlowsResult => {
    let totalDeposits = 0n;
    let totalWithdrawals = 0n;
    for (const e of flows) {
      if (e.vaultAddress.toLowerCase() !== vaultAddress) continue;
      if (e.timestamp > t) continue;
      const assets = BigInt(e.assets);
      if (e.eventType === 'deposit') totalDeposits += assets;
      else totalWithdrawals += assets;
    }
    return { totalDeposits, totalWithdrawals };
  };

  // unredeemedClaim — sum of per-prediction claimable amounts (= total
  // collateral on the winning side, per the contract's parimutuel rule) for
  // vault wins resolved by `t`, minus claims by vault redeemed by `t`. Mirrors
  // `calculateVaultUnredeemedClaim` and reads from the prefetched arrays.
  //
  // We deliberately do NOT filter on `Prediction.settled`: that flag is admin
  // metadata about who called settle(), and the wUSDe is sitting in escrow
  // earmarked for the vault as soon as the parent pickConfig is resolved
  // regardless of which sibling triggered the on-chain resolution.
  const unredeemedClaimAt = (t: number, vaultAddress: string): bigint => {
    let owed = 0n;
    const winningPickConfigIds = new Set<string>();
    for (const p of predictions) {
      const pc = p.pickConfiguration;
      if (!pc || !pc.resolved) continue;
      if (pc.resolvedAt === null || pc.resolvedAt > t) continue;
      const counterpartyIsVault = p.counterparty.toLowerCase() === vaultAddress;
      const predictorIsVault = p.predictor.toLowerCase() === vaultAddress;
      const vaultWon =
        (counterpartyIsVault &&
          pc.result === SettlementResult.COUNTERPARTY_WINS) ||
        (predictorIsVault && pc.result === SettlementResult.PREDICTOR_WINS);
      if (!vaultWon) continue;
      owed += BigInt(p.predictorCollateral) + BigInt(p.counterpartyCollateral);
      if (p.pickConfigId) winningPickConfigIds.add(p.pickConfigId);
    }
    let claimed = 0n;
    for (const c of claims) {
      if (c.holder.toLowerCase() !== vaultAddress) continue;
      if (c.redeemedAt > t) continue;
      claimed += BigInt(c.collateralPaid);
    }
    // Wins settled via the bilateral burn path (`Close`) are already in
    // `pnlAt`'s gross payouts — net their vault-side legs out of the residual
    // too. Scoped to resolved-winning pickConfigs so a pre-resolution burn
    // can't over-subtract. Mirrors `calculateVaultUnredeemedClaim`.
    for (const c of closes) {
      if (c.burnedAt > t) continue;
      if (!winningPickConfigIds.has(c.pickConfigId)) continue;
      if (c.predictorHolder.toLowerCase() === vaultAddress) {
        claimed += BigInt(c.predictorPayout);
      }
      if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
        claimed += BigInt(c.counterpartyPayout);
      }
    }
    const remainder = owed - claimed;
    return remainder > 0n ? remainder : 0n;
  };

  const gapDecompositionAt = (
    t: number,
    vaultAddress: string
  ): VaultGapDecomposition =>
    decomposeVaultGapInMemory(
      predictions,
      claims,
      closes,
      transfers,
      t,
      vaultAddress
    );

  return {
    deployedAt,
    pnlAt,
    flowsAt,
    unredeemedClaimAt,
    secondaryAt,
    airdropsAt,
    gapDecompositionAt,
  };
}
