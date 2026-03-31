import { CHAIN_ID_ETHEREAL, CHAIN_ID_ETHEREAL_TESTNET } from '@sapience/sdk/constants';

/** Auction round interval in seconds — controls price polling and bid expiration */
export const ROUND_SECONDS = 10;

export type EnvMode = 'main' | 'staging';

interface EnvConfig {
  chainId: number;
  relayerWsUrl: string;
}

const ENV_CONFIGS: Record<EnvMode, EnvConfig> = {
  main: {
    chainId: CHAIN_ID_ETHEREAL,
    relayerWsUrl: 'wss://relayer.sapience.xyz/auction',
  },
  staging: {
    chainId: CHAIN_ID_ETHEREAL_TESTNET,
    relayerWsUrl: 'wss://relayer.staging.sapience.xyz/auction',
  },
};

export function getEnvConfig(mode: EnvMode): EnvConfig {
  return ENV_CONFIGS[mode];
}
