import {
  DEFAULT_CHAIN_ID,
  CHAIN_ID_ETHEREAL_TESTNET,
  CHAIN_ID_ROBINHOOD_TESTNET,
} from '@sapience/sdk/constants';

/**
 * Default offchain endpoints for the app's active network.
 *
 * These defaults are derived from the build's default chain (`DEFAULT_CHAIN_ID`),
 * NOT from any `NEXT_PUBLIC_FOIL_*` env var. The app defaults to Robinhood
 * Mainnet; a "staging" build (one whose default chain is a testnet) defaults to
 * Robinhood Testnet. Both ship with the mesh signal and chat disabled (blank).
 *
 * Keeping this off the env vars means a fresh (incognito) session always lands
 * on the Robinhood values that match the network the app is built for, instead
 * of inheriting a Sapience/Ethereal endpoint from a stray `.env` entry.
 *
 * Ethereal/Sapience endpoints remain reachable — the user opts in via the
 * network preset buttons on the Settings page, which persist localStorage
 * overrides that take precedence over these defaults everywhere.
 */
export type NetworkEndpointDefaults = {
  /** Origin of the public API (REST + GraphQL host). */
  apiOrigin: string;
  graphqlEndpoint: string;
  relayerBase: string;
  adminBase: string;
  signalEndpoint: string;
  chatBase: string;
};

export const ROBINHOOD_MAINNET_DEFAULTS: NetworkEndpointDefaults = {
  apiOrigin: 'https://api.predict.meridian.xyz',
  graphqlEndpoint: 'https://api.predict.meridian.xyz/graphql',
  relayerBase: 'https://relayer.predict.meridian.xyz/auction',
  adminBase: 'https://api.predict.meridian.xyz/admin',
  signalEndpoint: '',
  chatBase: '',
};

export const ROBINHOOD_TESTNET_DEFAULTS: NetworkEndpointDefaults = {
  apiOrigin: 'https://api.predict.meridiantest.net',
  graphqlEndpoint: 'https://api.predict.meridiantest.net/graphql',
  relayerBase: 'https://relayer.predict.meridiantest.net/auction',
  adminBase: 'https://api.predict.meridiantest.net/admin',
  signalEndpoint: '',
  chatBase: '',
};

/**
 * "Staging" == a testnet default chain. Staging deployments set
 * `NEXT_PUBLIC_DEFAULT_CHAIN_ID` to a testnet id, so `DEFAULT_CHAIN_ID` is the
 * single source of truth for which network's defaults to serve.
 */
export function isStagingNetwork(): boolean {
  return (
    DEFAULT_CHAIN_ID === CHAIN_ID_ROBINHOOD_TESTNET ||
    DEFAULT_CHAIN_ID === CHAIN_ID_ETHEREAL_TESTNET
  );
}

/** Default offchain endpoints for the app's active network. */
export function getNetworkEndpointDefaults(): NetworkEndpointDefaults {
  return isStagingNetwork()
    ? ROBINHOOD_TESTNET_DEFAULTS
    : ROBINHOOD_MAINNET_DEFAULTS;
}
