import DataLoader from 'dataloader';
import prisma from '../db';
import type { transaction } from '../../generated/prisma';

// Batch function to load market groups by IDs
const batchMarketGroups = async (ids: readonly number[]) => {
  const marketGroups = await prisma.market_group.findMany({
    where: { id: { in: [...ids] } },
    include: {
      market: true,
      resource: true,
    },
  });

  const marketMap = new Map(marketGroups.map((market) => [market.id, market]));
  return ids.map((id) => marketMap.get(id));
};

// Batch function to load resources by IDs
const batchResources = async (ids: readonly number[]) => {
  const resources = await prisma.resource.findMany({
    where: { id: { in: [...ids] } },
    include: {
      market_group: true,
      resource_price: true,
    },
  });

  const resourceMap = new Map(
    resources.map((resource) => [resource.id, resource])
  );
  return ids.map((id) => resourceMap.get(id));
};

// Batch function to load positions by IDs
const batchPositions = async (ids: readonly number[]) => {
  const positions = await prisma.position.findMany({
    where: { id: { in: [...ids] } },
    include: {
      market: {
        include: {
          market_group: true,
        },
      },
      transaction: true,
    },
  });

  const positionMap = new Map(
    positions.map((position) => [position.id, position])
  );
  return ids.map((id) => positionMap.get(id));
};

// Batch function to load markets by IDs
const batchMarkets = async (ids: readonly number[]) => {
  const markets = await prisma.market.findMany({
    where: { id: { in: [...ids] } },
    include: {
      market_group: true,
      position: true,
    },
  });

  const epochMap = new Map(markets.map((epoch) => [epoch.id, epoch]));
  return ids.map((id) => epochMap.get(id));
};

// Batch function to load transactions by position IDs
const batchTransactionsByPosition = async (positionIds: readonly number[]) => {
  const transactions = await prisma.transaction.findMany({
    where: { positionId: { in: [...positionIds] } },
    include: {
      position: {
        include: {
          market: {
            include: {
              market_group: true,
            },
          },
        },
      },
    },
  });

  const transactionMap = new Map<number, transaction[]>();
  transactions.forEach((transaction) => {
    const positionId = transaction.positionId;
    if (positionId && !transactionMap.has(positionId)) {
      transactionMap.set(positionId, []);
    }
    if (positionId) {
      transactionMap.get(positionId)!.push(transaction);
    }
  });

  return positionIds.map((id) => transactionMap.get(id) || []);
};

// Create DataLoader instances
export const createLoaders = () => ({
  marketGroupLoader: new DataLoader(batchMarketGroups),
  resourceLoader: new DataLoader(batchResources),
  positionLoader: new DataLoader(batchPositions),
  marketLoader: new DataLoader(batchMarkets),
  transactionsByPositionLoader: new DataLoader(batchTransactionsByPosition),
});
