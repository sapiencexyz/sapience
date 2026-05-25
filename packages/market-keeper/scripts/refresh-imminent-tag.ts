#!/usr/bin/env node
/// <reference types="node" />
/**
 * Daily refresh of the "today" tag on conditions whose question text
 * mentions today's or tomorrow's UTC date.
 *
 * Usage:
 *   tsx scripts/refresh-imminent-tag.ts
 *   tsx scripts/refresh-imminent-tag.ts --dry-run
 */

import { main } from '../src/refresh-imminent-tag/index.js';
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:refresh-imminent-tag', 'START');
main().finally(() =>
  logSeparator('market-keeper:refresh-imminent-tag', 'END')
);
