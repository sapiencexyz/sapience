import { Resolver, Query, Arg, Int } from 'type-graphql';
import { Between } from 'typeorm';
import dataSource from '../../db';
import { Resource } from '../../models/Resource';
import { ResourcePrice } from '../../models/ResourcePrice';
import { MarketPrice } from '../../models/MarketPrice';
import { MarketGroup } from '../../models/MarketGroup';
import { Market } from '../../models/Market';
import { CandleType } from '../types';
import { CandleCacheRetriever } from 'src/candle-cache/candleCacheRetriever';
import { CandleAndTimestampType } from '../types/CandleAndTimestampType';

interface PricePoint {
  timestamp: number;
  value: string;
}

interface ResourcePricePoint {
  timestamp: number;
  value: string;
  used: string;
  feePaid: string;
}

const groupPricesByInterval = (
  prices: PricePoint[],
  intervalSeconds: number,
  startTimestamp: number,
  endTimestamp: number,
  lastKnownPrice?: string
): CandleType[] => {
  const candles: CandleType[] = [];

  // If we have no prices and no reference price, return empty array
  if (prices.length === 0 && !lastKnownPrice) return [];

  // Normalize timestamps to interval boundaries
  const normalizedStartTimestamp =
    Math.floor(startTimestamp / intervalSeconds) * intervalSeconds;
  const normalizedEndTimestamp =
    Math.floor(endTimestamp / intervalSeconds) * intervalSeconds;

  // Initialize lastClose with lastKnownPrice if available, otherwise use first price
  let lastClose = lastKnownPrice;

  for (
    let timestamp = normalizedStartTimestamp;
    timestamp <= normalizedEndTimestamp;
    timestamp += intervalSeconds
  ) {
    const pricesInInterval = prices.filter((p) => {
      const priceInterval =
        Math.floor(p.timestamp / intervalSeconds) * intervalSeconds;
      return priceInterval === timestamp;
    });

    if (pricesInInterval.length > 0) {
      // Create candle with actual price data
      const values = pricesInInterval.map((p) => BigInt(p.value));
      const currentOpen = lastClose || values[0].toString(); // Use previous close as open, or first value if no previous close
      lastClose = values[values.length - 1].toString();

      candles.push({
        timestamp,
        open: currentOpen,
        high: values.reduce((a, b) => (a > b ? a : b)).toString(),
        low: values.reduce((a, b) => (a < b ? a : b)).toString(),
        close: lastClose,
      });
    } else {
      // Create empty candle with last known closing price
      candles.push({
        timestamp,
        open: lastClose || '0',
        high: lastClose || '0',
        low: lastClose || '0',
        close: lastClose || '0',
      });
    }
  }

  return candles;
};

const getIndexPriceAtTime = (
  orderedPrices: ResourcePricePoint[],
  timestamp: number
): CandleType => {
  let totalGasUsed: bigint = 0n;
  let totalBaseFeesPaid: bigint = 0n;
  let lastClose: string = '';

  // Add to the sliding window trailing average the prices that are now in the interval
  for (let i = 0; i < orderedPrices.length; i++) {
    if (orderedPrices[i].timestamp <= timestamp) {
      totalGasUsed += BigInt(orderedPrices[i].used);
      totalBaseFeesPaid += BigInt(orderedPrices[i].feePaid);
    }
  }

  // Calculate the average price for the interval
  if (totalGasUsed > 0n) {
    const averagePrice: bigint = totalBaseFeesPaid / totalGasUsed;
    lastClose = averagePrice.toString();
  }

  return {
    timestamp,
    open: lastClose,
    high: lastClose,
    low: lastClose,
    close: lastClose,
  };
};

@Resolver()
export class CandleResolver {
  // For retrieving the exact settlement price
  @Query(() => CandleType, { nullable: true })
  async indexPriceAtTime(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('marketId', () => String) marketId: string,
    @Arg('timestamp', () => Int) timestamp: number
  ): Promise<CandleType | null> {
    try {
      const marketGroup = await dataSource.getRepository(MarketGroup).findOne({
        where: { chainId, address: address.toLowerCase() },
      });

      if (!marketGroup) {
        throw new Error(
          `Market not found with chainId: ${chainId} and address: ${address}`
        );
      }

      const market = await dataSource.getRepository(Market).findOne({
        where: {
          marketGroup: { id: marketGroup.id },
          marketId: Number(marketId),
        },
      });

      if (!market) {
        throw new Error(`Market not found with id: ${marketId}`);
      }

      const resource = await dataSource.getRepository(Resource).findOne({
        where: {
          marketGroups: { id: marketGroup.id },
        },
      });

      if (!resource) {
        throw new Error(`Resource not found for market: ${marketGroup.id}`);
      }

      const epochStartTimestamp = Number(market.startTimestamp);
      if (timestamp < epochStartTimestamp) {
        throw new Error(`Timestamp is before epoch start time`);
      }

      const pricesInRange = await dataSource.getRepository(ResourcePrice).find({
        where: {
          resource: { id: resource.id },
          timestamp: Between(epochStartTimestamp, timestamp),
        },
        order: { timestamp: 'ASC' },
      });

      return getIndexPriceAtTime(
        pricesInRange.map((p) => ({
          timestamp: Number(p.timestamp),
          value: p.value,
          used: p.used,
          feePaid: p.feePaid,
        })),
        timestamp
      );
    } catch (error) {
      console.error('Error fetching index price at time:', error);
      throw new Error('Failed to fetch index price at time');
    }
  }

  @Query(() => [CandleType])
  async legacyMarketCandles(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('marketId', () => String) marketId: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number
  ): Promise<CandleType[]> {
    try {
      const marketGroup = await dataSource.getRepository(MarketGroup).findOne({
        where: { chainId, address: address.toLowerCase() },
      });

      if (!marketGroup) {
        throw new Error(
          `Market not found with chainId: ${chainId} and address: ${address}`
        );
      }

      const market = await dataSource.getRepository(Market).findOne({
        where: {
          marketGroup: { id: marketGroup.id },
          marketId: Number(marketId),
        },
      });

      if (!market) {
        throw new Error(`Market not found with id: ${marketId}`);
      }

      // First get the most recent price before the from timestamp
      const lastPriceBefore = await dataSource
        .getRepository(MarketPrice)
        .createQueryBuilder('marketPrice')
        .leftJoinAndSelect('marketPrice.transaction', 'transaction')
        .leftJoinAndSelect('transaction.event', 'event')
        .leftJoinAndSelect('event.marketGroup', 'marketGroup')
        .leftJoinAndSelect('transaction.position', 'position')
        .leftJoinAndSelect('position.epoch', 'epoch')
        .where('marketGroup.chainId = :chainId', { chainId })
        .andWhere('marketGroup.address = :address', {
          address: address.toLowerCase(),
        })
        .andWhere('market.marketId = :marketId', { marketId: Number(marketId) })
        .andWhere('CAST(marketPrice.timestamp AS bigint) < :from', {
          from: from.toString(),
        })
        .orderBy('marketPrice.timestamp', 'DESC')
        .take(1)
        .getOne();

      // Then get all prices within the range
      const pricesInRange = await dataSource
        .getRepository(MarketPrice)
        .createQueryBuilder('marketPrice')
        .leftJoinAndSelect('marketPrice.transaction', 'transaction')
        .leftJoinAndSelect('transaction.event', 'event')
        .leftJoinAndSelect('event.marketGroup', 'marketGroup')
        .leftJoinAndSelect('transaction.position', 'position')
        .leftJoinAndSelect('position.market', 'market')
        .where('marketGroup.chainId = :chainId', { chainId })
        .andWhere('marketGroup.address = :address', {
          address: address.toLowerCase(),
        })
        .andWhere('market.marketId = :marketId', { marketId: Number(marketId) })
        .andWhere(
          'CAST(marketPrice.timestamp AS bigint) BETWEEN :from AND :to',
          { from: from.toString(), to: to.toString() }
        )
        .orderBy('marketPrice.timestamp', 'ASC')
        .getMany();

      // Combine the results, putting the last price before first if it exists
      const prices = pricesInRange;
      const lastKnownPrice = lastPriceBefore?.value;

      return groupPricesByInterval(
        prices.map((p) => ({ timestamp: Number(p.timestamp), value: p.value })),
        interval,
        from,
        to,
        lastKnownPrice
      );
    } catch (error) {
      console.error('Error fetching market candles:', error);
      throw new Error('Failed to fetch market candles');
    }
  }

  // Same endpoints but using the candle cache
  @Query(() => CandleAndTimestampType)
  async resourceCandles(
    @Arg('slug', () => String) slug: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number
  ): Promise<CandleAndTimestampType> {
    const candleCacheRetrieve = CandleCacheRetriever.getInstance();
    const { data, lastUpdateTimestamp } =
      await candleCacheRetrieve.getResourcePrices(slug, from, to, interval);
    return { data, lastUpdateTimestamp };
  }

  @Query(() => CandleAndTimestampType)
  async resourceTrailingAverageCandles(
    @Arg('slug', () => String) slug: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number,
    @Arg('trailingAvgTime', () => Int) trailingAvgTime: number
  ): Promise<CandleAndTimestampType> {
    const candleCacheRetrieve = CandleCacheRetriever.getInstance();
    const { data, lastUpdateTimestamp } =
      await candleCacheRetrieve.getTrailingAvgPrices(
        slug,
        from,
        to,
        interval,
        trailingAvgTime
      );
    return { data, lastUpdateTimestamp };
  }

  @Query(() => CandleAndTimestampType)
  async indexCandles(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('marketId', () => String) marketId: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number
  ): Promise<CandleAndTimestampType> {
    const candleCacheRetrieve = CandleCacheRetriever.getInstance();
    const { data, lastUpdateTimestamp } =
      await candleCacheRetrieve.getIndexPrices(
        from,
        to,
        interval,
        chainId,
        address,
        marketId
      );
    return { data, lastUpdateTimestamp };
  }

  @Query(() => CandleAndTimestampType)
  async marketCandles(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('marketId', () => String) marketId: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number
  ): Promise<CandleAndTimestampType> {
    const candleCacheRetrieve = CandleCacheRetriever.getInstance();
    const { data, lastUpdateTimestamp } =
      await candleCacheRetrieve.getMarketPrices(
        from,
        to,
        interval,
        chainId,
        address,
        marketId
      );
    return { data, lastUpdateTimestamp };
  }
}
