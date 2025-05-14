import { Resolver, Query, Arg, Int, FieldResolver, Root } from 'type-graphql';
import dataSource from '../../db';
import { MarketGroup } from '../../models/MarketGroup';
import { Market } from '../../models/Market';
import { MarketType, MarketGroupType } from '../types';
import { mapMarketGroupToType, mapMarketToType, mapResourceToType, mapCategoryToType, mapMarketParamsToType, hexToString } from './mappers';

@Resolver(() => MarketGroupType)
export class MarketGroupResolver {
  @Query(() => [MarketGroupType])
  async marketGroups(): Promise<MarketGroupType[]> {
    try {
      const marketGroups = await dataSource.getRepository(MarketGroup).find({
        relations: ['markets', 'category', 'resource'],
      });

      return await Promise.all(marketGroups.map(mapMarketGroupToType));
    } catch (error) {
      console.error('Error fetching market groups:', error);
      throw new Error('Failed to fetch market groups');
    }
  }

  @Query(() => MarketGroupType, { nullable: true })
  async marketGroup(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string
  ): Promise<MarketGroupType | null> {
    try {
      const marketGroup = await dataSource.getRepository(MarketGroup).findOne({
        where: { chainId, address: address.toLowerCase() },
        relations: ['markets', 'category', 'resource'],
      });

      if (!marketGroup) return null;

      return await mapMarketGroupToType(marketGroup);
    } catch (error) {
      console.error('Error fetching market group:', error);
      throw new Error('Failed to fetch market group');
    }
  }

  @FieldResolver(() => [MarketType])
  async markets(@Root() marketGroup: MarketGroup): Promise<MarketType[]> {
    try {
      const markets = await marketGroup.markets;
      return await Promise.all(markets.map(mapMarketToType));
    } catch (error) {
      console.error('Error fetching markets for market group:', error);
      throw new Error('Failed to fetch markets');
    }
  }
}
