import { Resolver, Query, Arg, Int } from 'type-graphql';
import { Between } from 'typeorm';
import dataSource from '../../db';
import { Resource } from '../../models/Resource';
import { ResourcePrice } from '../../models/ResourcePrice';
import { IndexPrice } from '../../models/IndexPrice';
import { MarketPrice } from '../../models/MarketPrice';
import { Market } from '../../models/Market';
import { Epoch } from '../../models/Epoch';
import { CandleType } from '../types';

interface PricePoint {
  timestamp: number;
  value: string;
}

const groupPricesByInterval = (prices: PricePoint[], intervalSeconds: number): CandleType[] => {
  if (prices.length === 0) return [];

  const candles: CandleType[] = [];
  let currentGroup: PricePoint[] = [];
  let currentIntervalStart = Math.floor(prices[0].timestamp / intervalSeconds) * intervalSeconds;

  for (const price of prices) {
    const priceInterval = Math.floor(price.timestamp / intervalSeconds) * intervalSeconds;
    
    if (priceInterval !== currentIntervalStart && currentGroup.length > 0) {
      // Create candle for current group
      const values = currentGroup.map(p => BigInt(p.value));
      candles.push({
        timestamp: currentIntervalStart,
        open: values[0].toString(),
        high: values.reduce((a, b) => a > b ? a : b).toString(),
        low: values.reduce((a, b) => a < b ? a : b).toString(),
        close: values[values.length - 1].toString(),
        volume: '0', // We don't track volume in our price feeds
      });

      currentGroup = [];
      currentIntervalStart = priceInterval;
    }

    currentGroup.push(price);
  }

  // Handle the last group
  if (currentGroup.length > 0) {
    const values = currentGroup.map(p => BigInt(p.value));
    candles.push({
      timestamp: currentIntervalStart,
      open: values[0].toString(),
      high: values.reduce((a, b) => a > b ? a : b).toString(),
      low: values.reduce((a, b) => a < b ? a : b).toString(),
      close: values[values.length - 1].toString(),
      volume: '0',
    });
  }

  return candles;
};

@Resolver()
export class CandleResolver {
  @Query(() => [CandleType])
  async resourceCandles(
    @Arg('slug', () => String) slug: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number
  ): Promise<CandleType[]> {
    try {
      const resource = await dataSource.getRepository(Resource).findOne({
        where: { slug },
      });

      if (!resource) {
        throw new Error(`Resource not found with slug: ${slug}`);
      }

      const prices = await dataSource.getRepository(ResourcePrice).find({
        where: {
          resource: { id: resource.id },
          timestamp: Between(from, to),
        },
        order: { timestamp: 'ASC' },
      });

      return groupPricesByInterval(prices, interval);
    } catch (error) {
      console.error('Error fetching resource candles:', error);
      throw new Error('Failed to fetch resource candles');
    }
  }

  @Query(() => [CandleType])
  async indexCandles(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('epochId', () => String) epochId: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number
  ): Promise<CandleType[]> {
    try {
      const market = await dataSource.getRepository(Market).findOne({
        where: { chainId, address },
      });

      if (!market) {
        throw new Error(`Market not found with chainId: ${chainId} and address: ${address}`);
      }

      const epoch = await dataSource.getRepository(Epoch).findOne({
        where: { 
          market: { id: market.id },
          epochId: Number(epochId)
        },
      });

      if (!epoch) {
        throw new Error(`Epoch not found with id: ${epochId}`);
      }

      const prices = await dataSource.getRepository(IndexPrice).find({
        where: {
          epoch: { id: epoch.id },
          timestamp: Between(from, to),
        },
        order: { timestamp: 'ASC' },
      });

      return groupPricesByInterval(prices, interval);
    } catch (error) {
      console.error('Error fetching index candles:', error);
      throw new Error('Failed to fetch index candles');
    }
  }

  @Query(() => [CandleType])
  async marketCandles(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('epochId', () => String) epochId: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number
  ): Promise<CandleType[]> {
    try {
      const market = await dataSource.getRepository(Market).findOne({
        where: { chainId, address },
      });

      if (!market) {
        throw new Error(`Market not found with chainId: ${chainId} and address: ${address}`);
      }

      const epoch = await dataSource.getRepository(Epoch).findOne({
        where: { 
          market: { id: market.id },
          epochId: Number(epochId)
        },
      });

      if (!epoch) {
        throw new Error(`Epoch not found with id: ${epochId}`);
      }

      const prices = await dataSource.getRepository(MarketPrice)
        .createQueryBuilder('marketPrice')
        .leftJoinAndSelect('marketPrice.transaction', 'transaction')
        .leftJoinAndSelect('transaction.event', 'event')
        .leftJoinAndSelect('event.market', 'market')
        .leftJoinAndSelect('transaction.position', 'position')
        .leftJoinAndSelect('position.epoch', 'epoch')
        .where('market.chainId = :chainId', { chainId })
        .andWhere('market.address = :address', { address })
        .andWhere('epoch.epochId = :epochId', { epochId: Number(epochId) })
        .andWhere('CAST(marketPrice.timestamp AS bigint) BETWEEN :from AND :to', { from: from.toString(), to: to.toString() })
        .orderBy('marketPrice.timestamp', 'ASC')
        .getMany();

      return groupPricesByInterval(
        prices.map(p => ({ timestamp: Number(p.timestamp), value: p.value })),
        interval
      );
    } catch (error) {
      console.error('Error fetching market candles:', error);
      throw new Error('Failed to fetch market candles');
    }
  }
} 