import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  CHAIN_ID_ROBINHOOD_TESTNET,
  CHAIN_ID_ROBINHOOD_MAINNET,
} from '@sapience/sdk/constants';

// Endpoint presets applied via the buttons next to the Settings heading. Each
// preset switches the chain and populates every endpoint field for a known
// environment. The Robinhood/Meridian presets leave the signal and chat
// endpoints blank, which disables the mesh and chat bubble; the Ethereal
// (Sapience) presets keep them pointed at the matching Sapience backend.
// The Ethereal presets double as the known-values list for the one-time
// migration that moves returning Ethereal sessions onto the Robinhood
// defaults (see lib/settings/migrateEtherealDefaults).
export type EndpointPreset = {
  // Display label shown on the preset button.
  label: string;
  // Static chain ID for the preset. Used as the fallback when the RPC can't be
  // reached at apply time, so the preset still switches chains and populates the
  // settings fields instead of erroring out.
  chainId: number;
  customRpcURL: string;
  graphqlEndpoint: string;
  relayerEndpoint: string;
  // Blank disables the mesh; blank chat hides the chat bubble.
  signalEndpoint: string;
  chatBaseUrl: string;
};

export const ETHEREAL_MAINNET_SETTINGS: EndpointPreset = {
  label: 'Ethereal Mainnet',
  chainId: CHAIN_ID_ETHEREAL,
  customRpcURL: 'https://rpc.ethereal.trade',
  graphqlEndpoint: 'https://api.sapience.xyz/v2/graphql',
  relayerEndpoint: 'https://relayer.sapience.xyz/auction',
  signalEndpoint: 'https://relayer.sapience.xyz/signal',
  chatBaseUrl: 'https://api.sapience.xyz/chat',
} as const;

export const ROBINHOOD_MAINNET_SETTINGS: EndpointPreset = {
  label: 'Robinhood Mainnet',
  chainId: CHAIN_ID_ROBINHOOD_MAINNET,
  customRpcURL: 'https://rpc.mainnet.chain.robinhood.com',
  graphqlEndpoint: 'https://api.predict.meridian.xyz/graphql',
  relayerEndpoint: 'https://relayer.predict.meridian.xyz/auction',
  signalEndpoint: '',
  chatBaseUrl: '',
} as const;

export const ETHEREAL_TESTNET_SETTINGS: EndpointPreset = {
  label: 'Ethereal Testnet',
  chainId: CHAIN_ID_ETHEREAL_TESTNET,
  customRpcURL: 'https://rpc.etherealtest.net',
  graphqlEndpoint: 'https://api.staging.sapience.xyz/v2/graphql',
  relayerEndpoint: 'https://relayer.staging.sapience.xyz/auction',
  signalEndpoint: 'https://relayer.staging.sapience.xyz/signal',
  chatBaseUrl: 'https://api.staging.sapience.xyz/chat',
} as const;

export const ROBINHOOD_TESTNET_SETTINGS: EndpointPreset = {
  label: 'Robinhood Testnet',
  chainId: CHAIN_ID_ROBINHOOD_TESTNET,
  customRpcURL: 'https://rpc.testnet.chain.robinhood.com',
  graphqlEndpoint: 'https://api.predict.meridiantest.net/graphql',
  relayerEndpoint: 'https://relayer.predict.meridiantest.net/auction',
  signalEndpoint: '',
  chatBaseUrl: '',
} as const;

// Order shown next to the Settings heading. Robinhood is the default
// environment, so its presets lead; Ethereal follows.
export const ENDPOINT_PRESETS: EndpointPreset[] = [
  ROBINHOOD_MAINNET_SETTINGS,
  ETHEREAL_MAINNET_SETTINGS,
  ROBINHOOD_TESTNET_SETTINGS,
  ETHEREAL_TESTNET_SETTINGS,
];
