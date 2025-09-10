import prisma from '../../db';
import { computeTimeWeightedForAttesterMarketValue } from '../../helpers/scoringService';

export async function updateTwErrorForMarket(
  marketAddress: string,
  marketId: string
): Promise<void> {
  const normalizedAddress = marketAddress.toLowerCase();

  // Get attesters who forecasted on this market
  const distinct = await prisma.attestationScore.findMany({
    where: { marketAddress: normalizedAddress, marketId },
    select: { attester: true },
    distinct: ['attester'],
  });
  if (distinct.length === 0) return;

  const rows: { attester: string; twError: number }[] = [];
  for (const { attester } of distinct) {
    const tw = await computeTimeWeightedForAttesterMarketValue(
      normalizedAddress,
      marketId,
      attester.toLowerCase()
    );
    if (tw != null)
      rows.push({ attester: attester.toLowerCase(), twError: tw });
  }

  if (rows.length === 0) return;

  // Upsert all rows
  await prisma.$transaction(
    rows.map((r) =>
      prisma.attesterMarketTwError.upsert({
        where: {
          attester_marketAddress_marketId: {
            attester: r.attester,
            marketAddress: normalizedAddress,
            marketId: Number(parseInt(marketId, 16) || Number(marketId) || 0),
          },
        },
        update: { twError: r.twError },
        create: {
          attester: r.attester,
          marketAddress: normalizedAddress,
          marketId: Number(parseInt(marketId, 16) || Number(marketId) || 0),
          twError: r.twError,
        },
      })
    )
  );
}
