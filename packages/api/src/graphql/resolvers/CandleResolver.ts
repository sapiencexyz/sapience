import { Resolver, Query, Arg, Int } from 'type-graphql';
import { Between } from 'typeorm';
import dataSource from '../../db';
import { Resource } from '../../models/Resource';
import { ResourcePrice } from '../../models/ResourcePrice';
import { MarketPrice } from '../../models/MarketPrice';
import { Market } from '../../models/Market';
import { Epoch } from '../../models/Epoch';
import { CandleType } from '../types';

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
  let lastClose = lastKnownPrice || prices[0].value;

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
      lastClose = values[values.length - 1].toString();
      candles.push({
        timestamp,
        open: values[0].toString(),
        high: values.reduce((a, b) => (a > b ? a : b)).toString(),
        low: values.reduce((a, b) => (a < b ? a : b)).toString(),
        close: lastClose,
      });
    } else {
      // Create empty candle with last known closing price
      candles.push({
        timestamp,
        open: lastClose,
        high: lastClose,
        low: lastClose,
        close: lastClose,
      });
    }
  }

  return candles;
};

const getTrailingAveragePricesByInterval = (
  orderedPrices: ResourcePricePoint[],
  trailingIntervalSeconds: number,
  intervalSeconds: number,
  startTimestamp: number,
  endTimestamp: number,
  lastKnownPrice?: string
): CandleType[] => {
  const candles: CandleType[] = [];

  // If we have no prices and no reference price, return empty array
  if (orderedPrices.length === 0 && !lastKnownPrice) return [];

  // Normalize timestamps to interval boundaries
  const normalizedStartTimestamp =
    Math.floor(startTimestamp / intervalSeconds) * intervalSeconds;
  const normalizedEndTimestamp =
    Math.floor(endTimestamp / intervalSeconds) * intervalSeconds;

  // Initialize lastClose with lastKnownPrice if available, otherwise use first price
  let lastClose = lastKnownPrice || orderedPrices[0].value;

  let lastStartIdx = 0;
  let lastEndIdx = 0;
  let startIdx = 0;
  let endIdx = 0;

  let totalGasUsed: bigint = 0n;
  let totalBaseFeesPaid: bigint = 0n;

  for (
    let timestamp = normalizedStartTimestamp;
    timestamp <= normalizedEndTimestamp;
    timestamp += intervalSeconds
  ) {
    // get the indexes for the start and end of the interval
    startIdx = orderedPrices.findIndex(
      (p) => p.timestamp >= timestamp - trailingIntervalSeconds
    );
    endIdx = orderedPrices.findIndex((p) => p.timestamp > timestamp); // notice is the next item, we need to correct it later

    // Remove from the sliding window trailing average the prices that are no longer in the interval
    if (startIdx != -1) {
      for (let i = lastStartIdx; i <= startIdx; i++) {
        totalGasUsed -= BigInt(orderedPrices[i].used);
        totalBaseFeesPaid -= BigInt(orderedPrices[i].feePaid);
      }
    }
    lastStartIdx = startIdx;
    // if found and not previous endIdx, correct the +1 offset of the endIdx (since we found the next item)
    if (endIdx != -1 && endIdx > lastEndIdx) {
      endIdx--;
    }

    // If not found, use the last index of the orderedPrices array
    if (endIdx == -1) {
      endIdx = orderedPrices.length - 1;
    }
    // Add to the sliding window trailing average the prices that are now in the interval
    for (let i = lastEndIdx; i <= endIdx; i++) {
      totalGasUsed += BigInt(orderedPrices[i].used);
      totalBaseFeesPaid += BigInt(orderedPrices[i].feePaid);
    }
    lastEndIdx = endIdx;

    // Calculate the average price for the interval
    if (totalGasUsed > 0n) {
      const averagePrice: bigint = totalBaseFeesPaid / totalGasUsed;
      lastClose = averagePrice.toString();
    }

    // Create candle with last known closing price (calculated in the loop or previous candle)
    candles.push({
      timestamp,
      open: lastClose,
      high: lastClose,
      low: lastClose,
      close: lastClose,
    });
  }

  return candles;
};

const getIndexPricesByInterval = (
  orderedPrices: ResourcePricePoint[],
  intervalSeconds: number,
  startTimestamp: number,
  endTimestamp: number,
  lastKnownPrice?: string
): CandleType[] => {
  const candles: CandleType[] = [];

  // If we have no prices and no reference price, return empty array
  if (orderedPrices.length === 0 && !lastKnownPrice) return [];

  // Normalize timestamps to interval boundaries
  const normalizedStartTimestamp =
    Math.floor(startTimestamp / intervalSeconds) * intervalSeconds;
  const normalizedEndTimestamp =
    Math.floor(endTimestamp / intervalSeconds) * intervalSeconds;

  // Initialize lastClose with lastKnownPrice if available, otherwise use first price
  let lastClose = lastKnownPrice || orderedPrices[0].value;

  let endIdx = 0;

  let totalGasUsed: bigint = 0n;
  let totalBaseFeesPaid: bigint = 0n;

  // get the indexes for the start and end of the interval
  let lastEndIdx = orderedPrices.findIndex(
    (p) => p.timestamp >= normalizedStartTimestamp
  );

  for (
    let timestamp = normalizedStartTimestamp;
    timestamp <= normalizedEndTimestamp;
    timestamp += intervalSeconds
  ) {
    endIdx = orderedPrices.findIndex((p) => p.timestamp > timestamp); // notice is the next item, we need to correct it later

    // if found and not previous endIdx, correct the +1 offset of the endIdx (since we found the next item)
    if (endIdx != -1 && endIdx > lastEndIdx) {
      endIdx--;
    }

    // If not found, use the last index of the orderedPrices array
    if (endIdx == -1) {
      endIdx = orderedPrices.length - 1;
    }

    // Add to the sliding window trailing average the prices that are now in the interval
    for (let i = lastEndIdx; i <= endIdx; i++) {
      totalGasUsed += BigInt(orderedPrices[i].used);
      totalBaseFeesPaid += BigInt(orderedPrices[i].feePaid);
    }
    lastEndIdx = endIdx;

    // Calculate the average price for the interval
    if (totalGasUsed > 0n) {
      const averagePrice: bigint = totalBaseFeesPaid / totalGasUsed;
      lastClose = averagePrice.toString();
    }

    // Create candle with last known closing price (calculated in the loop or previous candle)
    candles.push({
      timestamp,
      open: lastClose,
      high: lastClose,
      low: lastClose,
      close: lastClose,
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

      // First get the most recent price before the from timestamp
      const lastPriceBefore = await dataSource
        .getRepository(ResourcePrice)
        .createQueryBuilder('price')
        .where('price.resourceId = :resourceId', { resourceId: resource.id })
        .andWhere('price.timestamp < :from', { from })
        .orderBy('price.timestamp', 'DESC')
        .take(1)
        .getOne();

      // Then get all prices within the range
      const pricesInRange = await dataSource.getRepository(ResourcePrice).find({
        where: {
          resource: { id: resource.id },
          timestamp: Between(from, to),
        },
        order: { timestamp: 'ASC' },
      });

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
      console.error('Error fetching resource candles:', error);
      throw new Error('Failed to fetch resource candles');
    }
  }

  @Query(() => [CandleType])
  async resourceTrailingAverageCandles(
    @Arg('slug', () => String) slug: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number,
    @Arg('trailingTime', () => Int) trailingTime: number
  ): Promise<CandleType[]> {
    try {
      const trailingFrom = from - trailingTime;
      const resource = await dataSource.getRepository(Resource).findOne({
        where: { slug },
      });

      if (!resource) {
        throw new Error(`Resource not found with slug: ${slug}`);
      }

      // First get the most recent price before the trailingFrom timestamp
      const lastPriceBefore = await dataSource
        .getRepository(ResourcePrice)
        .createQueryBuilder('price')
        .where('price.resourceId = :resourceId', { resourceId: resource.id })
        .andWhere('price.timestamp < :from', { from: trailingFrom })
        .orderBy('price.timestamp', 'DESC')
        .take(1)
        .getOne();

      // Then get all prices within the range
      const pricesInRange = await dataSource.getRepository(ResourcePrice).find({
        where: {
          resource: { id: resource.id },
          timestamp: Between(trailingFrom, to),
        },
        order: { timestamp: 'ASC' },
      });

      const lastKnownPrice =
        lastPriceBefore?.feePaid && lastPriceBefore?.used
          ? (
              BigInt(lastPriceBefore?.feePaid) / BigInt(lastPriceBefore?.used)
            ).toString()
          : lastPriceBefore?.value;

      return getTrailingAveragePricesByInterval(
        pricesInRange.map((p) => ({
          timestamp: Number(p.timestamp),
          value: p.value,
          used: p.used,
          feePaid: p.feePaid,
        })),
        trailingTime,
        interval,
        from,
        to,
        lastKnownPrice
      );
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
        throw new Error(
          `Market not found with chainId: ${chainId} and address: ${address}`
        );
      }

      const epoch = await dataSource.getRepository(Epoch).findOne({
        where: {
          market: { id: market.id },
          epochId: Number(epochId),
        },
      });

      if (!epoch) {
        throw new Error(`Epoch not found with id: ${epochId}`);
      }

      const resource = await dataSource.getRepository(Resource).findOne({
        where: {
          markets: { id: market.id },
        },
      });

      if (!resource) {
        throw new Error(`Resource not found for market: ${market.id}`);
      }

      // Ensure we don't query prices before epoch start time
      const effectiveFromTime = Math.max(from, Number(epoch.startTimestamp));

      // Only get last price before if it's after epoch start time
      // First get the most recent price before the trailingFrom timestamp
      const lastPriceBefore =
        effectiveFromTime > Number(epoch.startTimestamp)
          ? await dataSource
              .getRepository(ResourcePrice)
              .createQueryBuilder('price')
              .where('price.resourceId = :resourceId', {
                resourceId: resource.id,
              })
              .andWhere('price.timestamp < :from', { from: effectiveFromTime })
              .andWhere('price.timestamp >= :startTime', {
                startTime: epoch.startTimestamp,
              })
              .orderBy('price.timestamp', 'DESC')
              .take(1)
              .getOne()
          : null;

      const lastKnownPrice = lastPriceBefore
        ? lastPriceBefore?.feePaid && lastPriceBefore?.used
          ? (
              BigInt(lastPriceBefore?.feePaid) / BigInt(lastPriceBefore?.used)
            ).toString()
          : lastPriceBefore?.value
        : undefined;

      const pricesInRange = await dataSource.getRepository(ResourcePrice).find({
        where: {
          resource: { id: resource.id },
          timestamp: Between(effectiveFromTime, to),
        },
        order: { timestamp: 'ASC' },
      });

      return getIndexPricesByInterval(
        pricesInRange.map((p) => ({
          timestamp: Number(p.timestamp),
          value: p.value,
          used: p.used,
          feePaid: p.feePaid,
        })),
        interval,
        effectiveFromTime,
        to,
        lastKnownPrice
      );
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
        throw new Error(
          `Market not found with chainId: ${chainId} and address: ${address}`
        );
      }

      const epoch = await dataSource.getRepository(Epoch).findOne({
        where: {
          market: { id: market.id },
          epochId: Number(epochId),
        },
      });

      if (!epoch) {
        throw new Error(`Epoch not found with id: ${epochId}`);
      }

      // First get the most recent price before the from timestamp
      const lastPriceBefore = await dataSource
        .getRepository(MarketPrice)
        .createQueryBuilder('marketPrice')
        .leftJoinAndSelect('marketPrice.transaction', 'transaction')
        .leftJoinAndSelect('transaction.event', 'event')
        .leftJoinAndSelect('event.market', 'market')
        .leftJoinAndSelect('transaction.position', 'position')
        .leftJoinAndSelect('position.epoch', 'epoch')
        .where('market.chainId = :chainId', { chainId })
        .andWhere('market.address = :address', { address })
        .andWhere('epoch.epochId = :epochId', { epochId: Number(epochId) })
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
        .leftJoinAndSelect('event.market', 'market')
        .leftJoinAndSelect('transaction.position', 'position')
        .leftJoinAndSelect('position.epoch', 'epoch')
        .where('market.chainId = :chainId', { chainId })
        .andWhere('market.address = :address', { address })
        .andWhere('epoch.epochId = :epochId', { epochId: Number(epochId) })
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
}
