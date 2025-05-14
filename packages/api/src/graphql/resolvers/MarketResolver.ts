import { Resolver, Query, Arg, Int, FieldResolver, Root } from 'type-graphql';
import dataSource from '../../db';
import { Market } from '../../models/Market';
import { MarketPrice } from '../../models/MarketPrice';
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
      const queryBuilder = dataSource
        .getRepository(Market)
        .createQueryBuilder('market')
        .leftJoinAndSelect('market.marketGroup', 'marketGroup')
        .leftJoinAndSelect('marketGroup.resource', 'resource');

      queryBuilder.andWhere('market.marketId = :marketId', { marketId });
      queryBuilder.andWhere('marketGroup.chainId = :chainId', { chainId });
      queryBuilder.andWhere('marketGroup.address = :marketAddress', {
        marketAddress: marketAddress.toLowerCase(),
      });

      const markets = await queryBuilder.getMany();

      const result = markets.map(mapMarketToType);
      return result;
    } catch (error) {
      console.error('Error fetching markets:', error);
      throw new Error('Failed to fetch markets');
    }
  }

  @FieldResolver(() => String, { nullable: true })
  async currentPrice(@Root() market: Market): Promise<string | null> {
    if (market.settled) {
      return null;
    }

    try {
      // We need to find the latest MarketPrice associated with this Market.
      // The path is Market -> Position -> Transaction -> MarketPrice.
      const latestMarketPrice = await dataSource
        .getRepository(MarketPrice)
        .createQueryBuilder('marketPrice')
        .innerJoin('marketPrice.transaction', 'transaction')
        .innerJoin('transaction.position', 'position')
        .innerJoin('position.market', 'market_alias') // market is a keyword, use alias
        .where('market_alias.id = :marketId', { marketId: market.id })
        .orderBy('marketPrice.timestamp', 'DESC')
        .getOne();

      return latestMarketPrice ? latestMarketPrice.value : null;
    } catch (e) {
      console.error(`Error fetching currentPrice for market ${market.id}:`, e);
      return null;
    }
  }
}
