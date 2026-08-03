import {
  CHAIN_ID_ROBINHOOD_TESTNET,
  CHAIN_ID_ROBINHOOD_MAINNET,
} from '~/lib/sdk/constants';

// Endpoint presets for the Robinhood/Meridian deployment. Each preset pins the
// chain and every endpoint field for one environment, and is applied by the
// one-time migration that moves returning sessions onto the Robinhood defaults
// (see lib/settings/applyRobinhoodPresetOnce).
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

export const ROBINHOOD_MAINNET_SETTINGS: EndpointPreset = {
  label: 'Robinhood Mainnet',
  chainId: CHAIN_ID_ROBINHOOD_MAINNET,
  customRpcURL: 'https://rpc.mainnet.chain.robinhood.com',
  graphqlEndpoint: 'https://api.predict.meridian.xyz/graphql',
  relayerEndpoint: 'https://relayer.predict.meridian.xyz/auction',
  signalEndpoint: '',
  chatBaseUrl: '',
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
