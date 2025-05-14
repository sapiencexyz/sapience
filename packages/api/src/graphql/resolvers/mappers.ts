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

export const mapMarketGroupToType = async (
  marketGroup: MarketGroup
): Promise<MarketGroupType> => {
  const markets = await marketGroup.markets;
  const resource = await marketGroup.resource;
  const category = await marketGroup.category;

  const mappedMarkets = await Promise.all(markets.map(mapMarketToType));

  return {
    id: marketGroup.id,
    address: marketGroup.address?.toLowerCase(),
    vaultAddress: marketGroup.vaultAddress,
    chainId: marketGroup.chainId,
    isYin: marketGroup.isYin,
    isCumulative: marketGroup.isCumulative,
    markets: mappedMarkets,
    resource: resource ? await mapResourceToType(resource) : null,
    category: category ? await mapCategoryToType(category) : null,
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
  };
};

export const mapResourceToType = async (resource: Resource): Promise<ResourceType> => {
  const marketGroups = await resource.marketGroups;
  const resourcePrices = await resource.resourcePrices;
  const category = await resource.category;

  const mappedMarketGroups = await Promise.all(marketGroups.map(mapMarketGroupToType));
  const mappedResourcePrices = await Promise.all(resourcePrices.map(mapResourcePriceToType));

  return {
    id: resource.id,
    name: resource.name,
    slug: resource.slug,
    category: category ? await mapCategoryToType(category) : null,
    marketGroups: mappedMarketGroups,
    resourcePrices: mappedResourcePrices,
  };
};

export const mapCategoryToType = async (category: Category): Promise<CategoryType> => {
  const mappedMarketGroups = await Promise.all(category.marketGroups?.map(mapMarketGroupToType) || []);

  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    marketGroups: mappedMarketGroups,
  };
};

export const mapMarketToType = async (market: Market): Promise<MarketType> => {
  const marketGroup = await market.marketGroup;
  const mappedMarketGroup = marketGroup ? await mapMarketGroupToType(marketGroup) : null;
  const mappedPositions = await Promise.all(market.positions?.map(mapPositionToType) || []);

  return {
    id: market.id,
    marketId: market.marketId,
    startTimestamp: market.startTimestamp,
    endTimestamp: market.endTimestamp,
    public: market.public,
    question: market.question || '',
    marketGroup: mappedMarketGroup,
    positions: mappedPositions,
    settled: market.settled,
    settlementPriceD18: market.settlementPriceD18,
    baseAssetMinPriceTick: market.baseAssetMinPriceTick,
    baseAssetMaxPriceTick: market.baseAssetMaxPriceTick,
    poolAddress: market.poolAddress,
    optionName: market.optionName,
    startingSqrtPriceX96: market.startingSqrtPriceX96,
    marketParams: mapMarketParamsToType(market.marketParams),
    currentPrice: null,
  };
};

export const mapPositionToType = async (position: Position): Promise<PositionType> => {
  const mappedMarket = await mapMarketToType(position.market);

  return {
    id: position.id,
    positionId: position.positionId,
    owner: position.owner?.toLowerCase() || '',
    isLP: position.isLP,
    baseToken: position.baseToken,
    quoteToken: position.quoteToken,
    collateral: position.collateral,
    market: mappedMarket,
    transactions: await Promise.all(position.transactions?.map(mapTransactionToType) || []),
    borrowedBaseToken: position.borrowedBaseToken,
    borrowedQuoteToken: position.borrowedQuoteToken,
    lpBaseToken: position.lpBaseToken,
    lpQuoteToken: position.lpQuoteToken,
    isSettled: position.isSettled,
    lowPriceTick: position.lowPriceTick,
    highPriceTick: position.highPriceTick,
  };
};

export const mapTransactionToType = async   (
  transaction: HydratedTransaction | Transaction
): Promise<TransactionType> => ({
  id: transaction.id,
  type: transaction.type,
  timestamp: transaction.event?.timestamp
    ? Number(BigInt(transaction.event.timestamp))
    : 0,
  transactionHash: transaction.event?.transactionHash || null,
  position: transaction.position
    ? await mapPositionToType(transaction.position)
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

export const mapResourcePriceToType = async (
  price: ResourcePrice
): Promise<ResourcePriceType> => {
  const resource = await price.resource;
  const mappedResource = resource ? await mapResourceToType(resource) : null;

  return {
    id: price.id,
    timestamp: price.timestamp,
    value: price.value,
    resource: mappedResource,
    blockNumber: price.blockNumber,
  };
};

// Export the helper functions
export { hexToString, mapMarketParamsToType };
