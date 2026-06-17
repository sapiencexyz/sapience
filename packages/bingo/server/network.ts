// The server serves BOTH networks from one deployment: every request picks
// staging (Ethereal testnet) or main (Ethereal mainnet) via a `network`
// query param, and signed session payloads carry their own chainId. Each
// network's deployment facts are hardcoded here — chain, relayer, receipt
// contract, log-scan floor; escrow/collateral come from
// @sapience/sdk/contracts keyed by chain id.

import type { Address, Chain } from 'viem';
import {
  etherealChain,
  etherealTestnetChain,
} from '@sapience/sdk/constants';

export type Network = 'staging' | 'main';

export const NETWORKS: readonly Network[] = ['staging', 'main'];

/** Parses an (optional) network name; empty/undefined = staging so requests
 *  from clients that predate the switch keep working. */
export function resolveNetwork(raw: string | undefined): Network {
  if (raw === undefined || raw === '' || raw === 'staging') return 'staging';
  if (raw === 'main') return 'main';
  throw new Error(`network must be 'staging' or 'main', got '${raw}'`);
}

export interface NetworkConfig {
  chain: Chain;
  relayerWsUrl: string;
  /** BingoCardReceipt — the network's submission record + payout rail. */
  receiptContract: Address;
  /** Lower bound for on-chain log scans = the receipt's deploy block. */
  logFromBlock: number;
  sponsorLogFromBlock: number;
  graphqlUrl: string;

}

const STAGING_LOG_FROM = 4828264;
const MAIN_LOG_FROM = 5041801;

export const NETWORK_CONFIG: Record<Network, NetworkConfig> = {
  staging: {
    chain: etherealTestnetChain,
    relayerWsUrl: 'wss://relayer.staging.sapience.xyz/auction',
    receiptContract: '0x67fB8B733Fe4E523d7d491785A86748a4ee9112c',
    logFromBlock: STAGING_LOG_FROM,
    sponsorLogFromBlock: STAGING_LOG_FROM,
    logFromBlock: 4828264,
    graphqlUrl: 'https://api.staging.sapience.xyz/graphql',

  },
  main: {
    chain: etherealChain,
    relayerWsUrl: 'wss://relayer.sapience.xyz/auction',
    receiptContract: '0xdb89F60983C7f943FD683Da0c3F6418d38e3732d',
    logFromBlock: MAIN_LOG_FROM,
    sponsorLogFromBlock: MAIN_LOG_FROM,
    logFromBlock: 5041801,
    graphqlUrl: 'https://api.sapience.xyz/graphql',

  },
};

/** The network a chain id belongs to, or null — used to route serialized
 *  sessions (which carry their chainId) to the right chain. */
export function networkForChainId(chainId: number): Network | null {
  for (const n of NETWORKS) {
    if (NETWORK_CONFIG[n].chain.id === chainId) return n;
  }
  return null;
}
