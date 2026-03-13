#!/usr/bin/env node
/// <reference types="node" />
/**
 * Relist past-endDate Polymarket markets that are still actively traded
 *
 * Fetches markets with past end dates from Polymarket, creates new conditions
 * on Sapience with endTime = now + 7 days, and extends endTime for already-listed
 * unsettled conditions.
 *
 * Usage:
 *   tsx scripts/relist.ts
 *   tsx scripts/relist.ts --dry-run
 */

import { main } from '../src/relist/index.js';
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:relist', 'START');
main().finally(() => logSeparator('market-keeper:relist', 'END'));
