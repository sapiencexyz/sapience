import { Buffer } from 'buffer';
import { MarketGroup } from '../../models/MarketGroup';
import { Resource } from '../../models/Resource';
import { Position } from '../../models/Position';
import { Transaction } from '../../models/Transaction';
import { Market } from '../../models/Market';
import { ResourcePrice } from '../../models/ResourcePrice';
import { Category } from '../../models/Category';
import { MarketParams } from '../../models/MarketParams';
import { HydratedTransaction } from '../../helpers/hydrateTransactions';
import {
  MarketGroupType,
  ResourceType,
  PositionType,
  TransactionType,
  MarketType,
  ResourcePriceType,
  CategoryType,
  MarketParamsType,
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

// Helper function to map MarketParams entity to MarketParamsType
const mapMarketParamsToType = (
  params: MarketParams | null
): MarketParamsType | null => {
  if (!params) return null;
  return {
    feeRate: params.feeRate,
    assertionLiveness: params.assertionLiveness,
    bondCurrency: params.bondCurrency,
    bondAmount: params.bondAmount,
    claimStatement: hexToString(params.claimStatement),
    uniswapPositionManager: params.uniswapPositionManager,
    uniswapSwapRouter: params.uniswapSwapRouter,
    uniswapQuoter: params.uniswapQuoter,
    optimisticOracleV3: params.optimisticOracleV3,
  };
};

export const mapMarketGroupToType = (
  marketGroup: MarketGroup
): MarketGroupType => ({
  id: marketGroup.id,
  address: marketGroup.address?.toLowerCase(),
  vaultAddress: marketGroup.vaultAddress,
  chainId: marketGroup.chainId,
  isYin: marketGroup.isYin,
  isCumulative: marketGroup.isCumulative,
  markets: marketGroup.markets?.map(mapMarketToType) || [],
  resource: marketGroup.resource
    ? mapResourceToType(marketGroup.resource)
    : null,
  category: marketGroup.category
    ? mapCategoryToType(marketGroup.category)
    : null,
  deployTimestamp: marketGroup.deployTimestamp,
  deployTxnBlockNumber: marketGroup.deployTxnBlockNumber,
  owner: marketGroup.owner?.toLowerCase() || null,
  collateralAsset: marketGroup.collateralAsset,
  collateralSymbol: marketGroup.collateralSymbol,
  collateralDecimals: marketGroup.collateralDecimals,
  minTradeSize: marketGroup.minTradeSize,
  factoryAddress: marketGroup.factoryAddress,
  initializationNonce: marketGroup.initializationNonce,
  marketParams: mapMarketParamsToType(marketGroup.marketParams),
  question: marketGroup.question,
  claimStatement: hexToString(marketGroup.marketParams?.claimStatement),
  baseTokenName: marketGroup.baseTokenName,
  quoteTokenName: marketGroup.quoteTokenName,
});

export const mapResourceToType = (resource: Resource): ResourceType => ({
  id: resource.id,
  name: resource.name,
  slug: resource.slug,
  category: resource.category ? mapCategoryToType(resource.category) : null,
  marketGroups: resource.marketGroups?.map(mapMarketGroupToType) || [],
  resourcePrices: resource.resourcePrices?.map(mapResourcePriceToType) || [],
});

export const mapCategoryToType = (category: Category): CategoryType => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  marketGroups: category.marketGroups?.map(mapMarketGroupToType) || [],
});

export const mapMarketToType = (market: Market): MarketType => ({
  id: market.id,
  marketId: market.marketId,
  startTimestamp: market.startTimestamp,
  endTimestamp: market.endTimestamp,
  marketGroup: market.marketGroup
    ? mapMarketGroupToType(market.marketGroup)
    : null,
  positions: market.positions?.map(mapPositionToType) || [],
  settled: market.settled,
  settlementPriceD18: market.settlementPriceD18,
  public: market.public,
  question: market.question || '',
  baseAssetMinPriceTick: market.baseAssetMinPriceTick,
  baseAssetMaxPriceTick: market.baseAssetMaxPriceTick,
  poolAddress: market.poolAddress,
  optionName: market.optionName,
  startingSqrtPriceX96: market.startingSqrtPriceX96,
  marketParams: mapMarketParamsToType(market.marketParams),
  currentPrice: null,
});

export const mapPositionToType = (position: Position): PositionType => ({
  id: position.id,
  positionId: position.positionId,
  owner: position.owner?.toLowerCase() || '',
  isLP: position.isLP,
  baseToken: position.baseToken,
  quoteToken: position.quoteToken,
  collateral: position.collateral,
  market: mapMarketToType(position.market),
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
