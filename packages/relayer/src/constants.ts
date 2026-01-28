// PredictionMarket deployed addresses
import { predictionMarket, predictionMarketEscrow } from '@sapience/sdk';
import { CHAIN_ID_ARBITRUM, CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

// Legacy V1 PredictionMarket (Arbitrum)
export const PREDICTION_MARKET_ADDRESS_ARB1 = predictionMarket[CHAIN_ID_ARBITRUM]
  ?.address as `0x${string}`;
export const PREDICTION_MARKET_CHAIN_ID_ARB1 = CHAIN_ID_ARBITRUM;

// V2 PredictionMarketEscrow addresses
export const V2_PREDICTION_MARKET_ESCROW_ETHEREAL = predictionMarketEscrow[CHAIN_ID_ETHEREAL]
  ?.address as `0x${string}` | undefined;
export const V2_CHAIN_ID_ETHEREAL = CHAIN_ID_ETHEREAL;

// Get V2 contract address by chainId
export function getV2ContractAddress(chainId: number): `0x${string}` | undefined {
  return predictionMarketEscrow[chainId]?.address as `0x${string}` | undefined;
}

