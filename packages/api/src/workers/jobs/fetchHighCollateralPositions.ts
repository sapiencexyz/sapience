import prisma from '../../db';

// Collateral is stored in wei (18 decimals)
// $10 = 10 * 10^18
const TEN_DOLLARS = BigInt('10000000000000000000'); // 10 * 10^18

export async function fetchHighCollateralPositions(): Promise<void> {
  // Query positions where counterparty has >$10 collateral (18 decimals)
  const positions = await prisma.position.findMany({
    where: {
      counterpartyCollateral: {
        not: null,
      },
    },
    include: {
      predictions: {
        include: {
          condition: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Filter in JS since Prisma doesn't support numeric comparison on string fields
  const highCollateralPositions = positions.filter((p) => {
    if (!p.counterpartyCollateral) return false;
    const collateral = BigInt(p.counterpartyCollateral);
    return collateral > TEN_DOLLARS;
  });

  console.log(
    `Found ${highCollateralPositions.length} positions with counterparty collateral > $10\n`
  );

  for (const position of highCollateralPositions) {
    const counterpartyCollateral =
      Number(BigInt(position.counterpartyCollateral || '0')) / 1e18;
    const totalCollateral =
      Number(BigInt(position.totalCollateral || '0')) / 1e18;

    console.log(`Position ID: ${position.id}`);
    console.log(`  Status: ${position.status}`);
    console.log(`  Predictor: ${position.predictor}`);
    console.log(`  Counterparty: ${position.counterparty}`);
    console.log(`  Counterparty Collateral: $${counterpartyCollateral.toFixed(2)}`);
    console.log(`  Total Collateral: $${totalCollateral.toFixed(2)}`);
    console.log(`  Predictor Won: ${position.predictorWon}`);
    console.log(`  Minted At: ${new Date(position.mintedAt * 1000).toISOString()}`);
    console.log(`  Conditions:`);
    for (const pred of position.predictions) {
      console.log(`    - ${pred.condition.question}`);
      console.log(`      Outcome: ${pred.outcomeYes ? 'YES' : 'NO'}`);
      console.log(
        `      Resolved: ${pred.condition.settled ? (pred.condition.resolvedToYes ? 'YES' : 'NO') : 'PENDING'}`
      );
    }
    console.log('');
  }

  console.log(`\nTotal: ${highCollateralPositions.length} positions`);
}
