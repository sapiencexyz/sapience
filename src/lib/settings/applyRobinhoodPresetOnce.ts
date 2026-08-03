import {
  CHAIN_ID_ETHEREAL_TESTNET,
  CHAIN_ID_ROBINHOOD_TESTNET,
  ENV_DEFAULT_CHAIN_ID,
} from '~/lib/sdk/constants';

import {
  ROBINHOOD_MAINNET_SETTINGS,
  ROBINHOOD_TESTNET_SETTINGS,
  type EndpointPreset,
} from '~/lib/config/endpointPresets';
import { STORAGE_KEYS } from '~/lib/settings/storageKeys';

// One-time flag: once set, this never runs again, so any settings the user
// changes afterwards (including switching back to Ethereal) stick.
export const ROBINHOOD_DEFAULTS_MIGRATION_KEY =
  'sapience.settings.robinhoodDefaultsMigrated';

// Every key the Robinhood preset button writes (or removes). A session with
// none of these stored has nothing to migrate — the network defaults already
// serve the Robinhood endpoints — so the migration only sets the flag there,
// instead of pinning today's defaults as overrides that would shadow any
// future change to `getNetworkEndpointDefaults()`.
const PRESET_MANAGED_KEYS = [
  STORAGE_KEYS.customChainId,
  STORAGE_KEYS.customRpcURL,
  STORAGE_KEYS.graphql,
  STORAGE_KEYS.legacyGraphqlV2,
  STORAGE_KEYS.api,
  STORAGE_KEYS.signalEndpoint,
  STORAGE_KEYS.chat,
  STORAGE_KEYS.etherealRpcURL,
] as const;

/**
 * Pick the Robinhood preset for the build's default chain. Deliberately keyed
 * off `ENV_DEFAULT_CHAIN_ID`, never `DEFAULT_CHAIN_ID`: the latter reflects
 * the user's stored custom-chain override, so an Ethereal-era override would
 * select the wrong network's preset (e.g. the Testnet preset inside a
 * production build).
 */
export function pickRobinhoodPreset(envDefaultChainId: number): EndpointPreset {
  const isStagingBuild =
    envDefaultChainId === CHAIN_ID_ROBINHOOD_TESTNET ||
    envDefaultChainId === CHAIN_ID_ETHEREAL_TESTNET;
  return isStagingBuild
    ? ROBINHOOD_TESTNET_SETTINGS
    : ROBINHOOD_MAINNET_SETTINGS;
}

/**
 * One-time migration: on the first visit after this ships, sessions carrying
 * any endpoint/chain overrides (i.e. returning Ethereal-era users) get exactly
 * what the Robinhood preset button on the Settings page writes — the chain
 * override pair, the endpoint fields, blank signal/chat, and removal of the
 * legacy graphql key. The caller reloads afterwards, just like the button
 * does. Sessions with no stored overrides only get the flag: the network
 * defaults already serve the Robinhood endpoints, so writing them would just
 * pin today's URLs and force a pointless reload.
 *
 * The flag is written last: if storage fails mid-sequence the flag stays
 * unset, so the next visit retries the (idempotent) writes instead of
 * stranding a half-applied preset. The reload is gated on `applied`, which
 * requires the flag write itself to have succeeded, so there is no reload
 * loop either way.
 */
export function applyRobinhoodPresetOnce(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
): { applied: boolean } {
  try {
    if (storage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)) {
      return { applied: false };
    }

    const hasOverrides = PRESET_MANAGED_KEYS.some(
      (key) => storage.getItem(key) !== null
    );
    if (!hasOverrides) {
      storage.setItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY, '1');
      return { applied: false };
    }

    const preset = pickRobinhoodPreset(ENV_DEFAULT_CHAIN_ID);

    // Mirrors applyEndpointPreset on the Settings page, key for key.
    storage.setItem(STORAGE_KEYS.customChainId, String(preset.chainId));
    storage.setItem(STORAGE_KEYS.customRpcURL, preset.customRpcURL);
    storage.setItem(STORAGE_KEYS.graphql, preset.graphqlEndpoint);
    storage.removeItem(STORAGE_KEYS.legacyGraphqlV2); // legacy key
    storage.setItem(STORAGE_KEYS.api, preset.relayerEndpoint);
    // The mesh and chat are gone; clear any endpoints a pre-Robinhood session
    // still has stored for them.
    storage.removeItem(STORAGE_KEYS.signalEndpoint);
    storage.removeItem(STORAGE_KEYS.chat);
    storage.setItem(STORAGE_KEYS.etherealRpcURL, preset.customRpcURL);

    storage.setItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY, '1');

    return { applied: true };
  } catch {
    // Storage unavailable or failed mid-way: report not-applied so the caller
    // doesn't reload; without the flag, the next visit simply tries again.
    return { applied: false };
  }
}
