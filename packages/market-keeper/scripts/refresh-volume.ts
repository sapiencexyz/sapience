#!/usr/bin/env node
/// <reference types="node" />
/**
 * Refresh time-bucketed volume for active Polymarket conditions in Sapience
 *
 * Fetches individual trades from the Polymarket Data API, aggregates volume
 * per condition across time windows (1h, 4h, 24h, 7d), and submits updates.
 * Also computes filtered volume excluding trades priced outside [0.01, 0.99].
 *
 * Usage:
 *   tsx scripts/refresh-volume.ts
 *   tsx scripts/refresh-volume.ts --dry-run
 */

import { main } from '../src/refresh-volume/index.js';
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:refresh-volume', 'START');
main().finally(() => logSeparator('market-keeper:refresh-volume', 'END'));
