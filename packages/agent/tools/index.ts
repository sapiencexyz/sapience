import {
  getMarketGroup,
  listMarketGroups,
  getPositions,
  getResource,
  listResources,
  getTransactions,
  getMarketCandles,
  getResourceCandles,
  getResourceTrailingAverageCandles,
  getIndexCandles
} from './graphql';

import {
  getMarketInfo,
  getMarketPeriodInfo,
  getLatestMarketPeriodInfo,
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

import {
  approveToken,
  balanceOfToken,
  getSizeForCreateTraderPosition,
} from './misc';

export const graphql = {
  get_sapience_market_group: getMarketGroup,
  list_sapience_market_groups: listMarketGroups,
  get_sapience_positions: getPositions,
  get_sapience_resource: getResource,
  list_sapience_resources: listResources,
  get_sapience_transactions: getTransactions,
  get_sapience_market_candles: getMarketCandles,
  get_sapience_resource_candles: getResourceCandles,
  get_sapience_resource_trailing_average_candles: getResourceTrailingAverageCandles,
  get_sapience_index_candles: getIndexCandles
};

export const readFoilContracts = {
  get_sapience_market_info: getMarketInfo,
  get_sapience_market_period_info: getMarketPeriodInfo,
  get_sapience_latest_market_period_info: getLatestMarketPeriodInfo,
  get_sapience_token_owner: getTokenOwner,
  get_sapience_token_by_index: getTokenByIndex,
  get_sapience_reference_price: getReferencePrice
};

export const writeFoilContracts = {
  quote_create_sapience_trader_position: quoteCreateTraderPosition,
  create_sapience_trader_position: createTraderPosition,
  quote_modify_sapience_trader_position: quoteModifyTraderPosition,
  modify_sapience_trader_position: modifyTraderPosition,
  quote_create_sapience_liquidity_position: quoteLiquidityPosition,
  create_sapience_liquidity_position: createLiquidityPosition,
  quote_modify_sapience_liquidity_position: quoteModifyLiquidityPosition,
  modify_sapience_liquidity_position: modifyLiquidityPosition,
  settle_sapience_position: settlePosition
};

export const misc = {
  approve_token: approveToken,
  balance_of_token: balanceOfToken,
  get_size_for_create_trader_position: getSizeForCreateTraderPosition
};