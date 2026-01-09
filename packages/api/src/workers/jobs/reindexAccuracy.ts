import prisma from '../../db';
import { initializeDataSource } from '../../db';
import {
  upsertAttestationScoreFromAttestation,
  scoreSelectedForecastsForSettledMarket,
  computeAndStoreMarketTwErrors,
} from '../../helpers/scoringService';
import { backfillAccuracy } from './backfillAccuracy';

export async function reindexAccuracy(
  address?: string,
  marketId?: string
): Promise<void> {
  await initializeDataSource();

  // Global backfill if no scope provided
  if (!address) {
    await backfillAccuracy();
    return;
  }

  const normalizedAddress = address.toLowerCase();
  let conditionIds: string[] = [];

  if (marketId) {
    conditionIds = [marketId];
  } else {
    // Get all distinct condition IDs from attestation_score for this market address
    const distinctConditions = await prisma.attestationScore.findMany({
      where: { marketAddress: normalizedAddress },
      select: { questionId: true },
      distinct: ['questionId'],
    });
    conditionIds = distinctConditions
      .map((a) => a.questionId)
      .filter((id): id is string => !!id);
  }

  for (const condId of conditionIds) {
    // 1) Upsert scores for attestations in scope (by conditionId)
    const atts = await prisma.attestation.findMany({
      where: { conditionId: condId },
      select: { id: true },
    });
    for (const att of atts) {
      await upsertAttestationScoreFromAttestation(att.id);
    }

    // 2) If settled, score (no selection step; we score all pre-end forecasts)
    await scoreSelectedForecastsForSettledMarket(normalizedAddress, condId);

    // 3) Compute and store time-weighted errors for the accuracy leaderboard
    await computeAndStoreMarketTwErrors(normalizedAddress, condId);
  }
}
