import prisma from '../../core/db';
import { SettlementResult } from '../../../generated/prisma';
import { resolveVaultAddress } from './vaultConfig';

/**
 * Calculate the wUSDe earmarked for the vault from resolved-but-not-yet-redeemed
 * wins. Bridges the basis mismatch between accrual `vaultRealizedPnL` (booked at
 * `Picks.resolvedAt`) and cash-basis `vaultBalance` (only after `redeem()`).
 *
 *   unredeemed = Σ (predictorCollateral + counterpartyCollateral) for predictions
 *                where the vault is on the winning side AND Picks.resolvedAt ≤ t
 *              − Σ Claim.collateralPaid where holder = vault, redeemedAt ≤ t
 *
 * The per-prediction claimable on the winning side equals total collateral by
 * the contract's parimutuel rule (see `_calculateClaimableForPrediction` in
 * PredictionMarketEscrow.sol — `counterpartyClaimable = totalCollateral` on
 * COUNTERPARTY_WINS, `predictorClaimable = totalCollateral` on PREDICTOR_WINS).
 *
 * Why not filter on `Prediction.settled`: that flag flips when SOMEONE calls
 * `settle(predictionId)` on-chain — which is independent admin metadata and
 * doesn't gate redemption. As long as the parent pickConfig is resolved
 * (Picks.resolved = true, which is what gates `redeem()` on-chain), the vault's
 * counterparty stake AND prize are sitting in escrow earmarked for it.
 *
 * Clamped at 0n. The `Claim.predictionId` column actually stores the on-chain
 * pickConfigId (known indexer misnomer); we don't join through it — we just sum
 * Claim rows whose holder is the vault.
 */
export async function calculateVaultUnredeemedClaim(
  chainId: number,
  beforeTimestamp?: number,
  vaultAddressArg?: string
): Promise<bigint> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) return 0n;

  const resolvedFilter = beforeTimestamp ? { lte: beforeTimestamp } : undefined;

  const [counterpartyWins, predictorWins, claims] = await Promise.all([
    prisma.prediction.findMany({
      where: {
        chainId,
        counterparty: vaultAddress,
        pickConfiguration: {
          resolved: true,
          result: SettlementResult.COUNTERPARTY_WINS,
          ...(resolvedFilter ? { resolvedAt: resolvedFilter } : {}),
        },
      },
      select: { predictorCollateral: true, counterpartyCollateral: true },
    }),
    prisma.prediction.findMany({
      where: {
        chainId,
        predictor: vaultAddress,
        pickConfiguration: {
          resolved: true,
          result: SettlementResult.PREDICTOR_WINS,
          ...(resolvedFilter ? { resolvedAt: resolvedFilter } : {}),
        },
      },
      select: { predictorCollateral: true, counterpartyCollateral: true },
    }),
    prisma.claim.findMany({
      where: {
        chainId,
        holder: vaultAddress,
        ...(beforeTimestamp ? { redeemedAt: { lte: beforeTimestamp } } : {}),
      },
      select: { collateralPaid: true },
    }),
  ]);

  let owed = 0n;
  for (const p of counterpartyWins) {
    owed += BigInt(p.predictorCollateral) + BigInt(p.counterpartyCollateral);
  }
  for (const p of predictorWins) {
    owed += BigInt(p.predictorCollateral) + BigInt(p.counterpartyCollateral);
  }

  let claimed = 0n;
  for (const c of claims) claimed += BigInt(c.collateralPaid);

  const remainder = owed - claimed;
  return remainder > 0n ? remainder : 0n;
}
