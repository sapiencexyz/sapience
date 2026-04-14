#!/usr/bin/env node
/// <reference types="node" />
/**
 * Refresh prices and 24h/7d volume for ALL active Polymarket conditions in Sapience
 *
 * Fetches condition IDs from Sapience API, looks up current prices and
 * volume24hr/volume1wk on Polymarket's Gamma API, and submits batch updates.
 *
 * Usage:
 *   tsx scripts/prices-and-1d-7d-volume.ts
 *   tsx scripts/prices-and-1d-7d-volume.ts --dry-run
 */

import { main } from '../src/prices-and-1d-7d-volume/index.js';
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:prices-and-1d-7d-volume', 'START');
main().finally(() => logSeparator('market-keeper:prices-and-1d-7d-volume', 'END'));
