import prisma from '../../db';
import { initializeDataSource } from '../../db';
import {
  scoreSelectedForecastsForSettledMarket,
  upsertAttestationScoreFromAttestation,
  computeAndStoreMarketTwErrors,
} from '../../helpers/scoringService';

const BATCH_SIZE = 1000;

export async function backfillAccuracy(): Promise<void> {
  await initializeDataSource();

  // 1) Build/refresh attestation_score for all attestations
  let lastId = 0;
  for (;;) {
    const atts = await prisma.attestation.findMany({
      where: { id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (atts.length === 0) break;

    await Promise.all(
      atts.map(async (att) => {
        await upsertAttestationScoreFromAttestation(att.id);
      })
    );

    lastId = atts[atts.length - 1].id;
  }

  // 2) Score all settled conditions
  const settledConditions = await prisma.condition.findMany({
    where: { settled: true },
    orderBy: { settledAt: 'asc' },
  });

  // Score forecasts for each settled condition
  for (const c of settledConditions) {
    const marketAddress = c.resolver?.toLowerCase();
    if (marketAddress) {
      await scoreSelectedForecastsForSettledMarket(marketAddress, c.id);
    }
  }

  // 3) Compute and store time-weighted errors for the accuracy leaderboard
  for (const c of settledConditions) {
    const marketAddress = c.resolver?.toLowerCase();
    if (marketAddress) {
      await computeAndStoreMarketTwErrors(marketAddress, c.id);
    }
  }
}
