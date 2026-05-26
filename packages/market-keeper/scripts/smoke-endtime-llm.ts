#!/usr/bin/env node
/// <reference types="node" />
/**
 * Deploy-gate smoke for the LLM endTime path.
 *
 * Usage:
 *   tsx scripts/smoke-endtime-llm.ts
 *
 * Env:
 *   OPENROUTER_API_KEY  (required) — real key, smoke fires one paid call
 *   LLM_ENDTIME_MODEL   (optional) — defaults to constants.ts default
 *
 * Exit codes:
 *   0  LLM endTime path alive end-to-end
 *   1  Sonar errored, returned UNKNOWN, or decideEndTime regressed
 */

import 'dotenv/config';
import { main } from '../src/smoke-endtime-llm/index.js';
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:smoke-endtime-llm', 'START');
main().finally(() =>
  logSeparator('market-keeper:smoke-endtime-llm', 'END')
);
