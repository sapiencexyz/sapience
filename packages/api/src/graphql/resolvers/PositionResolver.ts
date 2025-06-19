import { Resolver, Query, Arg, Int } from 'type-graphql';
import prisma from '../../db';
import { PositionType } from '../types';
import { hydrateTransactions } from '../../helpers/hydrateTransactions';
import { mapPositionToType } from './mappers';

@Resolver(() => PositionType)
export class PositionResolver {
  @Query(() => [PositionType])
  async positions(
    @Arg('owner', () => String, { nullable: true }) owner?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('marketAddress', () => String, { nullable: true })
    marketAddress?: string
  ): Promise<PositionType[]> {
    try {
      const whereConditions: any = {};

      if (owner) {
        whereConditions.owner = owner.toLowerCase();
      }

      if (chainId && marketAddress) {
        whereConditions.market = {
          market_group: {
            chainId: chainId,
            address: marketAddress.toLowerCase(),
          },
        };
      }

      const positionsResult = await prisma.position.findMany({
        where: whereConditions,
        include: {
          market: {
            include: {
              market_group: {
                include: {
                  resource: true,
                },
              },
            },
          },
          transaction: {
            include: {
              event: true,
            },
          },
        },
      });

      const hydratedPositions = positionsResult.map((position: any) => {
        const hydratedTransactions = hydrateTransactions(
          position.transaction,
          false
        );
        return { ...position, transactions: hydratedTransactions };
      });

      return hydratedPositions.map(mapPositionToType);
    } catch (error) {
      console.error('Error fetching positions:', error);
      throw new Error('Failed to fetch positions');
    }
  }
}
