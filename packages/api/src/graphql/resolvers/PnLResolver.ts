import { Resolver, Query, Arg, Int } from 'type-graphql';
import { PnLType } from '../types';
import { PnLPerformance } from '../../performance';

@Resolver(() => PnLType)
export class PnLResolver {
  @Query(() => [PnLType])
  async getEpochLeaderboard(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('epochId', () => String) epochId: string
  ): Promise<PnLType[]> {
    try {
      const pnlPerformance = PnLPerformance.getInstance();
      const pnlData = await pnlPerformance.getEpochPnLs(
        chainId,
        address,
        parseInt(epochId)
      );

      return pnlData.map((pnl) => {
        return {
          epochId: parseInt(epochId),
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
