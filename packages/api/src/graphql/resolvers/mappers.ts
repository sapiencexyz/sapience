import { Buffer } from 'buffer';
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

interface MarketParams {
  feeRate?: number | null;
  assertionLiveness?: string | null;
  bondCurrency?: string | null;
  bondAmount?: string | null;
  claimStatement?: string | null;
  uniswapPositionManager?: string | null;
  uniswapSwapRouter?: string | null;
  uniswapQuoter?: string | null;
  optimisticOracleV3?: string | null;
}

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
    feeRate: params.feeRate ?? null,
    assertionLiveness: params.assertionLiveness ?? null,
    bondCurrency: params.bondCurrency ?? null,
    bondAmount: params.bondAmount ?? null,
    claimStatement: hexToString(params.claimStatement ?? null),
    uniswapPositionManager: params.uniswapPositionManager ?? null,
    uniswapSwapRouter: params.uniswapSwapRouter ?? null,
    uniswapQuoter: params.uniswapQuoter ?? null,
    optimisticOracleV3: params.optimisticOracleV3 ?? null,
  };
};

export const mapMarketGroupToType = (
  marketGroup: any
): MarketGroupType => ({
  id: marketGroup.id,
  address: marketGroup.address?.toLowerCase(),
  vaultAddress: marketGroup.vaultAddress,
  chainId: marketGroup.chainId,
  isYin: marketGroup.isYin,
  isCumulative: marketGroup.isCumulative,
  markets: marketGroup.market?.map(mapMarketToType) || [],
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
  minTradeSize: marketGroup.minTradeSize?.toString() || null,
  factoryAddress: marketGroup.factoryAddress,
  initializationNonce: marketGroup.initializationNonce,
  marketParams: mapMarketParamsToType({
    feeRate: marketGroup.marketParamsFeerate,
    assertionLiveness: marketGroup.marketParamsAssertionliveness?.toString(),
    bondCurrency: marketGroup.marketParamsBondcurrency,
    bondAmount: marketGroup.marketParamsBondamount?.toString(),
    claimStatement: marketGroup.marketParamsClaimstatement,
    uniswapPositionManager: marketGroup.marketParamsUniswappositionmanager,
    uniswapSwapRouter: marketGroup.marketParamsUniswapswaprouter,
    uniswapQuoter: marketGroup.marketParamsUniswapquoter,
    optimisticOracleV3: marketGroup.marketParamsOptimisticoraclev3,
  }),
  question: marketGroup.question,
  claimStatement: hexToString(marketGroup.marketParamsClaimstatement),
  baseTokenName: marketGroup.baseTokenName,
  quoteTokenName: marketGroup.quoteTokenName,
});

export const mapResourceToType = (resource: any): ResourceType => ({
  id: resource.id,
  name: resource.name,
  slug: resource.slug,
  category: resource.category ? mapCategoryToType(resource.category) : null,
  marketGroups: resource.market_group?.map(mapMarketGroupToType) || [],
  resourcePrices: resource.resource_price?.map(mapResourcePriceToType) || [],
});

export const mapCategoryToType = (category: any): CategoryType => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  marketGroups: category.market_group?.map(mapMarketGroupToType) || [],
});

export const mapMarketToType = (market: any): MarketType => ({
  id: market.id,
  marketId: market.marketId,
  startTimestamp: market.startTimestamp,
  endTimestamp: market.endTimestamp,
  marketGroup: market.market_group
    ? mapMarketGroupToType(market.market_group)
    : null,
  positions: market.position?.map(mapPositionToType) || [],
  settled: market.settled,
  settlementPriceD18: market.settlementPriceD18?.toString() || null,
  public: market.public,
  question: market.question || '',
  baseAssetMinPriceTick: market.baseAssetMinPriceTick,
  baseAssetMaxPriceTick: market.baseAssetMaxPriceTick,
  poolAddress: market.poolAddress,
  optionName: market.optionName,
  startingSqrtPriceX96: market.startingSqrtPriceX96?.toString() || null,
  rules: market.rules,
  marketParams: mapMarketParamsToType({
    feeRate: market.marketParamsFeerate,
    assertionLiveness: market.marketParamsAssertionliveness?.toString(),
    bondCurrency: market.marketParamsBondcurrency,
    bondAmount: market.marketParamsBondamount?.toString(),
    claimStatement: market.marketParamsClaimstatement,
    uniswapPositionManager: market.marketParamsUniswappositionmanager,
    uniswapSwapRouter: market.marketParamsUniswapswaprouter,
    uniswapQuoter: market.marketParamsUniswapquoter,
    optimisticOracleV3: market.marketParamsOptimisticoraclev3,
  }),
  currentPrice: null,
});

export const mapPositionToType = (position: any): PositionType => ({
  id: position.id,
  positionId: position.positionId,
  owner: position.owner?.toLowerCase() || '',
  isLP: position.isLP,
  baseToken: position.baseToken?.toString() || null,
  quoteToken: position.quoteToken?.toString() || null,
  collateral: position.collateral?.toString() || null,
  market: mapMarketToType(position.market),
  transactions: position.transaction?.map(mapTransactionToType) || [],
  borrowedBaseToken: position.borrowedBaseToken?.toString() || null,
  borrowedQuoteToken: position.borrowedQuoteToken?.toString() || null,
  lpBaseToken: position.lpBaseToken?.toString() || null,
  lpQuoteToken: position.lpQuoteToken?.toString() || null,
  isSettled: position.isSettled,
  lowPriceTick: position.lowPriceTick?.toString() || null,
  highPriceTick: position.highPriceTick?.toString() || null,
});

export const mapTransactionToType = (
  transaction: HydratedTransaction | any
): TransactionType => ({
  id: transaction.id,
  type: transaction.type,
  timestamp: transaction.event?.timestamp
    ? Number(BigInt(transaction.event.timestamp))
    : 0,
  transactionHash: transaction.event?.transactionHash || null,
  position: transaction.position && 'transaction' in transaction.position
    ? mapPositionToType(transaction.position)
    : null,
  baseToken: transaction.baseToken?.toString() || null,
  quoteToken: transaction.quoteToken?.toString() || null,
  collateral: transaction.collateral?.toString() || null,
  lpBaseDeltaToken: transaction.lpBaseDeltaToken?.toString() || null,
  lpQuoteDeltaToken: transaction.lpQuoteDeltaToken?.toString() || null,
  baseTokenDelta: (transaction as HydratedTransaction).baseTokenDelta || '0',
  quoteTokenDelta: (transaction as HydratedTransaction).quoteTokenDelta || '0',
  collateralDelta: (transaction as HydratedTransaction).collateralDelta || '0',
  tradeRatioD18: transaction.tradeRatioD18?.toString() || null,
});

export const mapResourcePriceToType = (
  price: any
): ResourcePriceType => ({
  id: price.id,
  timestamp: price.timestamp,
  value: price.value,
  resource: price.resource ? mapResourceToType(price.resource) : null,
  blockNumber: price.blockNumber,
});
