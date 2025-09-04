import prisma from '../../db';
import { initializeDataSource } from '../../db';
import {
  scoreSelectedForecastsForSettledMarket,
  scoreTimeWeightedForSettledMarket,
  selectLatestPreEndForMarket,
  upsertAttestationScoreFromAttestation,
} from '../../helpers/scoringService';

const BATCH_SIZE = 1000;

export async function backfillBrier(): Promise<void> {
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

  // 2) Recompute selection (latest pre-end) for each market pair that has attestations
  const marketPairs = await prisma.attestation.groupBy({
    by: ['marketAddress', 'marketId'],
  });

  for (const pair of marketPairs) {
    await selectLatestPreEndForMarket(pair.marketAddress, pair.marketId);
  }

  // 3) Score all settled markets
  const settledMarkets = await prisma.market.findMany({
    where: { settled: true },
    include: { market_group: true },
  });

  for (const m of settledMarkets) {
    if (!m.market_group?.address) continue;
    await scoreSelectedForecastsForSettledMarket(
      m.market_group.address,
      m.marketId.toString()
    );
    await scoreTimeWeightedForSettledMarket(
      m.market_group.address,
      m.marketId.toString()
    );
  }
}
