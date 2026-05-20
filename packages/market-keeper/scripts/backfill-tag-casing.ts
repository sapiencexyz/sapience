#!/usr/bin/env node
/// <reference types="node" />
/**
 * One-shot backfill: renormalize tags on every public condition to
 * per-word Title Case with acronym guard.
 *
 * Usage:
 *   tsx scripts/backfill-tag-casing.ts --dry-run
 *   tsx scripts/backfill-tag-casing.ts
 */

import { main } from '../src/backfill-tag-casing/index.js';
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:backfill-tag-casing', 'START');
main().finally(() =>
  logSeparator('market-keeper:backfill-tag-casing', 'END')
);
