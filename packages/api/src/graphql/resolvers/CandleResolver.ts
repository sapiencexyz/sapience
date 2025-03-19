import { Resolver, Query, Arg, Int } from 'type-graphql';
import { Between } from 'typeorm';
import dataSource from '../../db';
import { Resource } from '../../models/Resource';
import { ResourcePrice } from '../../models/ResourcePrice';
import { MarketPrice } from '../../models/MarketPrice';
import { Market } from '../../models/Market';
import { Epoch } from '../../models/Epoch';
import { CandleType } from '../types';
import { ResourcePerformanceManager } from 'src/performance';

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

// const getTrailingAveragePricesByInterval = (
//   orderedPrices: ResourcePricePoint[],
//   trailingIntervalSeconds: number,
//   intervalSeconds: number,
//   startTimestamp: number,
//   endTimestamp: number,
//   lastKnownPrice?: string
// ): CandleType[] => {
//   const candles: CandleType[] = [];

//   // If we have no prices and no reference price, return empty array
//   if (orderedPrices.length === 0 && !lastKnownPrice) return [];

//   // Normalize timestamps to interval boundaries
//   const normalizedStartTimestamp =
//     Math.floor(startTimestamp / intervalSeconds) * intervalSeconds;
//   const normalizedEndTimestamp =
//     Math.floor(endTimestamp / intervalSeconds) * intervalSeconds;

//   // Initialize lastClose with lastKnownPrice if available, otherwise use first price
//   let lastClose = lastKnownPrice || orderedPrices[0].value;

//   let lastStartIdx = 0;
//   let lastEndIdx = 0;
//   let startIdx = 0;
//   let endIdx = 0;

//   let totalGasUsed: bigint = 0n;
//   let totalBaseFeesPaid: bigint = 0n;

//   for (
//     let timestamp = normalizedStartTimestamp;
//     timestamp <= normalizedEndTimestamp;
//     timestamp += intervalSeconds
//   ) {
//     // get the indexes for the start and end of the interval
//     startIdx = orderedPrices.findIndex(
//       (p) => p.timestamp >= timestamp - trailingIntervalSeconds
//     );
//     endIdx = orderedPrices.findIndex((p) => p.timestamp > timestamp); // notice is the next item, we need to correct it later

//     // Remove from the sliding window trailing average the prices that are no longer in the interval
//     if (startIdx != -1) {
//       for (let i = lastStartIdx; i <= startIdx; i++) {
//         totalGasUsed -= BigInt(orderedPrices[i].used);
//         totalBaseFeesPaid -= BigInt(orderedPrices[i].feePaid);
//       }
//     }
//     lastStartIdx = startIdx;
//     // if found and not previous endIdx, correct the +1 offset of the endIdx (since we found the next item)
//     if (endIdx != -1 && endIdx > lastEndIdx) {
//       endIdx--;
//     }

//     // If not found, use the last index of the orderedPrices array
//     if (endIdx == -1) {
//       endIdx = orderedPrices.length - 1;
//     }
//     // Add to the sliding window trailing average the prices that are now in the interval
//     for (let i = lastEndIdx; i <= endIdx; i++) {
//       totalGasUsed += BigInt(orderedPrices[i].used);
//       totalBaseFeesPaid += BigInt(orderedPrices[i].feePaid);
//     }
//     lastEndIdx = endIdx;

//     // Calculate the average price for the interval
//     if (totalGasUsed > 0n) {
//       const averagePrice: bigint = totalBaseFeesPaid / totalGasUsed;
//       lastClose = averagePrice.toString();
//     }

//     // Create candle with last known closing price (calculated in the loop or previous candle)
//     candles.push({
//       timestamp,
//       open: lastClose,
//       high: lastClose,
//       low: lastClose,
//       close: lastClose,
//     });
//   }

//   return candles;
// };

// const getIndexPricesByInterval = (
//   orderedPrices: ResourcePricePoint[], // prices ordered by timestamp starting from the epoch start time
//   intervalSeconds: number,
//   startTimestamp: number,
//   endTimestamp: number
// ): CandleType[] => {
//   const candles: CandleType[] = [];

//   // If we have no prices and no reference price, return empty array
//   if (orderedPrices.length === 0) return [];

//   // Normalize timestamps to interval boundaries
//   const normalizedStartTimestamp =
//     Math.floor(startTimestamp / intervalSeconds) * intervalSeconds;
//   const normalizedEndTimestamp =
//     Math.floor(endTimestamp / intervalSeconds) * intervalSeconds;

//   // Initialize lastClose with lastKnownPrice if available, otherwise use first price
//   let lastClose = orderedPrices[0].value;

//   let endIdx = 0;
//   let lastEndIdx = 0; // always start from the first item in the orderedPrices array, since it starts from the epoch start time

//   let totalGasUsed: bigint = 0n;
//   let totalBaseFeesPaid: bigint = 0n;

//   for (
//     let timestamp = normalizedStartTimestamp;
//     timestamp <= normalizedEndTimestamp;
//     timestamp += intervalSeconds
//   ) {
//     endIdx = orderedPrices.findIndex((p) => p.timestamp > timestamp); // notice is the next item, we need to correct it later

//     // If not found, use the last index of the orderedPrices array
//     if (endIdx == -1) {
//       endIdx = orderedPrices.length;
//     }

//     // Add to the sliding window trailing average the prices that are now in the interval
//     for (let i = lastEndIdx; i < endIdx; i++) {
//       totalGasUsed += BigInt(orderedPrices[i].used);
//       totalBaseFeesPaid += BigInt(orderedPrices[i].feePaid);
//     }
//     lastEndIdx = endIdx;

//     // Calculate the average price for the interval
//     if (totalGasUsed > 0n) {
//       const averagePrice: bigint = totalBaseFeesPaid / totalGasUsed;
//       lastClose = averagePrice.toString();
//     }

//     // Create candle with last known closing price (calculated or previous candle)
//     candles.push({
//       timestamp,
//       open: lastClose,
//       high: lastClose,
//       low: lastClose,
//       close: lastClose,
//     });
//   }

//   return candles;
// };

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
  @Query(() => [CandleType])
  async resourceCandles(
    @Arg('slug', () => String) slug: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number
  ): Promise<CandleType[]> {
    const resourcePerformanceManager = ResourcePerformanceManager.getInstance();
    const resourcePerformance =
      resourcePerformanceManager.getResourcePerformance(slug);

    if (!resourcePerformance) {
      throw new Error(`Resource performance not initialized for ${slug}`);
    }

    const prices = await resourcePerformance.getResourcePrices(
      from,
      to,
      interval
    );

    return prices;
    // try {
    //   const resource = await dataSource.getRepository(Resource).findOne({
    //     where: { slug },
    //   });

    //   if (!resource) {
    //     throw new Error(`Resource not found with slug: ${slug}`);
    //   }

    //   // First get the most recent price before the from timestamp
    //   const lastPriceBefore = await dataSource
    //     .getRepository(ResourcePrice)
    //     .createQueryBuilder('price')
    //     .where('price.resourceId = :resourceId', { resourceId: resource.id })
    //     .andWhere('price.timestamp < :from', { from })
    //     .orderBy('price.timestamp', 'DESC')
    //     .take(1)
    //     .getOne();

    //   // Then get all prices within the range
    //   const pricesInRange = await dataSource.getRepository(ResourcePrice).find({
    //     where: {
    //       resource: { id: resource.id },
    //       timestamp: Between(from, to),
    //     },
    //     order: { timestamp: 'ASC' },
    //   });

    //   // Combine the results, putting the last price before first if it exists
    //   const prices = pricesInRange;
    //   const lastKnownPrice = lastPriceBefore?.value;

    //   return groupPricesByInterval(
    //     prices.map((p) => ({ timestamp: Number(p.timestamp), value: p.value })),
    //     interval,
    //     from,
    //     to,
    //     lastKnownPrice
    //   );
    // } catch (error) {
    //   console.error('Error fetching resource candles:', error);
    //   throw new Error('Failed to fetch resource candles');
    // }
  }

  @Query(() => [CandleType])
  async resourceTrailingAverageCandles(
    @Arg('slug', () => String) slug: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number,
    @Arg('trailingAvgTime', () => Int) trailingAvgTime: number
  ): Promise<CandleType[]> {
    const resourcePerformanceManager = ResourcePerformanceManager.getInstance();
    const resourcePerformance =
      resourcePerformanceManager.getResourcePerformance(slug);

    if (!resourcePerformance) {
      throw new Error(`Resource performance not initialized for ${slug}`);
    }

    const prices = await resourcePerformance.getTrailingAvgPrices(
      from,
      to,
      interval,
      trailingAvgTime
    );

    return prices;

    // try {
    //   const trailingFrom = from - trailingTime;
    //   const resource = await dataSource.getRepository(Resource).findOne({
    //     where: { slug },
    //   });

    //   if (!resource) {
    //     throw new Error(`Resource not found with slug: ${slug}`);
    //   }

    //   // First get the most recent price before the trailingFrom timestamp
    //   const lastPriceBefore = await dataSource
    //     .getRepository(ResourcePrice)
    //     .createQueryBuilder('price')
    //     .where('price.resourceId = :resourceId', { resourceId: resource.id })
    //     .andWhere('price.timestamp < :from', { from: trailingFrom })
    //     .orderBy('price.timestamp', 'DESC')
    //     .take(1)
    //     .getOne();

    //   // Then get all prices within the range
    //   const pricesInRange = await dataSource.getRepository(ResourcePrice).find({
    //     where: {
    //       resource: { id: resource.id },
    //       timestamp: Between(trailingFrom, to),
    //     },
    //     order: { timestamp: 'ASC' },
    //   });

    //   const lastKnownPrice =
    //     lastPriceBefore?.feePaid && lastPriceBefore?.used
    //       ? (
    //           BigInt(lastPriceBefore?.feePaid) / BigInt(lastPriceBefore?.used)
    //         ).toString()
    //       : lastPriceBefore?.value;

    //   return getTrailingAveragePricesByInterval(
    //     pricesInRange.map((p) => ({
    //       timestamp: Number(p.timestamp),
    //       value: p.value,
    //       used: p.used,
    //       feePaid: p.feePaid,
    //     })),
    //     trailingTime,
    //     interval,
    //     from,
    //     to,
    //     lastKnownPrice
    //   );
    // } catch (error) {
    //   console.error('Error fetching resource candles:', error);
    //   throw new Error('Failed to fetch resource candles');
    // }
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
    const resourcePerformanceManager = ResourcePerformanceManager.getInstance();
    const resourcePerformance =
      resourcePerformanceManager.getResourcePerformanceFromChainAndAddress(
        chainId,
        address
      );

    if (!resourcePerformance) {
      throw new Error(
        `Resource performance not initialized for ${chainId}-${address}`
      );
    }

    const prices = await resourcePerformance.getIndexPrices(
      from,
      to,
      interval,
      chainId,
      address,
      epochId
    );

    return prices;
    // try {
    //   const market = await dataSource.getRepository(Market).findOne({
    //     where: { chainId, address },
    //   });

    //   if (!market) {
    //     throw new Error(
    //       `Market not found with chainId: ${chainId} and address: ${address}`
    //     );
    //   }

    //   const epoch = await dataSource.getRepository(Epoch).findOne({
    //     where: {
    //       market: { id: market.id },
    //       epochId: Number(epochId),
    //     },
    //   });

    //   if (!epoch) {
    //     throw new Error(`Epoch not found with id: ${epochId}`);
    //   }

    //   const resource = await dataSource.getRepository(Resource).findOne({
    //     where: {
    //       markets: { id: market.id },
    //     },
    //   });

    //   if (!resource) {
    //     throw new Error(`Resource not found for market: ${market.id}`);
    //   }

    //   // Ensure we don't query prices before epoch start time
    //   const effectiveFromTime = Math.max(from, Number(epoch.startTimestamp));

    //   const pricesInRange = await dataSource.getRepository(ResourcePrice).find({
    //     where: {
    //       resource: { id: resource.id },
    //       timestamp: Between(Number(epoch.startTimestamp), to),
    //     },
    //     order: { timestamp: 'ASC' },
    //   });

    //   return getIndexPricesByInterval(
    //     pricesInRange.map((p) => ({
    //       timestamp: Number(p.timestamp),
    //       value: p.value,
    //       used: p.used,
    //       feePaid: p.feePaid,
    //     })),
    //     interval,
    //     effectiveFromTime,
    //     to
    //   );
    // } catch (error) {
    //   console.error('Error fetching index candles:', error);
    //   throw new Error('Failed to fetch index candles');
    // }
  }

  @Query(() => [CandleType])
  async indexCumulativeCandles(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('epochId', () => String) epochId: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number
  ): Promise<CandleType[]> {
    const resourcePerformanceManager = ResourcePerformanceManager.getInstance();
    const resourcePerformance =
      resourcePerformanceManager.getResourcePerformanceFromChainAndAddress(
        chainId,
        address
      );

    if (!resourcePerformance) {
      throw new Error(
        `Resource performance not initialized for ${chainId}-${address}`
      );
    }

    const prices = await resourcePerformance.getIndexPrices(
      from,
      to,
      interval,
      chainId,
      address,
      epochId,
      true
    );

    return prices;
  }

  // For retrieving the exact settlement price
  @Query(() => CandleType, { nullable: true })
  async indexPriceAtTime(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('epochId', () => String) epochId: string,
    @Arg('timestamp', () => Int) timestamp: number
  ): Promise<CandleType | null> {
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

      const epochStartTimestamp = Number(epoch.startTimestamp);
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
  async marketCandles(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('epochId', () => String) epochId: string,
    @Arg('from', () => Int) from: number,
    @Arg('to', () => Int) to: number,
    @Arg('interval', () => Int) interval: number
  ): Promise<CandleType[]> {
    const resourcePerformanceManager = ResourcePerformanceManager.getInstance();
    const resourcePerformance =
      resourcePerformanceManager.getResourcePerformanceFromChainAndAddress(
        chainId,
        address
      );

    if (!resourcePerformance) {
      throw new Error(
        `Resource performance not initialized for ${chainId}-${address}`
      );
    }

    const prices = await resourcePerformance.getMarketPrices(
      from,
      to,
      interval,
      chainId,
      address,
      epochId
    );

    return prices;
  }

  @Query(() => [CandleType])
  async legacyMarketCandles(
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
