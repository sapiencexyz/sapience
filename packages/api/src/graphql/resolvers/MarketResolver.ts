import { Resolver, Query, Arg, Int } from 'type-graphql';
import dataSource from '../../db';
import { Market } from '../../models/Market';
import { MarketType } from '../types';
import { mapMarketToType } from './mappers';

@Resolver(() => MarketType)
export class MarketResolver {
  @Query(() => [MarketType])
  async markets(
    @Arg('marketGroupId', () => Int, { nullable: true }) marketGroupId?: number
  ): Promise<MarketType[]> {
    try {
      const where: { marketGroup?: { id: number } } = {};
      if (marketGroupId) {
        where.marketGroup = { id: marketGroupId };
      }

      const markets = await dataSource.getRepository(Market).find({
        where,
        relations: ['marketGroup'],
      });

      return markets.map(mapMarketToType);
    } catch (error) {
      console.error('Error fetching markets:', error);
      throw new Error('Failed to fetch markets');
    }
  }
}
