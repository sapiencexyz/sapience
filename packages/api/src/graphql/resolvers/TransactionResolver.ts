import { Resolver, Query, Arg, Int } from 'type-graphql';
import prisma from '../../db';
import { hydrateTransactions } from '../../helpers/hydrateTransactions';
import { Transaction } from '../types/PrismaTypes';

@Resolver(() => Transaction)
export class TransactionResolver {
  @Query(() => [Transaction])
  async transactions(
    @Arg('positionId', () => Int, { nullable: true }) positionId?: number
  ): Promise<Transaction[]> {
    try {
      const transactions = await prisma.transaction.findMany({
        where: positionId ? { positionId: positionId } : {},
        include: {
          position: {
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
            },
          },
          event: true,
        },
      });

      const hydratedTransactions = hydrateTransactions(transactions, false);
      return hydratedTransactions as unknown as Transaction[];
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw new Error('Failed to fetch transactions');
    }
  }
}
