import {
  CUSTOM_CHAIN_ID_KEY,
  CUSTOM_RPC_URL_KEY,
} from '@sapience/sdk/constants';

import {
  ROBINHOOD_MAINNET_SETTINGS,
  ROBINHOOD_TESTNET_SETTINGS,
  type EndpointPreset,
} from '~/lib/config/endpointPresets';
import { isStagingNetwork } from '~/lib/config/networkDefaults';

// One-time flag: once set, this never runs again, so any settings the user
// changes afterwards (including switching back to Ethereal) stick.
export const ROBINHOOD_DEFAULTS_MIGRATION_KEY =
  'sapience.settings.robinhoodDefaultsMigrated';

/**
 * One-time migration: on the first visit after this ships, persist exactly
 * what the Robinhood preset button on the Settings page writes — the chain
 * override pair (using the preset's static chain id, the same fallback the
 * button uses when the RPC is unreachable), the endpoint fields, blank
 * signal/chat, and removal of the legacy graphql key. The caller reloads
 * afterwards, just like the button does. Staging builds (testnet default
 * chain) apply the Robinhood Testnet preset instead, matching the button a
 * staging user would press.
 *
 * The flag is written before anything else; if the write throws (storage
 * disabled/full), nothing is touched and `applied` is false, so the caller
 * can never reload-loop.
 */
export function applyRobinhoodPresetOnce(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
): { applied: boolean } {
  try {
    if (storage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)) {
      return { applied: false };
    }
    storage.setItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY, '1');

    const preset: EndpointPreset = isStagingNetwork()
      ? ROBINHOOD_TESTNET_SETTINGS
      : ROBINHOOD_MAINNET_SETTINGS;

    // Mirrors applyEndpointPreset on the Settings page, key for key.
    storage.setItem(CUSTOM_CHAIN_ID_KEY, String(preset.chainId));
    storage.setItem(CUSTOM_RPC_URL_KEY, preset.customRpcURL);
    storage.setItem(
      'sapience.settings.graphqlEndpoint',
      preset.graphqlEndpoint
    );
    storage.removeItem('sapience.settings.graphqlEndpointV2'); // legacy key
    storage.setItem('sapience.settings.apiBaseUrl', preset.relayerEndpoint);
    // Blank disables the mesh / hides the chat bubble, same as the preset.
    storage.setItem('sapience.settings.signalEndpoint', preset.signalEndpoint);
    storage.setItem('sapience.settings.chatBaseUrl', preset.chatBaseUrl);
    storage.setItem('sapience.settings.etherealRpcURL', preset.customRpcURL);

    return { applied: true };
  } catch {
    // Storage unavailable or failed mid-way: report not-applied so the
    // caller never reloads without the flag having been persisted.
    return { applied: false };
  }
}
