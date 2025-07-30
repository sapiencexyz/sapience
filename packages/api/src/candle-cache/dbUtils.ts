import prisma from 'src/db';
import { ReducedMarketPrice } from './types';
import { CANDLE_TYPES } from './config';
import type {
  ResourcePrice,
  CacheCandle,
  MarketGroup,
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
  const config = await prisma.cacheParam.findFirst({
    where: { paramName },
  });
  if (!config) {
    return 0;
  }
  return Number(config.paramValueNumber);
}

export async function setParam(paramName: string, paramValue: number) {
  await prisma.cacheParam.upsert({
    where: { paramName },
    update: { paramValueNumber: paramValue },
    create: { paramName, paramValueNumber: paramValue },
  });
}

export async function getStringParam(
  paramName: string
): Promise<string | null> {
  const config = await prisma.cacheParam.findFirst({
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
  await prisma.cacheParam.upsert({
    where: { paramName },
    update: { paramValueString: paramValue },
    create: { paramName, paramValueNumber: 0, paramValueString: paramValue },
  });
}

export async function getResourcePricesCount(
  params: ResourcePriceParams
): Promise<number> {
  const where: Prisma.ResourcePriceWhereInput = {
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

  return prisma.resourcePrice.count({
    where,
  });
}

export async function getResourcePrices(
  params: ResourcePriceParams
): Promise<{ prices: ResourcePrice[]; hasMore: boolean }> {
  const where: Prisma.ResourcePriceWhereInput = {
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

  const prices = await prisma.resourcePrice.findMany({
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
): Promise<ResourcePrice | null> {
  const resourcePrice = await prisma.resourcePrice.findFirst({
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

type MarketPriceWithIncludes = Prisma.MarketPriceGetPayload<{
  include: {
    transaction: {
      include: {
        position: {
          include: {
            market: true;
          };
        };
      };
    };
  };
}>;

export async function getMarketPrices({
  initialTimestamp,
  quantity,
}: {
  initialTimestamp?: number;
  quantity: number;
}): Promise<{ prices: ReducedMarketPrice[]; hasMore: boolean }> {
  const marketPrices = await prisma.marketPrice.findMany({
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

  const cleanedmarketPrices = marketPrices.filter(
    (item: MarketPriceWithIncludes) => {
      return (
        item.transaction !== null &&
        item.transaction.position !== null &&
        item.transaction.position.market !== null
      );
    }
  );

  const reducedmarketPrices = cleanedmarketPrices.map(
    (item: MarketPriceWithIncludes) => ({
      value: item.value.toString(),
      timestamp: Number(item.timestamp),
      market: item.transaction!.position!.market!.id,
    })
  );

  return {
    prices: reducedmarketPrices,
    hasMore: marketPrices.length === quantity,
  };
}

export async function getLatestMarketPrice(
  initialTimestamp: number,
  marketIdx: number
): Promise<ReducedMarketPrice | null> {
  const marketPrice = await prisma.marketPrice.findFirst({
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
}): Promise<CacheCandle | null> {
  const where: Prisma.CacheCandleWhereInput = { candleType, interval };
  if (marketIdx) {
    where.marketIdx = marketIdx;
  }
  if (resourceSlug) {
    where.resourceSlug = resourceSlug;
  }
  const candle = await prisma.cacheCandle.findFirst({
    where,
    orderBy: { timestamp: 'desc' },
  });
  return candle;
}

export async function getMarketGroups(): Promise<MarketGroup[]> {
  return prisma.marketGroup.findMany({
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
  const where: Prisma.CacheCandleWhereInput = { candleType, interval };
  if (marketIdx) {
    where.marketIdx = marketIdx;
  }
  if (resourceSlug) {
    where.resourceSlug = resourceSlug;
  }
  if (trailingAvgTime) {
    where.trailingAvgTime = trailingAvgTime;
  }

  const candle = await prisma.cacheCandle.findFirst({
    where,
    orderBy: { timestamp: 'desc' },
  });
  return candle;
}

export async function saveCandle(candle: Prisma.CacheCandleCreateInput) {
  // Exclude the id field from create operation to avoid unique constraint violations
  // Cast to handle runtime objects that may have id field even though type doesn't include it
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...candleWithoutId } =
    candle as Prisma.CacheCandleCreateInput & { id?: string };

  await prisma.cacheCandle.upsert({
    where: {
      candleType_interval_timestamp_resourceSlug_marketIdx_trailingAvgTime: {
        candleType: candle.candleType,
        interval: candle.interval,
        timestamp: candle.timestamp,
        resourceSlug: candle.resourceSlug ?? null,
        marketIdx: candle.marketIdx ?? null,
        trailingAvgTime: candle.trailingAvgTime ?? null,
      } as Prisma.CacheCandleCandleTypeIntervalTimestampResourceSlugMarketIdxTrailingAvgTimeCompoundUniqueInput,
    },
    update: candleWithoutId, // Exclude id from updates to avoid unique constraint violations
    create: candleWithoutId, // Exclude id for creates because sometimes the id is set to 0 when creating a new candle, this lets the DB auto-generate the id.
  });
}

export async function saveCandles(candles: Prisma.CacheCandleCreateInput[]) {
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
  const existingCandle = await prisma.cacheCandle.findFirst({
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
  const where: Prisma.CacheCandleWhereInput = {
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
  return prisma.cacheCandle.findMany({
    where,
    orderBy: { timestamp: 'asc' },
  });
}

export async function getMarketPricesCount(
  initialTimestamp: number
): Promise<number> {
  return prisma.marketPrice.count({
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
