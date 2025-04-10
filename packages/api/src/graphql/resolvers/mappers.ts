import { Buffer } from 'buffer';
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

// Helper to decode hex string (0x...) to UTF-8
const hexToString = (hex: string | null | undefined): string | null => {
  if (!hex || !hex.startsWith('0x') || hex.length % 2 !== 0) {
    // Return original if null, not starting with 0x, or has invalid length
    return hex ?? null;
  }
  try {
    const cleanHex = hex.substring(2); // Remove '0x'
    return Buffer.from(cleanHex, 'hex').toString('utf-8');
  } catch (e) {
    console.error(`Failed to decode hex string: ${hex}`, e);
    return hex; // Return original hex on decoding error
  }
};

export const mapMarketToType = (market: Market): MarketType => ({
  id: market.id,
  address: market.address?.toLowerCase(),
  vaultAddress: market.vaultAddress,
  chainId: market.chainId,
  isYin: market.isYin,
  isCumulative: market.isCumulative,
  epochs: market.epochs?.map(mapEpochToType) || [],
  resource: market.resource ? mapResourceToType(market.resource) : null,
  deployTimestamp: market.deployTimestamp,
  deployTxnBlockNumber: market.deployTxnBlockNumber,
  owner: market.owner?.toLowerCase() || null,
  collateralAsset: market.collateralAsset,
  claimStatement: hexToString(market.marketParams?.claimStatement),
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
  question: epoch.question || '',
});

export const mapPositionToType = (position: Position): PositionType => ({
  id: position.id,
  positionId: position.positionId,
  owner: position.owner?.toLowerCase() || '',
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
