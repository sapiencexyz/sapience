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
  getReferencePrice,
  getERC20BalanceOf
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
  stageTransaction,
  executeTransaction,
  approveToken,
  tweet,
  balanceOfToken
} from './misc';

export const graphql = {
  get_foil_market: getMarket,
  list_foil_markets: listMarkets,
  get_foil_positions: getPositions,
  get_foil_resource: getResource,
  list_foil_resources: listResources,
  get_foil_periods: getEpochs,
  get_foil_transactions: getTransactions,
  get_foil_market_candles: getMarketCandles,
  get_foil_resource_candles: getResourceCandles,
  get_foil_resource_trailing_average_candles: getResourceTrailingAverageCandles,
  get_foil_index_candles: getIndexCandles
};

export const readFoilContracts = {
  get_foil_market_info: getMarketInfo,
  get_foil_epoch_info: getEpochInfo,
  get_foil_latest_epoch_info: getLatestEpochInfo,
  get_foil_token_owner: getTokenOwner,
  get_foil_token_by_index: getTokenByIndex,
  get_foil_reference_price: getReferencePrice,
  get_erc20_balance_of: getERC20BalanceOf,
};

export const writeFoilContracts = {
  quote_create_foil_trader_position: quoteCreateTraderPosition,
  create_foil_trader_position: createTraderPosition,
  quote_modify_foil_trader_position: quoteModifyTraderPosition,
  modify_foil_trader_position: modifyTraderPosition,
  quote_create_foil_liquidity_position: quoteLiquidityPosition,
  create_foil_liquidity_position: createLiquidityPosition,
  quote_modify_foil_liquidity_position: quoteModifyLiquidityPosition,
  modify_foil_liquidity_position: modifyLiquidityPosition,
  settle_foil_position: settlePosition
};

export const transactions = {
  stage_transaction: stageTransaction,
  execute_transaction: executeTransaction,
  approve_token: approveToken,
  tweet: tweet,
  balance_of_token: balanceOfToken
};