import prisma from '../../db';

const POLYMARKET_API = 'https://gamma-api.polymarket.com/markets';

interface PolymarketMarket {
  conditionId: string;
  outcomePrices: [string, string];
  closed: boolean;
  closedTime?: string;
}

export async function fixResolutions(): Promise<void> {
  // 1. Query affected conditions (private, Dec 8 2025 - Feb 01 2026)
  const startDate = Math.floor(new Date('2025-12-08').getTime() / 1000);
  const endDate = Math.floor(new Date('2026-02-01').getTime() / 1000);

  const conditions = await prisma.condition.findMany({
    where: {
      public: false,
      endTime: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  console.log(`Found ${conditions.length} conditions to check`);

  let fixedConditions = 0;
  let skippedNotFound = 0;
  let skippedNotResolved = 0;
  let skippedAlreadyCorrect = 0;

  // 2. For each condition, fetch Polymarket outcome and update
  for (const condition of conditions) {
    await new Promise((r) => setTimeout(r, 100)); // Rate limit

    try {
      // Try fetching by conditionId first
      let res = await fetch(`${POLYMARKET_API}?condition_ids=${condition.id}`);
      let polymarket: PolymarketMarket[] = await res.json();

      // If not found, try by slug from similarMarkets
      if (!polymarket.length) {
        const polymarketUrl = condition.similarMarkets?.find((url) =>
          url.includes('polymarket.com')
        );

        if (polymarketUrl) {
          const slug = polymarketUrl.split('/').pop();
          console.log(slug);
          if (slug) {
            res = await fetch(`${POLYMARKET_API}?slug=${slug}`);
            polymarket = await res.json();
          }
        }
      }

      if (!polymarket.length) {
        console.log(`[SKIP] ${condition.id} - not found on Polymarket`);
        skippedNotFound++;
        continue;
      }

      const market = polymarket[0];
      // outcomePrices comes as a JSON string, need to parse it
      const outcomePrices: [string, string] =
        typeof market.outcomePrices === 'string'
          ? JSON.parse(market.outcomePrices)
          : market.outcomePrices || ['0', '0'];
      const [yesPrice, noPrice] = outcomePrices;
      const resolvedToYes = yesPrice === '1';
      const isResolved = market.closed && (yesPrice === '1' || noPrice === '1');

      if (!isResolved) {
        console.log(`[SKIP] ${condition.id} - not resolved on Polymarket`);
        skippedNotResolved++;
        continue;
      }

      // Check if already correct
      if (condition.settled && condition.resolvedToYes === resolvedToYes) {
        console.log(`[OK] ${condition.id} - already correct`);
        skippedAlreadyCorrect++;
        continue;
      }

      // 3. Update condition
      const settledAt = market.closedTime
        ? Math.floor(new Date(market.closedTime).getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      await prisma.condition.update({
        where: { id: condition.id },
        data: { settled: true, resolvedToYes, settledAt },
      });

      console.log(`[FIXED] ${condition.id} -> resolvedToYes=${resolvedToYes}`);
      fixedConditions++;
    } catch (error) {
      console.error(`[ERROR] ${condition.id} - ${error}`);
    }
  }

  console.log(`\nCondition Summary:`);
  console.log(`  Fixed: ${fixedConditions}`);
  console.log(`  Not found on Polymarket: ${skippedNotFound}`);
  console.log(`  Not resolved on Polymarket: ${skippedNotResolved}`);
  console.log(`  Already correct: ${skippedAlreadyCorrect}`);

  // 4. Update positions (handle multi-condition parlays)
  const affectedPositions = await prisma.position.findMany({
    where: {
      predictions: {
        some: {
          condition: {
            public: false,
            endTime: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    },
    include: {
      predictions: {
        include: { condition: true },
      },
    },
  });

  console.log(`\nFound ${affectedPositions.length} positions to check`);

  let fixedPositions = 0;
  let skippedNotAllSettled = 0;
  let skippedPositionCorrect = 0;

  for (const position of affectedPositions) {
    // Check if ALL conditions in this position are settled
    const allSettled = position.predictions.every((p) => p.condition.settled);
    if (!allSettled) {
      console.log(
        `[SKIP] Position ${position.id} - not all conditions settled`
      );
      skippedNotAllSettled++;
      continue;
    }

    // Predictor wins only if ALL their predictions match the outcomes
    const predictorWon = position.predictions.every(
      (p) => p.outcomeYes === p.condition.resolvedToYes
    );

    // Find latest settledAt from conditions
    const maxSettledAt = Math.max(
      ...position.predictions.map((p) => p.condition.settledAt || 0)
    );

    // Check if already correct
    if (
      position.status === 'settled' &&
      position.predictorWon === predictorWon
    ) {
      console.log(`[OK] Position ${position.id} - already correct`);
      skippedPositionCorrect++;
      continue;
    }

    await prisma.position.update({
      where: { id: position.id },
      data: {
        status: 'settled',
        predictorWon,
        settledAt: maxSettledAt,
      },
    });

    console.log(`[FIXED] Position ${position.id} -> predictorWon=${predictorWon}`);
    fixedPositions++;
  }

  console.log(`\nPosition Summary:`);
  console.log(`  Fixed: ${fixedPositions}`);
  console.log(`  Not all conditions settled: ${skippedNotAllSettled}`);
  console.log(`  Already correct: ${skippedPositionCorrect}`);

  console.log(
    '\nDone! Now run: pnpm --filter @sapience/api run start:backfill-accuracy'
  );
}
