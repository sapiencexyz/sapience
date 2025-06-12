import { Resolver, Query, Arg, Int } from 'type-graphql';
import { PnLType } from '../types';
import { EpochPnL } from '../../helpers/epochPnL';

@Resolver(() => PnLType)
export class PnLResolver {
  @Query(() => [PnLType])
  async getMarketLeaderboard(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('marketId', () => String) marketId: string
  ): Promise<PnLType[]> {
    try {
      const pnlPerformance = EpochPnL.getInstance();
      const pnlData = await pnlPerformance.getEpochPnLs(
        chainId,
        address,
        parseInt(marketId)
      );

      return pnlData.map((pnl) => {
        return {
          marketId: parseInt(marketId),
          owner: pnl.owner.toLowerCase(),
          totalDeposits: pnl.totalDeposits.toString(),
          totalWithdrawals: pnl.totalWithdrawals.toString(),
          openPositionsPnL: pnl.openPositionsPnL.toString(),
          totalPnL: pnl.totalPnL.toString(),
          positions: Array.from(pnl.positionIds),
          positionCount: pnl.positionCount,
        };
      });
    } catch (error) {
      console.error('Error fetching epochs:', error);
      throw new Error('Failed to fetch epochs');
    }
  }
}
