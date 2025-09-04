import prisma from '../../db';
import { initializeDataSource } from '../../db';
import {
  upsertAttestationScoreFromAttestation,
  scoreSelectedForecastsForSettledMarket,
} from '../../helpers/scoringService';
import { backfillBrier } from './backfillBrier';

export async function reindexBrier(
  address?: string,
  marketId?: string
): Promise<void> {
  await initializeDataSource();

  // Global backfill if no scope provided
  if (!address) {
    await backfillBrier();
    return;
  }

  const normalizedAddress = address.toLowerCase();
  let marketIds: string[] = [];

  if (marketId) {
    marketIds = [marketId];
  } else {
    const markets = await prisma.market.findMany({
      where: { market_group: { address: normalizedAddress } },
      select: { marketId: true },
    });
    marketIds = markets.map((m) => String(m.marketId));
  }

  for (const mId of marketIds) {
    // 1) Upsert scores for attestations in scope
    const atts = await prisma.attestation.findMany({
      where: { marketAddress: normalizedAddress, marketId: mId },
      select: { id: true },
    });
    for (const att of atts) {
      await upsertAttestationScoreFromAttestation(att.id);
    }

    // 2) If settled, score (no selection step; we score all pre-end forecasts)
    await scoreSelectedForecastsForSettledMarket(normalizedAddress, mId);
  }
}
