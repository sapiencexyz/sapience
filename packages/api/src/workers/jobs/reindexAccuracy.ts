import prisma from '../../db';
import { initializeDataSource } from '../../db';
import {
  upsertAttestationScoreFromAttestation,
  scoreSelectedForecastsForSettledMarket,
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
    // Get all distinct condition IDs from attestations for this market address
    const distinctConditions = await prisma.attestation.findMany({
      where: { marketAddress: normalizedAddress },
      select: { questionId: true },
      distinct: ['questionId'],
    });
    conditionIds = distinctConditions
      .map((a) => a.questionId)
      .filter((id): id is string => !!id);
  }

  for (const condId of conditionIds) {
    // 1) Upsert scores for attestations in scope
    const atts = await prisma.attestation.findMany({
      where: { marketAddress: normalizedAddress, questionId: condId },
      select: { id: true },
    });
    for (const att of atts) {
      await upsertAttestationScoreFromAttestation(att.id);
    }

    // 2) If settled, score (no selection step; we score all pre-end forecasts)
    await scoreSelectedForecastsForSettledMarket(normalizedAddress, condId);
  }
}
