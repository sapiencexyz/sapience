import { MigrationInterface, QueryRunner, IsNull, Not } from 'typeorm';
import { Market } from '../models/Market';
import { getProviderForChain } from '../utils';

export class PopulateCollateralDecimals1712699000000 implements MigrationInterface {
  name = 'PopulateCollateralDecimals1712699000000';
  
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Get all markets with collateralAsset but no collateralDecimals
    const markets = await queryRunner.manager.find(Market, {
      where: [
        { 
          collateralAsset: Not(IsNull()), 
          collateralDecimals: IsNull()
        }
      ]
    });

    console.log(`Found ${markets.length} markets to update with collateralDecimals`);

    // Process each market
    for (const market of markets) {
      if (!market.collateralAsset) continue;
      
      try {
        const client = getProviderForChain(market.chainId);
        const decimals = await client.readContract({
          address: market.collateralAsset as `0x${string}`,
          abi: [
            {
              constant: true,
              inputs: [],
              name: 'decimals',
              outputs: [{ name: '', type: 'uint8' }],
              payable: false,
              stateMutability: 'view',
              type: 'function',
            },
          ],
          functionName: 'decimals',
        });

        // Update the market with collateralDecimals
        await queryRunner.manager.update(
          Market,
          { id: market.id },
          { collateralDecimals: Number(decimals) }
        );

        console.log(
          `Updated market ${market.address} on chain ${market.chainId} with collateralDecimals = ${decimals}`
        );
      } catch (error) {
        console.error(
          `Failed to fetch decimals for token ${market.collateralAsset} on market ${market.address}:`,
          error
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert the collateralDecimals to null for all markets
    await queryRunner.manager.update(
      Market, 
      {}, 
      { collateralDecimals: null }
    );
  }
} 