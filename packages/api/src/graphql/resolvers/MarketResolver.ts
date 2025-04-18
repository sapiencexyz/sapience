import { Resolver, Query, Arg, Int } from 'type-graphql';
import dataSource from '../../db';
import { Market } from '../../models/Market';
import { MarketType } from '../types';
import { mapMarketToType } from './mappers';

@Resolver(() => MarketType)
export class MarketResolver {
  @Query(() => [MarketType])
  async markets(
    @Arg('marketId', () => Int) marketId: number,
    @Arg('chainId', () => Int) chainId: number,
    @Arg('marketAddress', () => String) marketAddress: string
  ): Promise<MarketType[]> {
    try {
      const queryBuilder = dataSource.getRepository(Market)
        .createQueryBuilder('market')
        .leftJoinAndSelect('market.marketGroup', 'marketGroup');
      
      queryBuilder.andWhere('market.marketId = :marketId', { marketId });
      queryBuilder.andWhere('marketGroup.chainId = :chainId', { chainId });
      queryBuilder.andWhere('marketGroup.address = :marketAddress', { marketAddress });

      const markets = await queryBuilder.getMany();

      const result =  markets.map(mapMarketToType);
      return result;
    } catch (error) {
      console.error('Error fetching markets:', error);
      throw new Error('Failed to fetch markets');
    }
  }
}
