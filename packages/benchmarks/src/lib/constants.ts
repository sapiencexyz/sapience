import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  etherealChain,
  etherealTestnetChain,
} from '@sapience/sdk/constants';
import { predictionMarketEscrow, collateralToken } from '@sapience/sdk/contracts';
import type { Chain } from 'viem';

export type Environment = 'production' | 'staging';

export interface EnvConfig {
  label: string;
  chainId: number;
  chain: Chain;
  gqlUrl: string;
  relayerWsUrl: string;
  escrowAddress: string;
  collateralAddress: string;
  rpcUrl: string;
}

export const ENV_CONFIGS: Record<Environment, EnvConfig> = {
  production: {
    label: 'Production (Ethereal Mainnet)',
    chainId: CHAIN_ID_ETHEREAL,
    chain: etherealChain,
    gqlUrl: 'https://api.sapience.xyz/graphql',
    relayerWsUrl: 'wss://relayer.sapience.xyz/auction',
    escrowAddress: predictionMarketEscrow[CHAIN_ID_ETHEREAL].address,
    collateralAddress: collateralToken[CHAIN_ID_ETHEREAL].address,
    rpcUrl: etherealChain.rpcUrls.default.http[0],
  },
  staging: {
    label: 'Staging (Ethereal Testnet)',
    chainId: CHAIN_ID_ETHEREAL_TESTNET,
    chain: etherealTestnetChain,
    gqlUrl: 'https://api.staging.sapience.xyz/graphql',
    relayerWsUrl: 'wss://relayer.staging.sapience.xyz/auction',
    escrowAddress: predictionMarketEscrow[CHAIN_ID_ETHEREAL_TESTNET].address,
    collateralAddress: collateralToken[CHAIN_ID_ETHEREAL_TESTNET].address,
    rpcUrl: etherealTestnetChain.rpcUrls.default.http[0],
  },
};
