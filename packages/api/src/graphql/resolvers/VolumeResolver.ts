import { Resolver, Query, Arg, Int } from 'type-graphql';
import { getTransactionsInTimeRange } from '../../utils/serviceUtil'; // Assuming serviceUtil path
import { formatUnits } from 'viem';
import { TOKEN_PRECISION } from '../../constants'; // Assuming constants path
import prisma from '../../db'; // Import prisma

// Placeholder for GraphQL return type - might need to define this in schema
// import { Volume } from '../types'; // Assuming a Volume type exists or will be created

@Resolver()
export class VolumeResolver {
  @Query(() => Number) // Using Number for now, might need a custom Scalar or a Volume type
  async totalVolumeByMarket(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('marketAddress', () => String) marketAddress: string,
    @Arg('marketId', () => Int) marketId: number
  ): Promise<number> {
    // 1. Get market start and end timestamps (Needs implementation or existing function)
    const { startTimestamp, endTimestamp } = await getMarketStartEndTimestamps(
      marketId,
      chainId,
      marketAddress
    );

    if (!startTimestamp || !endTimestamp) {
      throw new Error(`Market ${marketId} not found for chain ${chainId}`);
    }

    // 2. Fetch transactions
    const transactions = await getTransactionsInTimeRange(
      startTimestamp,
      endTimestamp,
      chainId.toString(),
      marketAddress
    );

    let lastCollateral = BigInt(0);
    let lastPositionId = 0;

    const totalVolume = transactions.reduce((sum: number, transaction) => {
      if (
        transaction.type === 'addLiquidity' ||
        transaction.type === 'removeLiquidity'
      ) {
        return sum;
      }

      if (
        transaction.position &&
        transaction.position.positionId !== lastPositionId
      ) {
        lastCollateral = BigInt(0);
        lastPositionId = transaction.position.positionId;
      }

      if (transaction.collateral) {
        try {
          const currentCollateral = BigInt(transaction.collateral.toString());
          const collateralDelta = currentCollateral - lastCollateral;

          // Use absolute value of collateral change as volume
          const absCollateralDelta = Math.abs(
            parseFloat(
              formatUnits(
                collateralDelta < 0 ? -collateralDelta : collateralDelta,
                TOKEN_PRECISION
              )
            )
          );

          lastCollateral = currentCollateral;

          return sum + absCollateralDelta;
        } catch (error) {
          console.error(
            `Error processing transaction collateral: ${transaction.collateral}`,
            error
          );
          return sum;
        }
      }
      return sum; // Skip transaction if collateral is missing
    }, 0);

    return totalVolume;
  }
}

// Placeholder function - replace with actual implementation
async function getMarketStartEndTimestamps(
  marketId: number,
  chainId: number,
  marketAddress: string
): Promise<{ startTimestamp: number | null; endTimestamp: number | null }> {
  try {
    const market = await prisma.market.findFirst({
      where: {
        marketId: marketId,
        market_group: {
          chainId: chainId,
          address: marketAddress.toLowerCase(),
        },
      },
      include: {
        market_group: true,
      },
    });

    if (market && market.startTimestamp && market.endTimestamp) {
      // Convert string timestamps from DB to numbers
      return {
        startTimestamp: Number(market.startTimestamp),
        endTimestamp: Number(market.endTimestamp),
      };
    }
  } catch (error) {
    console.error(
      `Error fetching market ${marketId} for market group ${chainId}:${marketAddress}:`,
      error
    );
  }

  // Return null if not found or if there was an error
  return { startTimestamp: null, endTimestamp: null };
}
