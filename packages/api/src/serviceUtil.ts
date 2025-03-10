import { MarketPrice } from './models/MarketPrice';
import { ONE_DAY_MS, ONE_HOUR_MS, TOKEN_PRECISION } from './constants';
import dataSource from './db';
import { Transaction } from './models/Transaction';
import { TimeWindow } from './interfaces';
import { formatUnits } from 'viem';
import { ResourcePrice } from './models/ResourcePrice';

class EntityGroup<T> {
  startTimestamp: number;
  endTimestamp: number;
  entities: T[];

  constructor(entities: T[]) {
    this.entities = entities;
  }
}

export async function getTransactionsInTimeRange(
  startTimestamp: number,
  endTimestamp: number,
  chainId: string,
  marketAddress: string
): Promise<Transaction[]> {
  const transactionRepository = dataSource.getRepository(Transaction);
  return await transactionRepository
    .createQueryBuilder('transaction')
    .innerJoinAndSelect('transaction.event', 'event')
    .innerJoinAndSelect('event.market', 'market')
    .leftJoinAndSelect('transaction.marketPrice', 'marketPrice')
    .leftJoinAndSelect('transaction.position', 'position')
    .where(
      'CAST(event.timestamp AS BIGINT) BETWEEN :startTimestamp AND :endTimestamp',
      {
        startTimestamp,
        endTimestamp,
      }
    )
    .andWhere('market.chainId = :chainId', { chainId })
    .andWhere('market.address = :marketAddress', { marketAddress })
    .orderBy('CAST(event.timestamp AS BIGINT)', 'ASC')
    .getMany();
}

export async function getMarketPricesInTimeRange(
  startTimestamp: number,
  endTimestamp: number,
  chainId: string,
  address: string,
  epochId: string
) {
  const marketPriceRepository = dataSource.getRepository(MarketPrice);
  return await marketPriceRepository
    .createQueryBuilder('marketPrice')
    .innerJoinAndSelect('marketPrice.transaction', 'transaction')
    .innerJoinAndSelect('transaction.event', 'event')
    .innerJoinAndSelect('event.market', 'market')
    .innerJoinAndSelect('market.epochs', 'epoch', 'epoch.epochId = :epochId')
    .where('market.chainId = :chainId', { chainId })
    .andWhere('market.address = :address', { address })
    .andWhere('epoch.epochId = :epochId', { epochId })
    .andWhere('CAST(marketPrice.timestamp AS bigint) >= :startTimestamp', {
      startTimestamp,
    })
    .andWhere('CAST(marketPrice.timestamp AS bigint) <= :endTimestamp', {
      endTimestamp,
    })
    .orderBy('marketPrice.timestamp', 'ASC')
    .getMany();
}

export function groupTransactionsByTimeWindow(
  transactions: Transaction[],
  window: TimeWindow
): EntityGroup<Transaction>[] {
  return groupEntitiesByTimeWindow(
    transactions,
    window,
    (transaction) => Number(transaction.event.timestamp) * 1000
  );
}

export function groupMarketPricesByTimeWindow(
  marketPrices: MarketPrice[],
  window: TimeWindow
): EntityGroup<MarketPrice>[] {
  const dataFormater = (marketPrice: MarketPrice) => {
    marketPrice.value = formatUnits(BigInt(marketPrice.value), TOKEN_PRECISION);
  };
  return groupEntitiesByTimeWindow(
    marketPrices,
    window,
    (marketPrice) => Number(marketPrice.timestamp) * 1000,
    dataFormater
  );
}

export function getStartTimestampFromTimeWindow(window: TimeWindow) {
  const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds

  const hourInSeconds = 3600;
  const dayInSeconds = 24 * hourInSeconds;
  const weekInSeconds = 7 * dayInSeconds;
  if (window === TimeWindow.D) {
    return now - dayInSeconds;
  }
  if (window === TimeWindow.W) {
    return now - weekInSeconds;
  }
  if (window === TimeWindow.M) {
    return now - 30 * dayInSeconds;
  }
  return now - 365 * dayInSeconds;
}

export function getTimeParamsFromWindow(window: TimeWindow) {
  const now = Date.now();
  let intervalMs: number;
  let startTime: number;

  switch (window) {
    case TimeWindow.M:
      intervalMs = ONE_DAY_MS;
      startTime = now - 30 * ONE_DAY_MS;
      break;
    case TimeWindow.D:
      intervalMs = ONE_HOUR_MS;
      startTime = now - ONE_DAY_MS;
      break;
    case TimeWindow.W:
      intervalMs = 3 * ONE_HOUR_MS;
      startTime = now - 7 * ONE_DAY_MS;
      break;
    default:
      throw new Error('Invalid volume window');
  }

  // Calculate total intervals based on time range and interval size
  const totalIntervals = Math.ceil((now - startTime) / intervalMs);

  return {
    intervalMs,
    totalIntervals,
    startTime,
  };
}

function groupEntitiesByTimeWindow<T>(
  entities: T[],
  window: TimeWindow,
  getTimestamp: (entity: T) => number,
  dataFormatter?: (entity: T) => void
): EntityGroup<T>[] {
  const now = Date.now();
  const { intervalMs, totalIntervals, startTime } =
    getTimeParamsFromWindow(window);

  // Initialize result array
  const result: EntityGroup<T>[] = Array(totalIntervals)
    .fill(null)
    .map((_, index) => ({
      startTimestamp: now - (totalIntervals - index) * intervalMs,
      endTimestamp: now - (totalIntervals - index - 1) * intervalMs,
      entities: [],
    }));

  entities.forEach((entity) => {
    const timestamp = getTimestamp(entity);
    if (timestamp >= startTime && timestamp <= now) {
      const intervalIndex = Math.min(
        Math.floor((timestamp - startTime) / intervalMs),
        totalIntervals - 1
      );
      if (dataFormatter) {
        dataFormatter(entity);
      }
      result[intervalIndex].entities.push(entity);
    }
  });
  return result;
}

export function groupResourcePricesByTimeWindow(
  resourcePrices: ResourcePrice[],
  window: TimeWindow
): EntityGroup<ResourcePrice>[] {
  return groupEntitiesByTimeWindow(
    resourcePrices,
    window,
    (resourcePrice) => Number(resourcePrice.timestamp) * 1000
  );
}
