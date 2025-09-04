import prisma, { initializeDataSource } from '../db';

async function main() {
  await initializeDataSource();

  const [attCount, scoreCount, settledCount, anyMarketCount] =
    await Promise.all([
      prisma.attestation.count(),
      prisma.attestationScore.count(),
      prisma.market.count({ where: { settled: true } }),
      prisma.market.count(),
    ]);

  const latestSettled = await prisma.market.findFirst({
    where: { settled: true },
    orderBy: { id: 'desc' },
    include: { market_group: true },
  });

  const latestAtt = await prisma.attestation.findFirst({
    orderBy: { id: 'desc' },
  });

  console.log(
    JSON.stringify(
      {
        counts: {
          attestations: attCount,
          attestationScores: scoreCount,
          marketsSettled: settledCount,
          marketsTotal: anyMarketCount,
        },
        latestSettled: latestSettled
          ? {
              address: latestSettled.market_group?.address,
              marketId: latestSettled.marketId,
              settlementPriceD18: latestSettled.settlementPriceD18,
            }
          : null,
        latestAttestation: latestAtt
          ? {
              id: latestAtt.id,
              uid: latestAtt.uid,
              marketAddress: latestAtt.marketAddress,
              marketId: latestAtt.marketId,
              prediction: latestAtt.prediction,
            }
          : null,
      },
      null,
      2
    )
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
      // noop
    }
  });
