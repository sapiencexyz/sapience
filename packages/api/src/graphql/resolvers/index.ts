import { Resolver, Query, Arg, Int, FieldResolver, Root } from 'type-graphql';
import dataSource from '../../db';
import { Market } from '../../models/Market';
import { Resource } from '../../models/Resource';
import { Position } from '../../models/Position';
import { Transaction } from '../../models/Transaction';
import { Epoch } from '../../models/Epoch';
import { ResourcePrice } from '../../models/ResourcePrice';
import { IndexPrice } from '../../models/IndexPrice';
import {
  MarketType,
  ResourceType,
  PositionType,
  TransactionType,
  EpochType,
  ResourcePriceType,
  IndexPriceType,
} from '../types';

const mapMarketToType = (market: Market): MarketType => ({
  id: market.id,
  address: market.address,
  chainId: market.chainId,
  public: market.public,
  epochs: market.epochs?.map(mapEpochToType) || [],
  resource: market.resource ? mapResourceToType(market.resource) : null,
  deployTimestamp: market.deployTimestamp,
  deployTxnBlockNumber: market.deployTxnBlockNumber,
  owner: market.owner,
  collateralAsset: market.collateralAsset,
});

const mapResourceToType = (resource: Resource): ResourceType => ({
  id: resource.id,
  name: resource.name,
  slug: resource.slug,
  markets: resource.markets?.map(mapMarketToType) || [],
  resourcePrices: resource.resourcePrices?.map(mapResourcePriceToType) || [],
});

const mapEpochToType = (epoch: Epoch): EpochType => ({
  id: epoch.id,
  epochId: epoch.epochId,
  startTimestamp: epoch.startTimestamp,
  endTimestamp: epoch.endTimestamp,
  market: mapMarketToType(epoch.market),
  positions: epoch.positions?.map(mapPositionToType) || [],
  indexPrices: epoch.indexPrices?.map(mapIndexPriceToType) || [],
  settled: epoch.settled,
  settlementPriceD18: epoch.settlementPriceD18,
});

const mapPositionToType = (position: Position): PositionType => ({
  id: position.id,
  positionId: position.positionId,
  owner: position.owner,
  isLP: position.isLP,
  baseToken: position.baseToken,
  quoteToken: position.quoteToken,
  collateral: position.collateral,
  epoch: mapEpochToType(position.epoch),
  transactions: position.transactions?.map(mapTransactionToType) || [],
  borrowedBaseToken: position.borrowedBaseToken,
  borrowedQuoteToken: position.borrowedQuoteToken,
  lpBaseToken: position.lpBaseToken,
  lpQuoteToken: position.lpQuoteToken,
  isSettled: position.isSettled,
});

const mapTransactionToType = (transaction: Transaction): TransactionType => ({
  id: transaction.id,
  type: transaction.type,
  timestamp: transaction.event?.timestamp
    ? Number(transaction.event.timestamp)
    : 0,
  position: transaction.position
    ? mapPositionToType(transaction.position)
    : null,
  baseToken: transaction.baseToken,
  quoteToken: transaction.quoteToken,
  collateral: transaction.collateral,
});

const mapResourcePriceToType = (price: ResourcePrice): ResourcePriceType => ({
  id: price.id,
  timestamp: price.timestamp,
  value: price.value,
  resource: price.resource ? mapResourceToType(price.resource) : null,
  blockNumber: price.blockNumber,
});

const mapIndexPriceToType = (price: IndexPrice): IndexPriceType => ({
  id: price.id,
  timestamp: price.timestamp,
  value: price.value,
  epoch: price.epoch ? mapEpochToType(price.epoch) : null,
});

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

@Resolver(() => ResourceType)
export class ResourceResolver {
  @Query(() => [ResourceType])
  async resources(): Promise<ResourceType[]> {
    try {
      const resources = await dataSource.getRepository(Resource).find();
      return resources.map(mapResourceToType);
    } catch (error) {
      console.error('Error fetching resources:', error);
      throw new Error('Failed to fetch resources');
    }
  }

  @Query(() => ResourceType, { nullable: true })
  async resource(
    @Arg('slug', () => String) slug: string
  ): Promise<ResourceType | null> {
    try {
      const resource = await dataSource.getRepository(Resource).findOne({
        where: { slug },
        relations: ['markets', 'resourcePrices'],
      });

      if (!resource) return null;

      return mapResourceToType(resource);
    } catch (error) {
      console.error('Error fetching resource:', error);
      throw new Error('Failed to fetch resource');
    }
  }

  @Query(() => [ResourcePriceType])
  async resourcePrices(
    @Arg('slug', () => String) slug: string,
    @Arg('startTime', () => Int, { nullable: true }) startTime?: number,
    @Arg('endTime', () => Int, { nullable: true }) endTime?: number
  ): Promise<ResourcePriceType[]> {
    try {
      const resource = await dataSource.getRepository(Resource).findOne({
        where: { slug },
      });

      if (!resource) {
        return [];
      }

      const query = dataSource
        .getRepository(ResourcePrice)
        .createQueryBuilder('price')
        .leftJoinAndSelect('price.resource', 'resource')
        .where('price.resourceId = :resourceId', { resourceId: resource.id })
        .orderBy('price.timestamp', 'ASC');

      if (startTime) {
        query.andWhere('price.timestamp >= :startTime', { startTime });
      }
      if (endTime) {
        query.andWhere('price.timestamp <= :endTime', { endTime });
      }

      const prices = await query.getMany();
      return prices.map((price) => mapResourcePriceToType(price));
    } catch (error) {
      console.error('Error fetching resource prices:', error);
      throw new Error('Failed to fetch resource prices');
    }
  }
}

@Resolver(() => PositionType)
export class PositionResolver {
  @Query(() => [PositionType])
  async positions(
    @Arg('owner', () => String, { nullable: true }) owner?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number,
    @Arg('marketAddress', () => String, { nullable: true }) marketAddress?: string
  ): Promise<PositionType[]> {
    try {
      const where: any = {};
      if (owner) {
        where.owner = owner;
      }
      if (chainId && marketAddress) {
        where.epoch = {
          market: {
            chainId,
            address: marketAddress,
          },
        };
      }

      const positions = await dataSource.getRepository(Position).find({
        where,
        relations: ['epoch', 'epoch.market', 'epoch.market.resource', 'transactions'],
      });

      return positions.map(mapPositionToType);
    } catch (error) {
      console.error('Error fetching positions:', error);
      throw new Error('Failed to fetch positions');
    }
  }
}

@Resolver(() => TransactionType)
export class TransactionResolver {
  @Query(() => [TransactionType])
  async transactions(
    @Arg('positionId', () => Int, { nullable: true }) positionId?: number
  ): Promise<TransactionType[]> {
    try {
      const where = {};
      if (positionId) {
        where.position = { id: positionId };
      }

      const transactions = await dataSource.getRepository(Transaction).find({
        where,
      });

      return transactions.map(mapTransactionToType);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw new Error('Failed to fetch transactions');
    }
  }
}

@Resolver(() => EpochType)
export class EpochResolver {
  @Query(() => [EpochType])
  async epochs(
    @Arg('marketId', () => Int, { nullable: true }) marketId?: number
  ): Promise<EpochType[]> {
    try {
      const where = {};
      if (marketId) {
        where.market = { id: marketId };
      }

      const epochs = await dataSource.getRepository(Epoch).find({
        where,
      });

      return epochs.map(mapEpochToType);
    } catch (error) {
      console.error('Error fetching epochs:', error);
      throw new Error('Failed to fetch epochs');
    }
  }
}
