#!/usr/bin/env node
/// <reference types="node" />
/**
 * One-shot backfill of Condition.endTime for active Polymarket-sourced
 * markets. Re-runs the LLM-primary pipeline (Sonar + decideEndTime) and
 * writes back any value that differs by more than the threshold.
 *
 * Usage:
 *   tsx scripts/backfill-endtimes.ts                    # dry-run, default
 *   tsx scripts/backfill-endtimes.ts --execute          # actually submit
 *   tsx scripts/backfill-endtimes.ts --limit 50         # first 50 only
 *   tsx scripts/backfill-endtimes.ts --threshold-seconds 300
 */

import { main } from '../src/backfill-endtimes/index.js';
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:backfill-endtimes', 'START');
main().finally(() =>
  logSeparator('market-keeper:backfill-endtimes', 'END')
);
