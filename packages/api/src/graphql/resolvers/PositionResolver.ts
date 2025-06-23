import { Resolver, Query, Arg, Int } from 'type-graphql';
import prisma from '../../db';
import { hydrateTransactions } from '../../helpers/hydrateTransactions';
import { Position } from '../types/PrismaTypes';
import type { Prisma } from '../../../generated/prisma';

@Resolver(() => Position)
export class PositionResolver {
  @Query(() => [Position])
  async positions(
    @Arg('owner', () => String, { nullable: true }) owner?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('marketAddress', () => String, { nullable: true })
    marketAddress?: string
  ): Promise<Position[]> {
    try {
      const whereConditions: Prisma.positionWhereInput = {};

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

      const hydratedPositions = positionsResult.map((position) => {
        const hydratedTransactions = hydrateTransactions(
          position.transaction as Parameters<typeof hydrateTransactions>[0],
          false
        );
        return { ...position, transactions: hydratedTransactions };
      });

      return hydratedPositions as unknown as Position[];
    } catch (error) {
      console.error('Error fetching positions:', error);
      throw new Error('Failed to fetch positions');
    }
  }
}
