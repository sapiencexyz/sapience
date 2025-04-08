import { Resolver, Query, Arg, Int } from 'type-graphql';
import dataSource from '../../db';
import { Position } from '../../models/Position';
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
      const where: {
        owner?: string;
        epoch?: { market: { chainId: number; address: string } };
      } = {};
      if (owner) {
        where.owner = owner.toLowerCase();
      }
      if (chainId && marketAddress) {
        where.epoch = {
          market: {
            chainId,
            address: marketAddress.toLowerCase(),
          },
        };
      }

      const positions = await dataSource.getRepository(Position).find({
        where,
        relations: [
          'epoch',
          'epoch.market',
          'epoch.market.resource',
          'transactions',
          'transactions.event',
        ],
      });

      const hydratedPositions = positions.map((position) => {
        const hydratedTransactions = hydrateTransactions(
          position.transactions,
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
