import {
  cacheParamRepository,
  marketPriceRepository,
  resourcePriceRepository,
  cacheCandleRepository,
  marketGroupRepository,
} from 'src/db';
import { CacheParam } from 'src/models/CacheParam';
import { ResourcePrice } from 'src/models/ResourcePrice';
import { FindOptionsWhere, MoreThan, Between } from 'typeorm';
import { ReducedMarketPrice } from './types';
import { CacheCandle } from 'src/models/CacheCandle';
import { CANDLE_TYPES } from './config';
import { MarketGroup } from 'src/models/MarketGroup';

export interface ResourcePriceParams {
  initialTimestamp: number;
  quantity: number;
  resourceSlug?: string;
  startTimestamp?: number;
  endTimestamp?: number;
}

export async function getParam(paramName: string) {
  const config = await cacheParamRepository.findOne({
    where: { paramName },
  });
  if (!config) {
    return 0;
  }
  return config.paramValueNumber;
}

export async function setParam(paramName: string, paramValue: number) {
  let config = await cacheParamRepository.findOne({ where: { paramName } });
  if (!config) {
    config = new CacheParam();
    config.paramName = paramName;
    config.paramValueNumber = paramValue;
  }
  config.paramValueNumber = paramValue;
  await cacheParamRepository.save(config);
}

export async function getResourcePricesCount(params: ResourcePriceParams): Promise<number> {
  const where: FindOptionsWhere<ResourcePrice> = {
    timestamp: MoreThan(params.initialTimestamp),
  };

  if (params.resourceSlug) {
    where.resource = { slug: params.resourceSlug };
  }

  if (params.startTimestamp && params.endTimestamp) {
    where.timestamp = Between(params.startTimestamp, params.endTimestamp);
  } else if (params.startTimestamp) {
    where.timestamp = MoreThan(params.startTimestamp);
  } else if (params.endTimestamp) {
    where.timestamp = Between(params.initialTimestamp, params.endTimestamp);
  }

  return resourcePriceRepository.count({
    where,
    relations: ['resource'],
  });
}

export async function getResourcePrices(params: ResourcePriceParams): Promise<{ prices: ResourcePrice[]; hasMore: boolean }> {
  const where: FindOptionsWhere<ResourcePrice> = {
    timestamp: MoreThan(params.initialTimestamp),
  };

  if (params.resourceSlug) {
    where.resource = { slug: params.resourceSlug };
  }

  if (params.startTimestamp && params.endTimestamp) {
    where.timestamp = Between(params.startTimestamp, params.endTimestamp);
  } else if (params.startTimestamp) {
    where.timestamp = MoreThan(params.startTimestamp);
  } else if (params.endTimestamp) {
    where.timestamp = Between(params.initialTimestamp, params.endTimestamp);
  }

  const prices = await resourcePriceRepository.find({
    where,
    order: { timestamp: 'ASC' },
    relations: ['resource'],
    take: params.quantity + 1,
  });

  const hasMore = prices.length > params.quantity;
  if (hasMore) {
    prices.pop();
  }

  return { prices, hasMore };
}

export async function getMarketPrices({
  initialTimestamp,
  quantity,
}: {
  initialTimestamp?: number;
  quantity: number;
}): Promise<{ prices: ReducedMarketPrice[]; hasMore: boolean }> {
  const marketPrices = await marketPriceRepository.find({
    where: {
      timestamp: MoreThan(initialTimestamp?.toString() ?? '0'),
    },
    order: {
      timestamp: 'ASC',
    },
    take: quantity,
    relations: [
      'transaction',
      'transaction.position',
      'transaction.position.market',
    ],
  });

  const cleanedMarketPrices = marketPrices.filter((item) => {
    return (
      item.transaction !== null &&
      item.transaction.position !== null &&
      item.transaction.position.market !== null
    );
  });

  const reducedMarketPrices = cleanedMarketPrices.map((item) => ({
    value: item.value,
    timestamp: Number(item.timestamp),
    market: item.transaction.position.market.id,
  }));

  return {
    prices: reducedMarketPrices,
    hasMore: marketPrices.length === quantity,
  };
}

export async function getLatestCandle({
  candleType,
  interval,
  marketIdx,
  resourceSlug,
}: {
  candleType: string;
  interval: number;
  marketIdx: number | undefined;
  resourceSlug: string | undefined;
}): Promise<CacheCandle | null> {
  const where: FindOptionsWhere<CacheCandle> = { candleType, interval };
  if (marketIdx) {
    where.marketIdx = marketIdx;
  }
  if (resourceSlug) {
    where.resourceSlug = resourceSlug;
  }
  const candle = await cacheCandleRepository.findOne({
    where,
    order: { timestamp: 'DESC' },
  });
  return candle;
}

export async function getMarketGroups(): Promise<MarketGroup[]> {
  return marketGroupRepository.find({
    relations: ['markets', 'markets.resource'],
  });
}

export async function getLastCandleFromDb({
  candleType,
  interval,
  marketIdx,
  resourceSlug,
  trailingAvgTime,
}: {
  candleType: string;
  interval: number;
  marketIdx?: number;
  resourceSlug?: string;
  trailingAvgTime?: number;
}) {
  const where: FindOptionsWhere<CacheCandle> = { candleType, interval };
  if (marketIdx) {
    where.marketIdx = marketIdx;
  }
  if (resourceSlug) {
    where.resourceSlug = resourceSlug;
  }
  if (trailingAvgTime) {
    where.trailingAvgTime = trailingAvgTime;
  }
  
  const candle = await cacheCandleRepository.findOne({
    where,
    order: { timestamp: 'DESC' },
  });
  return candle;
}

export async function saveCandle(candle: CacheCandle) {
  await cacheCandleRepository.save(candle);
}

export async function saveCandles(candles: CacheCandle[]) {
  await cacheCandleRepository.save(candles);
}

export async function getCandles({
  from,
  to,
  interval,
  candleType,
  resourceId,
  marketIdx,
  trailingAvgTime,
}: {
  from: number;
  to: number;
  interval: number;
  candleType: string;
  resourceId?: string;
  marketIdx?: number;
  trailingAvgTime?: number;
}) {
  const where: FindOptionsWhere<CacheCandle> = { candleType, interval, timestamp: Between(from, to) };
  if(candleType == CANDLE_TYPES.RESOURCE) {
    where.resourceSlug = resourceId;
  } else if(candleType == CANDLE_TYPES.MARKET) {
    where.marketIdx = marketIdx;
  } else if(candleType == CANDLE_TYPES.TRAILING_AVG) {
    where.resourceSlug = resourceId;
    where.trailingAvgTime = trailingAvgTime;
  }
  return cacheCandleRepository.find({
    where,
    order: { timestamp: 'ASC' },
  });
}

export async function getMarketPricesCount(initialTimestamp: number): Promise<number> {
  return marketPriceRepository.count({
    where: {
      timestamp: MoreThan(initialTimestamp?.toString() ?? '0'),
    },
  });
}

export async function truncateCandlesTable() {
  await cacheCandleRepository.clear();
}
