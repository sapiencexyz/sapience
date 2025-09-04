import prisma, { initializeDataSource } from '../db';

async function main() {
  await initializeDataSource();

  // Get all pairs that have attestations
  const pairs = await prisma.attestation.groupBy({
    by: ['marketAddress', 'marketId'],
    _count: { _all: true },
  });

  const results: Array<{
    address: string;
    marketId: string;
    attestations: number;
    settled: boolean;
    settlementPriceD18: string | null;
  }> = [];

  for (const pair of pairs) {
    const market = await prisma.market.findFirst({
      where: {
        market_group: { address: pair.marketAddress.toLowerCase() },
        marketId: parseInt(pair.marketId, 16) || Number(pair.marketId) || 0,
        settled: true,
      },
      include: { market_group: true },
    });
    if (!market) continue;

    results.push({
      address: pair.marketAddress.toLowerCase(),
      marketId: pair.marketId,
      attestations: pair._count._all,
      settled: market.settled,
      settlementPriceD18: market.settlementPriceD18,
    });
  }

  // Sort by address then marketId for readability
  results.sort((a, b) =>
    a.address === b.address
      ? a.marketId.localeCompare(b.marketId)
      : a.address.localeCompare(b.address)
  );

  console.log(JSON.stringify({ count: results.length, results }, null, 2));
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
