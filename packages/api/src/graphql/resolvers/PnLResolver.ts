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

      const result = pnlData.map((pnl) => ({
        marketId: parseInt(marketId),
        owner: pnl.owner.toLowerCase(),
        totalDeposits: pnl.totalDeposits,
        totalWithdrawals: pnl.totalWithdrawals,
        openPositionsPnL: pnl.openPositionsPnL,
        totalPnL: pnl.totalPnL,
        positions: Array.from(pnl.positionIds),
        positionCount: pnl.positionCount,
        collateralAddress: marketGroup?.collateralAsset || undefined,
        collateralSymbol: marketGroup?.collateralSymbol || undefined,
        collateralDecimals: marketGroup?.collateralDecimals || undefined,
      }));

      return result;
    } catch (error) {
      console.error('Error fetching markets:', error);
      throw new Error('Failed to fetch markets');
    }
  }
}
