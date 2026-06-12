import {
  etherealChain,
  etherealTestnetChain,
} from '@sapience/sdk/constants';

// staging/main network switch. Build with VITE_NETWORK=main for production
// (Ethereal mainnet); the default, staging, targets Ethereal testnet. Must
// match the server's NETWORK — the server rejects sessions for the wrong
// chain. Contract addresses come from @sapience/sdk/contracts keyed by
// chain id, so they switch with it.
export const NETWORK: 'staging' | 'main' =
  import.meta.env.VITE_NETWORK === 'main' ? 'main' : 'staging';
export const CHAIN = NETWORK === 'main' ? etherealChain : etherealTestnetChain;
export const CHAIN_ID: number = CHAIN.id;
export const DECIMALS = 18;
