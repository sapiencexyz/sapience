// PredictionMarket deployed addresses
import { predictionMarket } from '@sapience/sdk';
import { CHAIN_ID_ARBITRUM } from '@sapience/sdk/constants';

export const PREDICTION_MARKET_ADDRESS_ARB1 = predictionMarket[CHAIN_ID_ARBITRUM]
  ?.address as `0x${string}`;
export const PREDICTION_MARKET_CHAIN_ID_ARB1 = CHAIN_ID_ARBITRUM;

