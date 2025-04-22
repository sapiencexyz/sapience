import DataLoader from 'dataloader';
import { In } from 'typeorm';
import dataSource from '../db';
import { MarketGroup } from '../models/MarketGroup';
import { Resource } from '../models/Resource';
import { Position } from '../models/Position';
import { Transaction } from '../models/Transaction';
import { Market } from '../models/Market';

// Batch function to load markets by IDs
const batchMarketGroups = async (ids: readonly number[]) => {
  const marketGroups = await dataSource.getRepository(MarketGroup).find({
    where: { id: In([...ids]) },
    relations: ['markets', 'resource'],
  });

  const marketMap = new Map(marketGroups.map((market) => [market.id, market]));
  return ids.map((id) => marketMap.get(id));
};

// Batch function to load resources by IDs
const batchResources = async (ids: readonly number[]) => {
  const resources = await dataSource.getRepository(Resource).find({
    where: { id: In([...ids]) },
    relations: ['marketGroups', 'resourcePrices'],
  });

  const resourceMap = new Map(
    resources.map((resource) => [resource.id, resource])
  );
  return ids.map((id) => resourceMap.get(id));
};

// Batch function to load positions by IDs
const batchPositions = async (ids: readonly number[]) => {
  const positions = await dataSource.getRepository(Position).find({
    where: { id: In([...ids]) },
    relations: ['market', 'market.marketGroup', 'transactions'],
  });

  const positionMap = new Map(
    positions.map((position) => [position.id, position])
  );
  return ids.map((id) => positionMap.get(id));
};

// Batch function to load epochs by IDs
const batchMarkets = async (ids: readonly number[]) => {
  const markets = await dataSource.getRepository(Market).find({
    where: { id: In([...ids]) },
    relations: ['marketGroup', 'positions'],
  });

  const epochMap = new Map(markets.map((epoch) => [epoch.id, epoch]));
  return ids.map((id) => epochMap.get(id));
};

// Batch function to load transactions by position IDs
const batchTransactionsByPosition = async (positionIds: readonly number[]) => {
  const transactions = await dataSource.getRepository(Transaction).find({
    where: { position: { id: In([...positionIds]) } },
    relations: ['position', 'position.market', 'position.market.marketGroup'],
  });

  const transactionMap = new Map<number, Transaction[]>();
  transactions.forEach((transaction) => {
    const positionId = transaction.position.id;
    if (!transactionMap.has(positionId)) {
      transactionMap.set(positionId, []);
    }
    transactionMap.get(positionId)!.push(transaction);
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
