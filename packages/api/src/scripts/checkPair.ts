import prisma, { initializeDataSource } from '../db';

function normalizeAddress(a: string): string {
  return a.toLowerCase();
}

function toNumericMarketId(idRaw: string): number {
  if (idRaw.startsWith('0x') || idRaw.startsWith('0X')) {
    return parseInt(idRaw, 16);
  }
  const n = Number(idRaw);
  if (!Number.isFinite(n)) throw new Error(`Invalid marketId: ${idRaw}`);
  return n;
}

async function main() {
  await initializeDataSource();

  const addressArg = process.argv[2];
  const marketIdArg = process.argv[3];
  if (!addressArg || !marketIdArg) {
    console.log(
      'Usage: tsx src/scripts/checkPair.ts <marketGroupAddress> <marketId>'
    );
    process.exit(1);
  }

  const address = normalizeAddress(addressArg);
  const marketIdNum = toNumericMarketId(marketIdArg);

  // Market row
  const market = await prisma.market.findFirst({
    where: {
      market_group: { address },
      marketId: marketIdNum,
    },
    include: { market_group: true },
  });

  // All attestations for that address; filter by numeric id in app space to handle hex/dec storage variants
  const attsForAddress = await prisma.attestation.findMany({
    where: { marketAddress: { equals: address, mode: 'insensitive' } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      uid: true,
      marketId: true,
      time: true,
      attester: true,
      prediction: true,
    },
  });

  const toNumeric = (s: string): number => {
    if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s, 16);
    return Number(s);
  };

  const attsForPair = attsForAddress.filter(
    (a) => toNumeric(a.marketId) === marketIdNum
  );

  // Any scoring rows
  const scoreRows = await prisma.attestationScore.findMany({
    where: {
      marketAddress: address,
      marketId: marketIdArg,
    },
    orderBy: { attestationId: 'asc' },
  });

  const selectedToScore = await prisma.attestationScore.findMany({
    where: {
      marketAddress: address,
      marketId: marketIdArg,
      used: true,
      scoredAt: null,
      probabilityFloat: { not: null },
    },
    select: { attestationId: true },
  });

  const outcome = (() => {
    if (!market) return null;
    const settled = market.settled;
    const settlementPriceD18 = market.settlementPriceD18 as string | null;
    const minPriceD18 =
      (market as { minPriceD18?: string | null }).minPriceD18 ?? null;
    const maxPriceD18 =
      (market as { maxPriceD18?: string | null }).maxPriceD18 ?? null;
    if (
      !settled ||
      settlementPriceD18 == null ||
      minPriceD18 == null ||
      maxPriceD18 == null
    )
      return null;
    try {
      const setD18 = BigInt(String(settlementPriceD18));
      const min = BigInt(String(minPriceD18));
      const max = BigInt(String(maxPriceD18));
      if (setD18 >= max) return 1;
      if (setD18 <= min) return 0;
      return null;
    } catch {
      return null;
    }
  })();

  const usedScores = scoreRows.filter((s) => s.used);
  const scored = scoreRows.filter((s) => s.errorSquared != null);

  console.log(
    JSON.stringify(
      {
        input: { address, marketId: marketIdArg, marketIdNum },
        market: market
          ? {
              id: market.id,
              settled: market.settled,
              endTimestamp: market.endTimestamp,
              settlementPriceD18: market.settlementPriceD18,
              minPriceD18:
                (market as { minPriceD18?: string | null }).minPriceD18 ?? null,
              maxPriceD18:
                (market as { maxPriceD18?: string | null }).maxPriceD18 ?? null,
            }
          : null,
        attestations: {
          totalForAddress: attsForAddress.length,
          countForPair: attsForPair.length,
          sample: attsForPair.slice(0, 3),
        },
        scores: {
          total: scoreRows.length,
          used: usedScores.length,
          scored: scored.length,
          sample: scoreRows.slice(0, 3).map((s) => ({
            attestationId: s.attestationId,
            used: s.used,
            probabilityFloat: s.probabilityFloat,
            errorSquared: s.errorSquared,
          })),
          selectedToScore: selectedToScore.length,
          outcome,
        },
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
