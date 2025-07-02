import prisma from 'src/db';
import { ReducedMarketPrice } from './types';
import { CANDLE_TYPES } from './config';
import type {
  resource_price,
  cache_candle,
  market_group,
  Prisma,
} from '../../generated/prisma';

export interface ResourcePriceParams {
  initialTimestamp: number;
  quantity: number;
  resourceSlug?: string;
  startTimestamp?: number;
  endTimestamp?: number;
}

export async function getParam(paramName: string) {
  const config = await prisma.cache_param.findFirst({
    where: { paramName },
  });
  if (!config) {
    return 0;
  }
  return Number(config.paramValueNumber);
}

export async function setParam(paramName: string, paramValue: number) {
  await prisma.cache_param.upsert({
    where: { paramName },
    update: { paramValueNumber: paramValue },
    create: { paramName, paramValueNumber: paramValue },
  });
}

export async function getStringParam(
  paramName: string
): Promise<string | null> {
  const config = await prisma.cache_param.findFirst({
    where: { paramName },
  });
  if (!config) {
    return null;
  }
  return config.paramValueString;
}

export async function setStringParam(
  paramName: string,
  paramValue: string | null
) {
  await prisma.cache_param.upsert({
    where: { paramName },
    update: { paramValueString: paramValue },
    create: { paramName, paramValueNumber: 0, paramValueString: paramValue },
  });
}

export async function getResourcePricesCount(
  params: ResourcePriceParams
): Promise<number> {
  const where: Prisma.resource_priceWhereInput = {
    timestamp: { gt: params.initialTimestamp },
  };

  if (params.resourceSlug) {
    where.resource = { slug: params.resourceSlug };
  }

  if (params.startTimestamp && params.endTimestamp) {
    where.timestamp = { gte: params.startTimestamp, lte: params.endTimestamp };
  } else if (params.startTimestamp) {
    where.timestamp = { gt: params.startTimestamp };
  } else if (params.endTimestamp) {
    where.timestamp = {
      gte: params.initialTimestamp,
      lte: params.endTimestamp,
    };
  }

  return prisma.resource_price.count({
    where,
  });
}

export async function getResourcePrices(
  params: ResourcePriceParams
): Promise<{ prices: resource_price[]; hasMore: boolean }> {
  const where: Prisma.resource_priceWhereInput = {
    timestamp: { gt: params.initialTimestamp },
  };

  if (params.resourceSlug) {
    where.resource = { slug: params.resourceSlug };
  }

  if (params.startTimestamp && params.endTimestamp) {
    where.timestamp = { gte: params.startTimestamp, lte: params.endTimestamp };
  } else if (params.startTimestamp) {
    where.timestamp = { gt: params.startTimestamp };
  } else if (params.endTimestamp) {
    where.timestamp = {
      gte: params.initialTimestamp,
      lte: params.endTimestamp,
    };
  }

  const prices = await prisma.resource_price.findMany({
    where,
    orderBy: { timestamp: 'asc' },
    include: { resource: true },
    take: params.quantity + 1,
  });

  const hasMore = prices.length > params.quantity;
  if (hasMore) {
    prices.pop();
  }

  return { prices, hasMore };
}

export async function getLatestResourcePrice(
  initialTimestamp: number,
  resourceSlug: string
): Promise<resource_price | null> {
  const resourcePrice = await prisma.resource_price.findFirst({
    where: {
      timestamp: { lt: initialTimestamp },
      resource: { slug: resourceSlug },
    },
    orderBy: {
      timestamp: 'desc',
    },
    include: {
      resource: true,
    },
  });

  if (!resourcePrice) {
    return null;
  }

  return resourcePrice;
}

export async function getMarketPrices({
  initialTimestamp,
  quantity,
}: {
  initialTimestamp?: number;
  quantity: number;
}): Promise<{ prices: ReducedMarketPrice[]; hasMore: boolean }> {
  const marketPrices = await prisma.market_price.findMany({
    where: {
      timestamp: { gt: BigInt(initialTimestamp?.toString() ?? '0') },
    },
    orderBy: {
      timestamp: 'asc',
    },
    take: quantity,
    include: {
      transaction: {
        include: {
          position: {
            include: {
              market: true,
            },
          },
        },
      },
    },
  });

  const cleanedMarketPrices = marketPrices.filter((item) => {
    return (
      item.transaction !== null &&
      item.transaction.position !== null &&
      item.transaction.position.market !== null
    );
  });

  const reducedMarketPrices = cleanedMarketPrices.map((item) => ({
    value: item.value.toString(),
    timestamp: Number(item.timestamp),
    market: item.transaction!.position!.market!.id,
  }));

  return {
    prices: reducedMarketPrices,
    hasMore: marketPrices.length === quantity,
  };
}

export async function getLatestMarketPrice(
  initialTimestamp: number,
  marketIdx: number
): Promise<ReducedMarketPrice | null> {
  const marketPrice = await prisma.market_price.findFirst({
    where: {
      timestamp: { lt: BigInt(initialTimestamp.toString()) },
      transaction: {
        position: {
          market: { id: marketIdx },
        },
      },
    },
    orderBy: {
      timestamp: 'desc',
    },
    include: {
      transaction: {
        include: {
          position: {
            include: {
              market: true,
            },
          },
        },
      },
    },
  });

  if (!marketPrice || !marketPrice.transaction?.position?.market) {
    return null;
  }

  return {
    value: marketPrice.value.toString(),
    timestamp: Number(marketPrice.timestamp),
    market: marketPrice.transaction.position.market.id,
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
}): Promise<cache_candle | null> {
  const where: Prisma.cache_candleWhereInput = { candleType, interval };
  if (marketIdx) {
    where.marketIdx = marketIdx;
  }
  if (resourceSlug) {
    where.resourceSlug = resourceSlug;
  }
  const candle = await prisma.cache_candle.findFirst({
    where,
    orderBy: { timestamp: 'desc' },
  });
  return candle;
}

export async function getMarketGroups(): Promise<market_group[]> {
  return prisma.market_group.findMany({
    include: { market: true, resource: true },
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
  const where: Prisma.cache_candleWhereInput = { candleType, interval };
  if (marketIdx) {
    where.marketIdx = marketIdx;
  }
  if (resourceSlug) {
    where.resourceSlug = resourceSlug;
  }
  if (trailingAvgTime) {
    where.trailingAvgTime = trailingAvgTime;
  }

  const candle = await prisma.cache_candle.findFirst({
    where,
    orderBy: { timestamp: 'desc' },
  });
  return candle;
}

export async function saveCandle(candle: Prisma.cache_candleCreateInput) {
  await prisma.cache_candle.upsert({
    where: {
      candleType_interval_timestamp_resourceSlug_marketIdx_trailingAvgTime: {
        candleType: candle.candleType,
        interval: candle.interval,
        timestamp: candle.timestamp,
        resourceSlug: candle.resourceSlug || null,
        marketIdx: candle.marketIdx || null,
        trailingAvgTime: candle.trailingAvgTime || null,
      } as Prisma.cache_candleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput,
    },
    update: candle,
    create: candle,
  });
}

export async function saveCandles(candles: Prisma.cache_candleCreateInput[]) {
  for (const candle of candles) {
    await saveCandle(candle);
  }
}

export async function getOrCreateCandle({
  candleType,
  interval,
  marketIdx,
  resourceSlug,
  trailingAvgTime,
  timestamp,
}: {
  candleType: string;
  interval: number;
  marketIdx: number;
  resourceSlug: string;
  trailingAvgTime: number;
  timestamp: number;
}) {
  const existingCandle = await prisma.cache_candle.findFirst({
    where: {
      candleType: candleType,
      interval: interval,
      timestamp: timestamp,
      marketIdx: marketIdx,
      resourceSlug: resourceSlug,
      trailingAvgTime: trailingAvgTime,
    },
  });

  if (existingCandle) {
    return existingCandle;
  }

  const newCandle = {
    id: 0, // Temporary ID for new candles
    createdAt: new Date(),
    candleType,
    interval,
    timestamp,
    marketIdx,
    resourceSlug,
    trailingAvgTime,
    open: '0',
    high: '0',
    low: '0',
    close: '0',
    endTimestamp: 0,
    lastUpdatedTimestamp: 0,
    sumUsed: null,
    sumFeePaid: null,
    trailingStartTimestamp: null as number | null,
    address: null as string | null,
    chainId: null as number | null,
    marketId: null as number | null,
  };
  return newCandle;
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
  const where: Prisma.cache_candleWhereInput = {
    candleType,
    interval,
    timestamp: { gte: from, lte: to },
  };
  if (candleType == CANDLE_TYPES.RESOURCE) {
    where.resourceSlug = resourceId;
  } else if (candleType == CANDLE_TYPES.MARKET) {
    where.marketIdx = marketIdx;
  } else if (candleType == CANDLE_TYPES.TRAILING_AVG) {
    where.resourceSlug = resourceId;
    where.trailingAvgTime = trailingAvgTime;
  } else if (candleType == CANDLE_TYPES.INDEX) {
    where.marketIdx = marketIdx;
  }
  return prisma.cache_candle.findMany({
    where,
    orderBy: { timestamp: 'asc' },
  });
}

export async function getMarketPricesCount(
  initialTimestamp: number
): Promise<number> {
  return prisma.market_price.count({
    where: {
      timestamp: { gt: BigInt(initialTimestamp?.toString() ?? '0') },
    },
  });
}

export async function truncateCandlesTable() {
  await prisma.$executeRaw`TRUNCATE TABLE "cache_candle" RESTART IDENTITY`;
}

export async function truncateParamsTable() {
  await prisma.$executeRaw`TRUNCATE TABLE "cache_param" RESTART IDENTITY`;
}
