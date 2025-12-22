export const NUMERIC_PRECISION = 78;
export const TOKEN_PRECISION = 18;
export const DECIMAL_SCALE = 15;

export const FEE = 0.0001;

export const ONE_MINUTE_MS = 60 * 1000;
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export const WSTETH_ADDRESS_MAINNET =
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0';
export const WSTETH_ADDRESS_SEPOLIA =
  '0xb82381a3fbd3fafa77b3a7be693342618240067b';

// PredictionMarket deployed addresses
import { predictionMarket } from '@sapience/sdk';
import { CHAIN_ID_ARBITRUM } from '@sapience/sdk/constants';
export const PREDICTION_MARKET_ADDRESS_ARB1 = predictionMarket[
  CHAIN_ID_ARBITRUM
]?.address as `0x${string}`;
export const PREDICTION_MARKET_CHAIN_ID_ARB1 = CHAIN_ID_ARBITRUM;
