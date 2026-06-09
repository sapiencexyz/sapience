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
 * The vault is normally redeemed via `redeem()` (→ `Claim`), but a win can also
 * be settled via the bilateral burn path (`burn()` → `Close`). `calculateVaultPnL`
 * counts BOTH event streams in its gross payouts, so we net BOTH out here — Claim
 * rows whose holder is the vault, plus the vault's payout legs on `Close` rows
 * for the same resolved-winning pickConfigs — otherwise a win exited via `burn()`
 * would be double-counted (once in `vaultRealizedPnL`, once in this residual).
 *
 * Clamped at 0n. We don't join through `Claim.pickConfigId` here — we just sum
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
      select: {
        predictorCollateral: true,
        counterpartyCollateral: true,
        pickConfigId: true,
      },
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
      select: {
        predictorCollateral: true,
        counterpartyCollateral: true,
        pickConfigId: true,
      },
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
  const winningPickConfigIds = new Set<string>();
  for (const p of [...counterpartyWins, ...predictorWins]) {
    owed += BigInt(p.predictorCollateral) + BigInt(p.counterpartyCollateral);
    if (p.pickConfigId) winningPickConfigIds.add(p.pickConfigId);
  }

  let claimed = 0n;
  for (const c of claims) claimed += BigInt(c.collateralPaid);

  // Wins settled through the bilateral burn path show up as `Close` rows
  // rather than `Claim` rows; their payout legs are already in
  // `vaultRealizedPnL`, so subtract them from the owed residual too. Scoped to
  // the resolved-winning pickConfigs so a pre-resolution burn (where the
  // prediction isn't in `owed` at all) can't over-subtract.
  if (winningPickConfigIds.size > 0) {
    const closes = await prisma.close.findMany({
      where: {
        chainId,
        pickConfigId: { in: [...winningPickConfigIds] },
        OR: [
          { predictorHolder: vaultAddress },
          { counterpartyHolder: vaultAddress },
        ],
        ...(beforeTimestamp ? { burnedAt: { lte: beforeTimestamp } } : {}),
      },
      select: {
        predictorHolder: true,
        counterpartyHolder: true,
        predictorPayout: true,
        counterpartyPayout: true,
      },
    });
    for (const c of closes) {
      if (c.predictorHolder.toLowerCase() === vaultAddress) {
        claimed += BigInt(c.predictorPayout);
      }
      if (c.counterpartyHolder.toLowerCase() === vaultAddress) {
        claimed += BigInt(c.counterpartyPayout);
      }
    }
  }

  const remainder = owed - claimed;
  return remainder > 0n ? remainder : 0n;
}
