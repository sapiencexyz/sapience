import { Resolver, Query, Arg, Int } from 'type-graphql';
import { getTransactionsInTimeRange } from '../../serviceUtil'; // Assuming serviceUtil path
import { formatUnits } from 'viem';
import { TOKEN_PRECISION } from '../../constants'; // Assuming constants path
import dataSource from '../../db'; // Import dataSource
import { Epoch } from '../../models/Epoch'; // Import Epoch model

// Placeholder for GraphQL return type - might need to define this in schema
// import { Volume } from '../types'; // Assuming a Volume type exists or will be created

@Resolver()
export class VolumeResolver {
  @Query(() => Number) // Using Number for now, might need a custom Scalar or a Volume type
  async totalVolumeByEpoch(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('marketAddress', () => String) marketAddress: string,
    @Arg('epochId', () => Int) epochId: number
  ): Promise<number> {

    // 1. Get epoch start and end timestamps (Needs implementation or existing function)
    const { startTimestamp, endTimestamp } = await getEpochStartEndTimestamps(epochId, chainId, marketAddress);

    if (!startTimestamp || !endTimestamp) {
        throw new Error(`Epoch ${epochId} not found for chain ${chainId}`);
    }

    // 2. Fetch transactions
    const transactions = await getTransactionsInTimeRange(
      startTimestamp,
      endTimestamp,
      chainId.toString(),
      marketAddress
    );

    // 3. Calculate volume
    const totalVolume = transactions.reduce((sum: number, transaction) => {
      // Check if baseToken exists and is a valid number string
      if (transaction.baseToken) {
          try {
              const baseTokenBigInt = BigInt(transaction.baseToken);
              const absBaseTokenDelta = Math.abs(
                parseFloat(
                  formatUnits(baseTokenBigInt, TOKEN_PRECISION)
                )
              );
              return sum + absBaseTokenDelta;
          } catch (error) {
              console.error(`Error processing transaction baseToken: ${transaction.baseToken}`, error);
              // Decide how to handle invalid baseToken values, e.g., skip or throw
              return sum;
          }
      }
      return sum; // Skip transaction if baseToken is missing
    }, 0);

    return totalVolume;
  }
}

// Placeholder function - replace with actual implementation
async function getEpochStartEndTimestamps(epochId: number, chainId: number, marketAddress: string): Promise<{ startTimestamp: number | null; endTimestamp: number | null }> {
    try {
        const epochRepository = dataSource.getRepository(Epoch);
        const epoch = await epochRepository.findOne({
            where: {
                epochId: epochId, // Use number
                market: {
                    chainId: chainId, // Use number
                    address: marketAddress,
                },
            },
            relations: ['market'], // Ensure market relation is loaded
        });

        if (epoch && epoch.startTimestamp && epoch.endTimestamp) {
            // Convert string timestamps from DB to numbers
            return {
                startTimestamp: Number(epoch.startTimestamp),
                endTimestamp: Number(epoch.endTimestamp),
            };
        }
    } catch (error) {
        console.error(`Error fetching epoch ${epochId} for market ${chainId}:${marketAddress}:`, error);
    }

    // Return null if not found or if there was an error
    return { startTimestamp: null, endTimestamp: null };
} 