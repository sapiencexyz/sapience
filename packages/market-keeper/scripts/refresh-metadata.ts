#!/usr/bin/env node
/// <reference types="node" />
/**
 * Refresh metadata for every public + unsettled Sapience condition by
 * re-fetching its market from Polymarket Gamma. Catches slug renames and
 * other Polymarket-owned field drift that the generate cron can't see
 * once a market falls out of its 7-day "ending soonest" window.
 *
 * Usage:
 *   tsx scripts/refresh-metadata.ts
 *   tsx scripts/refresh-metadata.ts --dry-run
 */

import { main } from '../src/refresh-metadata/index.js';
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:refresh-metadata', 'START');
main().finally(() => logSeparator('market-keeper:refresh-metadata', 'END'));
