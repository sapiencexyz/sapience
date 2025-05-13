import {
  cacheMetadataRepository,
  marketPriceRepository,
  resourcePriceRepository,
  cacheCandleRepository,
  marketGroupRepository,
} from 'src/db';
import { CacheMetadata } from 'src/models/CacheMetadata';
import { ResourcePrice } from 'src/models/ResourcePrice';
import { FindOptionsWhere, MoreThan, Between } from 'typeorm';
import { ReducedMarketPrice } from './types';
import { CacheCandle } from 'src/models/CacheCandle';
import { CANDLE_TYPES } from './config';
// import { log } from 'src/utils/logs';
// import { CANDLE_CACHE_CONFIG } from './config';

export async function getConfig(paramName: string) {
  const config = await cacheMetadataRepository.findOne({
    where: { paramName },
  });
  if (!config) {
    return 0;
  }
  return config.paramValueNumber;
}

export async function setConfig(paramName: string, paramValue: number) {
  let config = await cacheMetadataRepository.findOne({ where: { paramName } });
  if (!config) {
    config = new CacheMetadata();
    config.paramName = paramName;
    config.paramValueNumber = paramValue;
  }
  config.paramValueNumber = paramValue;
  await cacheMetadataRepository.save(config);
}

export async function getResourcePrices({
  initialTimestamp,
  quantity,
}: {
  initialTimestamp?: number;
  quantity: number;
}): Promise<{ prices: ResourcePrice[]; hasMore: boolean }> {
  const resourcePrices = await resourcePriceRepository.find({
    where: {
      timestamp: MoreThan(initialTimestamp || 0),
    },
    order: {
      timestamp: 'ASC',
    },
    relations: ['resource'],
    take: quantity,
  });
  return {
    prices: resourcePrices,
    hasMore: resourcePrices.length === quantity,
  };
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
      // 'transaction.event',
      // 'transaction.event.marketGroup',
      // 'transaction.event.marketGroup.resource',
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

export async function getMarketGroups() {
  return await marketGroupRepository.find(
    {
      relations: ['resource', 'markets'],
    }
  );
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
  // log({
  //   message: `Getting last candle for ${candleType} ${interval} ${marketIdx} ${resourceSlug} ${trailingAvgTime}`,
  //   prefix: 'getLatestCandleFromDb',
  // });
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
  // if( candle.interval >= 1800) {
  //   log({
  //     message: `Saving candle ${candle.candleType} ${candle.interval} ${candle.timestamp} ${candle.trailingAvgTime} ${candle.resourceSlug} ${candle.marketIdx}`,
  //     prefix: CANDLE_CACHE_CONFIG.logPrefix,
  //   });
  // }
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
    where.trailingAvgTime = trailingAvgTime;
    where.resourceSlug = resourceId;
  } else if(candleType == CANDLE_TYPES.INDEX) {
    where.marketIdx = marketIdx;
  } else {
    throw new Error(`Invalid candle type: ${candleType}`);
  }

  const candles = await cacheCandleRepository.find({
    where,
    order: { timestamp: 'ASC' },
  });
  return candles;
}
