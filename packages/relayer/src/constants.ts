// PredictionMarket deployed addresses
import { predictionMarket } from '@sapience/sdk';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

export const PREDICTION_MARKET_ADDRESS = predictionMarket[CHAIN_ID_ETHEREAL]
  ?.address as `0x${string}`;
export const PREDICTION_MARKET_CHAIN_ID = CHAIN_ID_ETHEREAL;

