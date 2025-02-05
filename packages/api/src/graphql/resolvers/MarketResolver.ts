import { Resolver, Query, Arg, Int, FieldResolver, Root } from 'type-graphql';
import dataSource from '../../db';
import { Market } from '../../models/Market';
import { Epoch } from '../../models/Epoch';
import { MarketType, EpochType } from '../types';
import { mapMarketToType, mapEpochToType } from './mappers';

@Resolver(() => MarketType)
export class MarketResolver {
  @Query(() => [MarketType])
  async markets(): Promise<MarketType[]> {
    try {
      const markets = await dataSource.getRepository(Market).find();
      return markets.map(mapMarketToType);
    } catch (error) {
      console.error('Error fetching markets:', error);
      throw new Error('Failed to fetch markets');
    }
  }

  @Query(() => MarketType, { nullable: true })
  async market(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string
  ): Promise<MarketType | null> {
    try {
      const market = await dataSource.getRepository(Market).findOne({
        where: { chainId, address },
      });

      if (!market) return null;

      return mapMarketToType(market);
    } catch (error) {
      console.error('Error fetching market:', error);
      throw new Error('Failed to fetch market');
    }
  }

  @FieldResolver(() => [EpochType])
  async epochs(@Root() market: Market): Promise<EpochType[]> {
    try {
      const epochs = await dataSource.getRepository(Epoch).find({
        where: { market: { id: market.id } },
      });

      return epochs.map(mapEpochToType);
    } catch (error) {
      console.error('Error fetching epochs:', error);
      throw new Error('Failed to fetch epochs');
    }
  }
} 