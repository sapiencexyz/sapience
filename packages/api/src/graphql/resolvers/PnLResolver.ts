import { Resolver, Query, Arg, Int } from 'type-graphql';
import { PnLType } from '../types/PnLType';
import { MarketPnL } from '../../helpers/marketPnL';
import prisma from '../../db';

@Resolver(() => PnLType)
export class PnLResolver {
  @Query(() => [PnLType])
  async getMarketLeaderboard(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('marketId', () => String) marketId: string
  ): Promise<PnLType[]> {
    try {
      // First get market group info for collateral data
      const marketGroup = await prisma.marketGroup.findFirst({
        where: {
          chainId,
          address: address.toLowerCase(),
        },
      });

      const pnlPerformance = MarketPnL.getInstance();
      const pnlData = await pnlPerformance.getMarketPnLs(
        chainId,
        address,
        parseInt(marketId)
      );

      console.log(`[PnL GraphQL DEBUG] Market group collateral: ${marketGroup?.collateralAsset}, symbol: ${marketGroup?.collateralSymbol}`);

      const result = pnlData.map((pnl) => {
        const mapped = {
          marketId: parseInt(marketId),
          owner: pnl.owner.toLowerCase(),
          totalDeposits: pnl.totalDeposits.toString(),
          totalWithdrawals: pnl.totalWithdrawals.toString(),
          openPositionsPnL: pnl.openPositionsPnL.toString(),
          totalPnL: pnl.totalPnL.toString(),
          positions: Array.from(pnl.positionIds),
          positionCount: pnl.positionCount,
          collateralAddress: marketGroup?.collateralAsset || undefined,
          collateralSymbol: marketGroup?.collateralSymbol || undefined,
        };
        console.log(`[PnL GraphQL DEBUG] Returning PnL for ${pnl.owner}: totalPnL=${mapped.totalPnL} (raw ${marketGroup?.collateralSymbol || 'unknown'} token amount)`);
        return mapped;
      });
      
      console.log(`[PnL GraphQL DEBUG] Returning ${result.length} PnL entries for market ${marketId}`);
      return result;
    } catch (error) {
      console.error('Error fetching markets:', error);
      throw new Error('Failed to fetch markets');
    }
  }
}
