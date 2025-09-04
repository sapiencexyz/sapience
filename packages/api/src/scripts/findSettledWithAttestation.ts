import prisma, { initializeDataSource } from '../db';

async function main() {
  await initializeDataSource();

  // Look for any attestation pair whose market is settled
  const pairs = await prisma.attestation.groupBy({
    by: ['marketAddress', 'marketId'],
    _count: { _all: true },
  });

  for (const pair of pairs) {
    const market = await prisma.market.findFirst({
      where: {
        market_group: { address: pair.marketAddress.toLowerCase() },
        marketId: parseInt(pair.marketId, 16) || Number(pair.marketId) || 0,
        settled: true,
      },
      include: { market_group: true },
    });

    if (!market || !market.market_group?.address) continue;

    const attestation = await prisma.attestation.findFirst({
      where: {
        marketAddress: pair.marketAddress.toLowerCase(),
        marketId: pair.marketId,
      },
      orderBy: { id: 'desc' },
    });

    if (!attestation) continue;

    console.log(
      JSON.stringify(
        {
          ok: true,
          market: {
            address: pair.marketAddress.toLowerCase(),
            marketId: pair.marketId,
            settled: market.settled,
            settlementPriceD18: market.settlementPriceD18,
          },
          attestationsForPair: pair._count._all,
          attestation: {
            id: attestation.id,
            uid: attestation.uid,
            attester: attestation.attester,
            time: attestation.time,
            prediction: attestation.prediction,
          },
        },
        null,
        2
      )
    );
    return;
  }

  console.log(
    JSON.stringify({
      ok: false,
      reason: 'No settled market found with any attestation',
    })
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      /* ignore */
    }
  });
