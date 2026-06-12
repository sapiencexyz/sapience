// staging/main network switch. NETWORK=main targets Ethereal mainnet
// (production); the default, staging, targets Ethereal testnet. Everything
// chain-shaped (chain object, relayer, log-scan floor) hangs off this one
// knob — contract addresses come from @sapience/sdk/contracts keyed by
// chain id, so they switch with it.

import type { Chain } from 'viem';
import {
  etherealChain,
  etherealTestnetChain,
} from '@sapience/sdk/constants';

export type Network = 'staging' | 'main';

export function resolveNetwork(raw: string | undefined): Network {
  if (raw === undefined || raw === '' || raw === 'staging') return 'staging';
  if (raw === 'main') return 'main';
  throw new Error(`NETWORK must be 'staging' or 'main', got '${raw}'`);
}

export interface NetworkConfig {
  chain: Chain;
  relayerWsUrl: string;
  /** Default lower bound for on-chain log scans (the network's
   *  BingoCardReceipt deploy block). undefined = no safe default;
   *  LOG_FROM_BLOCK becomes required at boot. */
  defaultLogFromBlock: number | undefined;
}

export const NETWORK_CONFIG: Record<Network, NetworkConfig> = {
  staging: {
    chain: etherealTestnetChain,
    relayerWsUrl: 'wss://relayer.staging.sapience.xyz/auction',
    defaultLogFromBlock: 4828264,
  },
  main: {
    chain: etherealChain,
    relayerWsUrl: 'wss://relayer.sapience.xyz/auction',
    defaultLogFromBlock: 5041801,
  },
};
