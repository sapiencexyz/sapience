import { formatUnits } from 'viem';
import prisma from '../../core/db';
import { SettlementResult } from '../../../generated/prisma';
import type { VaultGapDecomposition, VaultSecondaryFlowsResult } from './types';

export function formatGapDecomposition(
  label: string,
  d: VaultGapDecomposition,
  balance: bigint,
  deployed: bigint,
  deposits: bigint,
  withdrawals: bigint,
  pnl: bigint,
  secondary: VaultSecondaryFlowsResult,
  airdrops: bigint
): string {
  const fmt = (b: bigint): string => formatUnits(b, 18);
  const lhs = balance + deployed;
  const rhs =
    deposits - withdrawals + pnl + secondary.sold - secondary.bought + airdrops;
  const delta = lhs - rhs;
  const closeGross =
    d.closesPredictorHolderPayout + d.closesCounterpartyHolderPayout;
  const claimGross = d.claimedByVault;
  const unionGross = closeGross + claimGross;
  const totalOwedFromPredictionWins =
    d.winsAsCounterpartyOwed + d.winsAsPredictorOwed;
  const unredeemedFromPredictionView =
    totalOwedFromPredictionWins - d.claimedByVault > 0n
      ? totalOwedFromPredictionWins - d.claimedByVault
      : 0n;

  return [
    `[GapDebug] ${label}`,
    `  IDENTITY: balance + deployed = deposits − withdrawals + pnl + (sold − bought) + airdrops`,
    `  LHS = ${fmt(balance)} + ${fmt(deployed)} = ${fmt(lhs)}`,
    `  RHS = ${fmt(deposits)} − ${fmt(withdrawals)} + ${fmt(pnl)} + (${fmt(secondary.sold)} − ${fmt(secondary.bought)}) + ${fmt(airdrops)} = ${fmt(rhs)}`,
    `  Δ   = LHS − RHS = ${fmt(delta)}`,
    `  --- settlement gross payouts (Claim ∪ Close) ---`,
    `  Claim (TokensRedeemed): count=${d.claimCount}, payout=${fmt(claimGross)}`,
    `  Close (PositionsBurned, predictor-holder): count=${d.closesPredictorHolderCount}, payout=${fmt(d.closesPredictorHolderPayout)}`,
    `  Close (PositionsBurned, counterparty-holder): count=${d.closesCounterpartyHolderCount}, payout=${fmt(d.closesCounterpartyHolderPayout)}`,
    `  union gross payouts: ${fmt(unionGross)} (claim ${fmt(claimGross)} + close ${fmt(closeGross)})`,
    `  primary collateral committed (resolved preds): ${fmt(d.primaryCollateralCommitted)}`,
    `  realized PnL = union gross − primary = ${fmt(unionGross - d.primaryCollateralCommitted)}`,
    `  --- airdrop residual breakdown ---`,
    `  CollateralTransfer inflows: ${fmt(d.collateralTransfersIn)} (${d.collateralTransfersInCount} transfers)`,
    `  explained = deposits + union gross payouts + secondary.sold = ${fmt(deposits + unionGross + secondary.sold)}`,
    `  airdrop residual (clamped at 0) = ${fmt(airdrops)}`,
    `  --- legacy Prediction-side legs (informational) ---`,
    `  active stake: counterparty=${fmt(d.counterpartyActiveStake)} (${d.counterpartyActiveCount}), predictor=${fmt(d.predictorActiveStake)} (${d.predictorActiveCount})`,
    `  prediction-side wins (gain): as_cp=${fmt(d.winsAsCounterpartyGain)} (${d.winsAsCounterpartyCount}), as_pr=${fmt(d.winsAsPredictorGain)} (${d.winsAsPredictorCount})`,
    `  prediction-side losses: as_cp=${fmt(d.lossesAsCounterpartyLoss)} (${d.lossesAsCounterpartyCount}), as_pr=${fmt(d.lossesAsPredictorLoss)} (${d.lossesAsPredictorCount})`,
    `  claimed by vault (TokensRedeemed): ${fmt(d.claimedByVault)} (${d.claimCount} claims)`,
    `  unredeemed (Prediction-view): ${fmt(unredeemedFromPredictionView)}`,
  ].join('\n');
}

/**
 * Async live-path version: queries Prisma directly for one (chain, vault, timestamp)
 * tuple. Backfill uses the in-memory aggregator variant below to avoid N×scan.
 */
export async function decomposeVaultGap(
  chainId: number,
  atTimestamp: number,
  vaultAddress: string
): Promise<VaultGapDecomposition> {
  const [predictions, claims, closes, transfers] = await Promise.all([
    prisma.prediction.findMany({
      where: {
        chainId,
        OR: [{ predictor: vaultAddress }, { counterparty: vaultAddress }],
        onChainCreatedAt: { lte: atTimestamp },
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
    prisma.claim.findMany({
      where: {
        chainId,
        holder: vaultAddress,
        redeemedAt: { lte: atTimestamp },
      },
      select: { collateralPaid: true },
    }),
    prisma.close.findMany({
      where: {
        chainId,
        burnedAt: { lte: atTimestamp },
        OR: [
          { predictorHolder: vaultAddress },
          { counterpartyHolder: vaultAddress },
        ],
      },
      select: {
        burnedAt: true,
        predictorHolder: true,
        counterpartyHolder: true,
        predictorPayout: true,
        counterpartyPayout: true,
      },
    }),
    prisma.collateralTransfer.findMany({
      where: {
        chainId,
        to: vaultAddress,
        timestamp: { lte: new Date(atTimestamp * 1000) },
      },
      select: { value: true },
    }),
  ]);

  return decomposeVaultGapInMemory(
    predictions,
    claims,
    closes,
    transfers,
    atTimestamp,
    vaultAddress
  );
}

interface DecompPrediction {
  onChainCreatedAt: number;
  counterpartyCollateral: string;
  predictorCollateral: string;
  predictor: string;
  counterparty: string;
  pickConfigId: string | null;
  pickConfiguration: {
    resolved: boolean;
    resolvedAt: number | null;
    result: SettlementResult;
  } | null;
}

interface DecompClaim {
  collateralPaid: string;
  holder?: string;
  redeemedAt?: number;
}

interface DecompClose {
  burnedAt: number;
  predictorHolder: string;
  counterpartyHolder: string;
  predictorPayout: string;
  counterpartyPayout: string;
}

interface DecompTransfer {
  to?: string;
  timestamp?: Date;
  value: string;
}

export function decomposeVaultGapInMemory(
  predictions: DecompPrediction[],
  claims: DecompClaim[],
  closes: DecompClose[],
  transfers: DecompTransfer[],
  t: number,
  vaultAddress: string
): VaultGapDecomposition {
  const d: VaultGapDecomposition = {
    counterpartyActiveStake: 0n,
    counterpartyActiveCount: 0,
    predictorActiveStake: 0n,
    predictorActiveCount: 0,
    winsAsCounterpartyCount: 0,
    winsAsCounterpartyGain: 0n,
    winsAsCounterpartyOwed: 0n,
    winsAsPredictorCount: 0,
    winsAsPredictorGain: 0n,
    winsAsPredictorOwed: 0n,
    lossesAsCounterpartyCount: 0,
    lossesAsCounterpartyLoss: 0n,
    lossesAsPredictorCount: 0,
    lossesAsPredictorLoss: 0n,
    claimedByVault: 0n,
    claimCount: 0,
    closesPredictorHolderCount: 0,
    closesPredictorHolderPayout: 0n,
    closesCounterpartyHolderCount: 0,
    closesCounterpartyHolderPayout: 0n,
    primaryCollateralCommitted: 0n,
    collateralTransfersIn: 0n,
    collateralTransfersInCount: 0,
  };

  for (const p of predictions) {
    if (p.onChainCreatedAt > t) continue;
    const pc = p.pickConfiguration;
    const predictorIsVault = p.predictor.toLowerCase() === vaultAddress;
    const counterpartyIsVault = p.counterparty.toLowerCase() === vaultAddress;
    if (!predictorIsVault && !counterpartyIsVault) continue;

    const predictorColl = BigInt(p.predictorCollateral);
    const counterpartyColl = BigInt(p.counterpartyCollateral);

    const stillActive =
      p.pickConfigId === null ||
      (pc != null &&
        (pc.resolved === false ||
          (pc.resolved === true &&
            pc.resolvedAt !== null &&
            pc.resolvedAt > t)));

    if (stillActive) {
      if (counterpartyIsVault) {
        d.counterpartyActiveStake += counterpartyColl;
        d.counterpartyActiveCount++;
      }
      if (predictorIsVault) {
        d.predictorActiveStake += predictorColl;
        d.predictorActiveCount++;
      }
      continue;
    }

    if (
      !pc ||
      !pc.resolved ||
      pc.result === SettlementResult.UNRESOLVED ||
      pc.resolvedAt === null ||
      pc.resolvedAt > t
    ) {
      continue;
    }

    // Resolved prediction: contributes to primary collateral committed.
    if (predictorIsVault) d.primaryCollateralCommitted += predictorColl;
    if (counterpartyIsVault) d.primaryCollateralCommitted += counterpartyColl;

    const vaultWon =
      (predictorIsVault && pc.result === SettlementResult.PREDICTOR_WINS) ||
      (counterpartyIsVault && pc.result === SettlementResult.COUNTERPARTY_WINS);

    if (vaultWon) {
      const gain = predictorIsVault ? counterpartyColl : predictorColl;
      const owed = predictorColl + counterpartyColl;
      if (predictorIsVault) {
        d.winsAsPredictorCount++;
        d.winsAsPredictorGain += gain;
        d.winsAsPredictorOwed += owed;
      } else {
        d.winsAsCounterpartyCount++;
        d.winsAsCounterpartyGain += gain;
        d.winsAsCounterpartyOwed += owed;
      }
    } else {
      const loss = predictorIsVault ? predictorColl : counterpartyColl;
      if (predictorIsVault) {
        d.lossesAsPredictorCount++;
        d.lossesAsPredictorLoss += loss;
      } else {
        d.lossesAsCounterpartyCount++;
        d.lossesAsCounterpartyLoss += loss;
      }
    }
  }

  for (const c of claims) {
    if (c.holder !== undefined && c.holder.toLowerCase() !== vaultAddress)
      continue;
    if (c.redeemedAt !== undefined && c.redeemedAt > t) continue;
    d.claimedByVault += BigInt(c.collateralPaid);
    d.claimCount++;
  }

  for (const c of closes) {
    if (c.burnedAt > t) continue;
    if (c.predictorHolder.toLowerCase() === vaultAddress) {
      d.closesPredictorHolderCount++;
      d.closesPredictorHolderPayout += BigInt(c.predictorPayout);
    }
    if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
      d.closesCounterpartyHolderCount++;
      d.closesCounterpartyHolderPayout += BigInt(c.counterpartyPayout);
    }
  }

  for (const tr of transfers) {
    if (tr.to !== undefined && tr.to.toLowerCase() !== vaultAddress) continue;
    if (
      tr.timestamp !== undefined &&
      Math.floor(tr.timestamp.getTime() / 1000) > t
    ) {
      continue;
    }
    d.collateralTransfersIn += BigInt(tr.value);
    d.collateralTransfersInCount++;
  }

  return d;
}

export const GAP_DEBUG = (): boolean =>
  process.env.PROTOCOL_STATS_GAP_DEBUG === '1';

export function emptyDecomposition(): VaultGapDecomposition {
  return {
    counterpartyActiveStake: 0n,
    counterpartyActiveCount: 0,
    predictorActiveStake: 0n,
    predictorActiveCount: 0,
    winsAsCounterpartyCount: 0,
    winsAsCounterpartyGain: 0n,
    winsAsCounterpartyOwed: 0n,
    winsAsPredictorCount: 0,
    winsAsPredictorGain: 0n,
    winsAsPredictorOwed: 0n,
    lossesAsCounterpartyCount: 0,
    lossesAsCounterpartyLoss: 0n,
    lossesAsPredictorCount: 0,
    lossesAsPredictorLoss: 0n,
    claimedByVault: 0n,
    claimCount: 0,
    closesPredictorHolderCount: 0,
    closesPredictorHolderPayout: 0n,
    closesCounterpartyHolderCount: 0,
    closesCounterpartyHolderPayout: 0n,
    primaryCollateralCommitted: 0n,
    collateralTransfersIn: 0n,
    collateralTransfersInCount: 0,
  };
}
