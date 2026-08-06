import { CUSTOM_CHAIN_ID_KEY, CUSTOM_RPC_URL_KEY } from '~/lib/sdk/constants';
import {
  GRAPHQL_ENDPOINT_KEY,
  LEGACY_GRAPHQL_ENDPOINT_KEY,
} from '~/lib/sdk/queries/client/graphqlClient';

/**
 * Canonical localStorage keys for user settings. The graphql endpoint and
 * custom-chain keys are owned by the SDK (which reads them directly); the rest
 * are app-only. Every reader/writer — SettingsContext, the Settings preset
 * buttons, and one-time migrations — must import from here so a key can never
 * drift between them.
 */
export const STORAGE_KEYS = {
  graphql: GRAPHQL_ENDPOINT_KEY,
  // Legacy key, read once for migration into `graphql` then removed on save.
  legacyGraphqlV2: LEGACY_GRAPHQL_ENDPOINT_KEY,
  api: 'sapience.settings.apiBaseUrl',
  chat: 'sapience.settings.chatBaseUrl',
  admin: 'sapience.settings.adminBaseUrl',
  etherealRpcURL: 'sapience.settings.etherealRpcURL',
  arbitrumRpcURL: 'sapience.settings.arbitrumRpcURL',
  // Custom-chain override keys are owned by the SDK (single source of truth)
  customChainId: CUSTOM_CHAIN_ID_KEY,
  customRpcURL: CUSTOM_RPC_URL_KEY,
  connectionDurationHours: 'sapience.settings.connectionDurationHours',
  signalEndpoint: 'sapience.settings.signalEndpoint',
  meshRateLimit: 'sapience.settings.meshRateLimit',
  meshMaxPeers: 'sapience.settings.meshMaxPeers',
  meshFanout: 'sapience.settings.meshFanout',
} as const;
