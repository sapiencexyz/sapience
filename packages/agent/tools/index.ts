import {
  getMarket,
  listMarkets,
  getPositions,
  getResource,
  listResources,
  getEpochs,
  getTransactions,
  getMarketCandles,
  getResourceCandles,
  getResourceTrailingAverageCandles,
  getIndexCandles
} from './graphql';

import {
  getMarketInfo,
  getEpochInfo,
  getLatestEpochInfo,
  getTokenOwner,
  getTokenByIndex,
  getReferencePrice
} from './readFoilContracts';

import {
  quoteCreateTraderPosition,
  createTraderPosition,
  quoteModifyTraderPosition,
  modifyTraderPosition,
  quoteLiquidityPosition,
  createLiquidityPosition,
  quoteModifyLiquidityPosition,
  modifyLiquidityPosition,
  settlePosition
} from './writeFoilContracts';

export const graphql = {
  getMarket,
  listMarkets,
  getPositions,
  getResource,
  listResources,
  getEpochs,
  getTransactions,
  getMarketCandles,
  getResourceCandles,
  getResourceTrailingAverageCandles,
  getIndexCandles
};

export const readFoilContracts = {
  getMarketInfo,
  getEpochInfo,
  getLatestEpochInfo,
  getTokenOwner,
  getTokenByIndex,
  getReferencePrice
};

export const writeFoilContracts = {
  quoteCreateTraderPosition,
  createTraderPosition,
  quoteModifyTraderPosition,
  modifyTraderPosition,
  quoteLiquidityPosition,
  createLiquidityPosition,
  quoteModifyLiquidityPosition,
  modifyLiquidityPosition,
  settlePosition
};