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
import prisma from '../../db';
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
      const whereConditions: any = {};

      if (chainId !== undefined) {
        whereConditions.chainId = chainId;
      }

      if (collateralAsset !== undefined) {
        whereConditions.collateralAsset = collateralAsset;
      }

      if (baseTokenName !== undefined) {
        whereConditions.baseTokenName = baseTokenName;
      }

      const marketGroups = await prisma.market_group.findMany({
        where: whereConditions,
        include: {
          market: true,
          category: true,
          resource: true,
        },
      });

      return marketGroups.map(mapMarketGroupToType);
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
      const marketGroup = await prisma.market_group.findFirst({
        where: { 
          chainId, 
          address: address.toLowerCase() 
        },
        include: {
          market: true,
          category: true,
          resource: true,
        },
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
    @Root() marketGroup: any,
    @Arg('filter', () => MarketFilterInput, { nullable: true })
    filter?: MarketFilterInput,
    @Arg('orderBy', () => MarketOrderInput, { nullable: true })
    orderBy?: MarketOrderInput
  ): Promise<MarketType[]> {
    try {
      let markets = marketGroup.market;

      if (!markets) {
        const whereConditions: any = {
          marketGroupId: marketGroup.id,
        };

        if (filter?.endTimestamp_gt) {
          whereConditions.endTimestamp = {
            gt: parseInt(filter.endTimestamp_gt, 10),
          };
        }

        const orderByCondition: any = {};
        if (orderBy?.field === 'endTimestamp') {
          orderByCondition.endTimestamp = orderBy.direction.toLowerCase();
        } else {
          orderByCondition.endTimestamp = 'asc';
        }

        markets = await prisma.market.findMany({
          where: whereConditions,
          orderBy: orderByCondition,
        });
      } else {
        if (filter?.endTimestamp_gt) {
          const endTimestampGt = parseInt(filter.endTimestamp_gt, 10);
          markets = markets.filter(
            (m: any) => m.endTimestamp && m.endTimestamp > endTimestampGt
          );
        }

        if (orderBy?.field === 'endTimestamp') {
          markets.sort((a: any, b: any) => {
            const timeA = a.endTimestamp || 0;
            const timeB = b.endTimestamp || 0;
            if (orderBy.direction === 'ASC') {
              return timeA - timeB;
            } else {
              return timeB - timeA;
            }
          });
        } else {
          markets.sort((a: any, b: any) => (a.endTimestamp || 0) - (b.endTimestamp || 0));
        }
      }

      return markets.map(mapMarketToType);
    } catch (error) {
      console.error('Error fetching markets for market group:', error);
      throw new Error('Failed to fetch markets');
    }
  }
}
