#!/usr/bin/env node
/// <reference types="node" />
/**
 * Refresh prices for ALL active Polymarket conditions in Sapience
 *
 * Fetches condition IDs from Sapience API, looks up current prices on Polymarket,
 * and submits batch updates. Covers markets outside generate/relist windows.
 *
 * Usage:
 *   tsx scripts/refresh-prices.ts
 *   tsx scripts/refresh-prices.ts --dry-run
 */

import { main } from '../src/refresh-prices/index.js';
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:refresh-prices', 'START');
main().finally(() => logSeparator('market-keeper:refresh-prices', 'END'));
