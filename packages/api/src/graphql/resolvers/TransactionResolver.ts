import { Resolver, Query, Arg, Int } from 'type-graphql';
import dataSource from '../../db';
import { Transaction } from '../../models/Transaction';
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
      const where: { position?: { id: number } } = {};
      if (positionId) {
        where.position = { id: positionId };
      }

      const transactions = await dataSource.getRepository(Transaction).find({
        where,
        relations: ['event', 'position'],
      });

      const hydratedTransactions = hydrateTransactions(transactions, false);
      return hydratedTransactions.map(mapTransactionToType);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw new Error('Failed to fetch transactions');
    }
  }
}
