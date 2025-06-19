import { Resolver, Query, Arg, Int } from 'type-graphql';
import prisma from '../../db';
import { TransactionType } from '../types';
import { hydrateTransactions } from '../../helpers/hydrateTransactions';
import { mapTransactionToType } from './mappers';

@Resolver(() => TransactionType)
export class TransactionResolver {
  @Query(() => [TransactionType])
  async transactions(
    @Arg('positionId', () => Int, { nullable: true }) positionId?: number
  ): Promise<TransactionType[]> {
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
      return hydratedTransactions.map(mapTransactionToType);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw new Error('Failed to fetch transactions');
    }
  }
}
