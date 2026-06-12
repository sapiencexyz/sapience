import {
  etherealChain,
  etherealTestnetChain,
} from '@sapience/sdk/constants';

// staging/main network switch. VITE_NETWORK sets the build's default
// ('main' = Ethereal mainnet, anything else = Ethereal testnet); the
// Settings dialog can override it per browser via localStorage. The choice
// is resolved ONCE per page load — switching networks reloads the app, the
// same contract the backend-URL override uses. Contract addresses come
// from @sapience/sdk/contracts keyed by chain id, so they switch with it.
export type Network = 'staging' | 'main';

const NETWORK_STORAGE_KEY = 'bingo-network';

export const DEFAULT_NETWORK: Network =
  import.meta.env.VITE_NETWORK === 'main' ? 'main' : 'staging';

export function loadNetwork(): Network {
  if (typeof window !== 'undefined') {
    const v = window.localStorage.getItem(NETWORK_STORAGE_KEY);
    if (v === 'main' || v === 'staging') return v;
  }
  return DEFAULT_NETWORK;
}

/** Persist the override; picking the build default clears it instead, so a
 *  later change to the deployment's default isn't shadowed. Callers reload
 *  so every module re-reads the constants below. */
export function saveNetwork(network: Network): void {
  if (typeof window === 'undefined') return;
  if (network === DEFAULT_NETWORK) {
    window.localStorage.removeItem(NETWORK_STORAGE_KEY);
  } else {
    window.localStorage.setItem(NETWORK_STORAGE_KEY, network);
  }
}

export const NETWORK: Network = loadNetwork();
export const CHAIN = NETWORK === 'main' ? etherealChain : etherealTestnetChain;
export const CHAIN_ID: number = CHAIN.id;
export const DECIMALS = 18;
