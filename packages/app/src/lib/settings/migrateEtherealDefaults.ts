import {
  CUSTOM_CHAIN_ID_KEY,
  CUSTOM_RPC_URL_KEY,
} from '@sapience/sdk/constants';

import {
  ETHEREAL_MAINNET_SETTINGS,
  ETHEREAL_TESTNET_SETTINGS,
} from '~/lib/config/endpointPresets';

// One-time flag: once set, the migration never runs again, so a user who
// re-applies an Ethereal preset afterwards keeps it.
export const ROBINHOOD_DEFAULTS_MIGRATION_KEY =
  'sapience.settings.robinhoodDefaultsMigrated';

export type MigrationResult = {
  // Whether any stored value was cleared.
  changed: boolean;
  // Whether the custom-chain key pair was cleared. Those keys are read at
  // module-eval time (DEFAULT_CHAIN_ID, wagmi config), so clearing them only
  // takes effect after a reload.
  chainCleared: boolean;
};

const ETHEREAL_PRESETS = [ETHEREAL_MAINNET_SETTINGS, ETHEREAL_TESTNET_SETTINGS];

// The Ethereal-era SettingsContext auto-persisted an admin base derived from
// the env origin; these are the values it could have written.
const KNOWN_ADMIN_BASES = [
  'https://api.sapience.xyz/admin',
  'https://api.staging.sapience.xyz/admin',
];

const normalize = (value: string) => value.trim().replace(/\/+$/, '');

const matchesAny = (value: string | null, known: string[]) =>
  value != null && known.some((k) => normalize(value) === normalize(k));

// Endpoint keys cleared independently when they hold a known Ethereal value.
const ENDPOINT_KEY_KNOWN_VALUES: Array<[key: string, known: string[]]> = [
  [
    'sapience.settings.graphqlEndpoint',
    ETHEREAL_PRESETS.map((p) => p.graphqlEndpoint),
  ],
  [
    'sapience.settings.graphqlEndpointV2',
    ETHEREAL_PRESETS.map((p) => p.graphqlEndpoint),
  ],
  [
    'sapience.settings.apiBaseUrl',
    ETHEREAL_PRESETS.map((p) => p.relayerEndpoint),
  ],
  [
    'sapience.settings.signalEndpoint',
    ETHEREAL_PRESETS.map((p) => p.signalEndpoint),
  ],
  ['sapience.settings.chatBaseUrl', ETHEREAL_PRESETS.map((p) => p.chatBaseUrl)],
  ['sapience.settings.adminBaseUrl', KNOWN_ADMIN_BASES],
  [
    'sapience.settings.etherealRpcURL',
    ETHEREAL_PRESETS.map((p) => p.customRpcURL),
  ],
];

/**
 * One-time migration: clears Ethereal-era localStorage overrides so returning
 * visitors land on the Robinhood defaults, exactly once. Only values matching
 * the known Ethereal/Sapience endpoints are cleared — genuinely custom
 * endpoints survive, and the chain override is only cleared when both the
 * chain id AND the RPC URL match an Ethereal preset (a known Ethereal chain id
 * pointed at a custom node is a deliberate setup and is kept).
 *
 * The flag is written before anything is cleared; if the write throws
 * (storage disabled/full), nothing is touched so a caller acting on
 * `chainCleared` can never reload-loop.
 */
export function migrateEtherealDefaultsToRobinhood(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
): MigrationResult {
  const result: MigrationResult = { changed: false, chainCleared: false };
  try {
    if (storage.getItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY)) return result;
    storage.setItem(ROBINHOOD_DEFAULTS_MIGRATION_KEY, '1');

    for (const [key, known] of ENDPOINT_KEY_KNOWN_VALUES) {
      if (matchesAny(storage.getItem(key), known)) {
        storage.removeItem(key);
        result.changed = true;
      }
    }

    const chainId = storage.getItem(CUSTOM_CHAIN_ID_KEY);
    const rpcUrl = storage.getItem(CUSTOM_RPC_URL_KEY);
    const pairMatchesEthereal = ETHEREAL_PRESETS.some(
      (preset) =>
        chainId != null &&
        rpcUrl != null &&
        chainId.trim() === String(preset.chainId) &&
        normalize(rpcUrl) === normalize(preset.customRpcURL)
    );
    if (pairMatchesEthereal) {
      storage.removeItem(CUSTOM_CHAIN_ID_KEY);
      storage.removeItem(CUSTOM_RPC_URL_KEY);
      result.changed = true;
      result.chainCleared = true;
    }
  } catch {
    // Storage unavailable or failed mid-way: report no chain change so the
    // caller never reloads without the flag having been persisted.
    return { changed: false, chainCleared: false };
  }
  return result;
}
