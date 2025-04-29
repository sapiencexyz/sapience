import { Resolver, Query, Arg, Int } from 'type-graphql';
import { PnLType } from '../types';
import { PnLPerformance } from '../../performance';
import { GlobalPnLType } from '../types/GlobalPnLType';

@Resolver(() => PnLType)
export class PnLResolver {
  @Query(() => [PnLType])
  async getMarketLeaderboard(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('marketId', () => String) marketId: string
  ): Promise<PnLType[]> {
    try {
      const pnlPerformance = PnLPerformance.getInstance();
      const pnlData = await pnlPerformance.getMarketPnLs(
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

  @Query(() => [GlobalPnLType])
  async getLeaderboard(): Promise<GlobalPnLType[]> {
    try {
      const pnlPerformance = PnLPerformance.getInstance();
      const globalPnlData = await pnlPerformance.getGlobalPnLs();

      if (!globalPnlData) {
        console.log(`globalPnlData: empty`);
        return [];
      }
      const results: GlobalPnLType[] = globalPnlData.map((pnl) => {
        return {
          owner: pnl.owner,
          totalUnifiedPnL: pnl.totalPnL.toString(),
          collateralPnls: pnl.collateralPnls.map((collateralPnl) => {
            return {
              collateralAsset: collateralPnl.collateralAsset,
              collateralSymbol: collateralPnl.collateralSymbol,
              collateralDecimals: collateralPnl.collateralDecimals.toString(),
              collateralUnifiedPrice:
                collateralPnl.collateralUnifiedPrice.toString(),
              totalDeposits: collateralPnl.totalDeposits.toString(),
              totalWithdrawals: collateralPnl.totalWithdrawals.toString(),
              openPositionsPnL: collateralPnl.openPositionsPnL.toString(),
              totalPnL: collateralPnl.totalPnL.toString(),
              positionCount: collateralPnl.positionCount,
              positions: Array.from(collateralPnl.positionIds),
            };
          }),
        };
      });
      return results;
    } catch (error) {
      console.error('Error fetching epochs:', error);
      throw new Error('Failed to fetch epochs');
    }
  }
}
