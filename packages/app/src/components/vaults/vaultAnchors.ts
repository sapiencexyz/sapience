import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  predictionMarketVault,
  predictionMarketVaultStrategyB,
} from '@sapience/sdk/contracts';

// Per-vault "start of visible history" for the Vault PnL chart. A vault may
// have had TVL (and near-zero PnL accrual) for some time before the team
// considers it meaningfully "live"; clamping the chart to an explicit anchor
// date hides that pre-activity tail so the %/APY read off the real curve.
// Requested by fifa for the Core Vault (Discord, 2026-04-24).
const CORE_VAULT_ADDRESS = predictionMarketVault[DEFAULT_CHAIN_ID]?.address;
const EDGE_VAULT_ADDRESS =
  predictionMarketVaultStrategyB[DEFAULT_CHAIN_ID]?.address;

export const VAULT_PNL_ANCHORS_SEC: Record<string, number> = {
  ...(CORE_VAULT_ADDRESS && {
    [CORE_VAULT_ADDRESS.toLowerCase()]: Math.floor(
      Date.UTC(2026, 3, 17) / 1000
    ),
  }),
  ...(EDGE_VAULT_ADDRESS && {
    [EDGE_VAULT_ADDRESS.toLowerCase()]: Math.floor(
      Date.UTC(2026, 4, 14) / 1000
    ),
  }),
};

export function getVaultPnlAnchorSec(address?: string): number | undefined {
  if (!address) return undefined;
  return VAULT_PNL_ANCHORS_SEC[address.toLowerCase()];
}
