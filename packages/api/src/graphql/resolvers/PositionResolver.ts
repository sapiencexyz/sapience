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
      let positionsQuery = await dataSource
        .getRepository(Position)
        .createQueryBuilder('position')
        .leftJoinAndSelect('position.market', 'market')
        .leftJoinAndSelect('market.marketGroup', 'marketGroup')
        .leftJoinAndSelect('marketGroup.resource', 'resource')
        .leftJoinAndSelect('position.transactions', 'transactions')
        .leftJoinAndSelect('transactions.event', 'event');

      if (owner) {
        positionsQuery = positionsQuery.where(
          'LOWER(position.owner) = :owner',
          {
            owner: owner?.toLowerCase(),
          }
        );
      }

      if (chainId && marketAddress) {
        positionsQuery.andWhere(
          'marketGroup.chainId = :chainId AND LOWER(marketGroup.address) = :marketAddress',
          {
            chainId,
            marketAddress: marketAddress.toLowerCase(),
          }
        );
      }

      const positionsResult = await positionsQuery.getMany();

      const hydratedPositions = positionsResult.map((position) => {
        const hydratedTransactions = hydrateTransactions(
          position.transactions,
          false
        );
        return { ...position, transactions: hydratedTransactions };
      });

      return Promise.all(hydratedPositions.map(mapPositionToType));
    } catch (error) {
      console.error('Error fetching positions:', error);
      throw new Error('Failed to fetch positions');
    }
  }
}
