import { Market } from '../../models/Market';
import { Resource } from '../../models/Resource';
import { Position } from '../../models/Position';
import { Transaction } from '../../models/Transaction';
import { Epoch } from '../../models/Epoch';
import { ResourcePrice } from '../../models/ResourcePrice';
import { HydratedTransaction } from '../../helpers/hydrateTransactions';
import {
  MarketType,
  ResourceType,
  PositionType,
  TransactionType,
  EpochType,
  ResourcePriceType,
} from '../types';

export const mapMarketToType = (market: Market): MarketType => ({
  id: market.id,
  address: market.address,
  vaultAddress: market.vaultAddress,
  chainId: market.chainId,
  isYin: market.isYin,
  epochs: market.epochs?.map(mapEpochToType) || [],
  resource: market.resource ? mapResourceToType(market.resource) : null,
  deployTimestamp: market.deployTimestamp,
  deployTxnBlockNumber: market.deployTxnBlockNumber,
  owner: market.owner,
  collateralAsset: market.collateralAsset,
});

export const mapResourceToType = (resource: Resource): ResourceType => ({
  id: resource.id,
  name: resource.name,
  slug: resource.slug,
  markets: resource.markets?.map(mapMarketToType) || [],
  resourcePrices: resource.resourcePrices?.map(mapResourcePriceToType) || [],
});

export const mapEpochToType = (epoch: Epoch): EpochType => ({
  id: epoch.id,
  epochId: epoch.epochId,
  startTimestamp: epoch.startTimestamp,
  endTimestamp: epoch.endTimestamp,
  market: epoch.market ? mapMarketToType(epoch.market) : null,
  positions: epoch.positions?.map(mapPositionToType) || [],
  settled: epoch.settled,
  settlementPriceD18: epoch.settlementPriceD18,
  public: epoch.public,
});

export const mapPositionToType = (position: Position): PositionType => ({
  id: position.id,
  positionId: position.positionId,
  owner: position.owner,
  isLP: position.isLP,
  baseToken: position.baseToken,
  quoteToken: position.quoteToken,
  collateral: position.collateral,
  epoch: mapEpochToType(position.epoch),
  transactions: position.transactions?.map(mapTransactionToType) || [],
  borrowedBaseToken: position.borrowedBaseToken,
  borrowedQuoteToken: position.borrowedQuoteToken,
  lpBaseToken: position.lpBaseToken,
  lpQuoteToken: position.lpQuoteToken,
  isSettled: position.isSettled,
  lowPriceTick: position.lowPriceTick,
  highPriceTick: position.highPriceTick,
});

export const mapTransactionToType = (
  transaction: HydratedTransaction | Transaction
): TransactionType => ({
  id: transaction.id,
  type: transaction.type,
  timestamp: transaction.event?.timestamp
    ? Number(BigInt(transaction.event.timestamp))
    : 0,
  transactionHash: transaction.event?.transactionHash || null,
  position: transaction.position
    ? mapPositionToType(transaction.position)
    : null,
  baseToken: transaction.baseToken,
  quoteToken: transaction.quoteToken,
  collateral: transaction.collateral,
  lpBaseDeltaToken: transaction.lpBaseDeltaToken,
  lpQuoteDeltaToken: transaction.lpQuoteDeltaToken,
  baseTokenDelta: (transaction as HydratedTransaction).baseTokenDelta || '0',
  quoteTokenDelta: (transaction as HydratedTransaction).quoteTokenDelta || '0',
  collateralDelta: (transaction as HydratedTransaction).collateralDelta || '0',
  tradeRatioD18: transaction.tradeRatioD18 || null,
});

export const mapResourcePriceToType = (
  price: ResourcePrice
): ResourcePriceType => ({
  id: price.id,
  timestamp: price.timestamp,
  value: price.value,
  resource: price.resource ? mapResourceToType(price.resource) : null,
  blockNumber: price.blockNumber,
});
