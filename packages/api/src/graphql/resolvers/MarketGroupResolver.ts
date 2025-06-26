import {
  Resolver,
  Query,
  Arg,
  Int,
  FieldResolver,
  Root,
  InputType,
  Field,
} from 'type-graphql';
import dataSource from '../../db';
import { MarketGroup } from '../../models/MarketGroup';
import { Market } from '../../models/Market';
import { MarketType, MarketGroupType } from '../types';
import { mapMarketGroupToType, mapMarketToType } from './mappers';

@InputType()
export class MarketFilterInput {
  @Field(() => String, { nullable: true })
  endTimestamp_gt?: string;
}

@InputType()
export class MarketOrderInput {
  @Field(() => String)
  field: 'endTimestamp';

  @Field(() => String)
  direction: 'ASC' | 'DESC';
}

@Resolver(() => MarketGroupType)
export class MarketGroupResolver {
  @Query(() => [MarketGroupType])
  async marketGroups(
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('collateralAsset', () => String, { nullable: true })
    collateralAsset?: string,
    @Arg('baseTokenName', () => String, { nullable: true })
    baseTokenName?: string
  ): Promise<MarketGroupType[]> {
    try {
      const queryBuilder = dataSource
        .getRepository(MarketGroup)
        .createQueryBuilder('marketGroup')
        .leftJoinAndSelect('marketGroup.markets', 'markets')
        .leftJoinAndSelect('marketGroup.category', 'category')
        .leftJoinAndSelect('marketGroup.resource', 'resource');

      if (chainId !== undefined) {
        queryBuilder.andWhere('marketGroup.chainId = :chainId', { chainId });
      }

      if (collateralAsset !== undefined) {
        queryBuilder.andWhere(
          'marketGroup.collateralAsset = :collateralAsset',
          { collateralAsset }
        );
      }

      if (baseTokenName !== undefined) {
        queryBuilder.andWhere('marketGroup.baseTokenName = :baseTokenName', {
          baseTokenName,
        });
      }

      const marketGroups = await queryBuilder.getMany();
      const result = marketGroups.map(mapMarketGroupToType);
      // console.log('result', result);
      return result;
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

      return mapMarketGroupToType(marketGroup);
    } catch (error) {
      console.error('Error fetching market group:', error);
      throw new Error('Failed to fetch market group');
    }
  }

  @FieldResolver(() => [MarketType])
  async markets(
    @Root() marketGroup: MarketGroup,
    @Arg('filter', () => MarketFilterInput, { nullable: true })
    filter?: MarketFilterInput,
    @Arg('orderBy', () => MarketOrderInput, { nullable: true })
    orderBy?: MarketOrderInput
  ): Promise<MarketType[]> {
    try {
      let markets = marketGroup.markets;

      if (!markets) {
        const marketRepo = dataSource.getRepository(Market);
        const queryBuilder = marketRepo
          .createQueryBuilder('market')
          .where('market.marketGroupId = :marketGroupId', {
            marketGroupId: marketGroup.id,
          });

        if (filter?.endTimestamp_gt) {
          queryBuilder.andWhere('market.endTimestamp > :endTimestamp', {
            endTimestamp: parseInt(filter.endTimestamp_gt, 10),
          });
        }

        if (orderBy?.field === 'endTimestamp') {
          queryBuilder.orderBy('market.endTimestamp', orderBy.direction);
        } else {
          queryBuilder.orderBy('market.endTimestamp', 'ASC');
        }
        markets = await queryBuilder.getMany();
      } else {
        if (filter?.endTimestamp_gt) {
          const endTimestampGt = parseInt(filter.endTimestamp_gt, 10);
          markets = markets.filter(
            (m) => m.endTimestamp && m.endTimestamp > endTimestampGt
          );
        }

        if (orderBy?.field === 'endTimestamp') {
          markets.sort((a, b) => {
            const timeA = a.endTimestamp || 0;
            const timeB = b.endTimestamp || 0;
            if (orderBy.direction === 'ASC') {
              return timeA - timeB;
            } else {
              return timeB - timeA;
            }
          });
        } else {
          markets.sort((a, b) => (a.endTimestamp || 0) - (b.endTimestamp || 0));
        }
      }

      return markets.map(mapMarketToType);
    } catch (error) {
      console.error('Error fetching markets for market group:', error);
      throw new Error('Failed to fetch markets');
    }
  }
}
