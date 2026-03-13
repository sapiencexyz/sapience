#!/usr/bin/env node
/// <reference types="node" />
/**
 * Generate Sapience condition groups and conditions from Polymarket markets
 *
 * This script fetches Polymarket markets ending within 7 days and formats them
 * for the Sapience database:
 * - Uses Polymarket's conditionId as the Sapience conditionHash
 * - Groups related markets into ConditionGroups by event
 * - Transforms match questions ("X vs Y") to clear "X beats Y?" format
 * - Optionally submits to Sapience API if SAPIENCE_API_URL and ADMIN_PRIVATE_KEY are set
 *
 * Usage:
 *   tsx scripts/generate.ts
 *   tsx scripts/generate.ts --dry-run
 *
 * Options:
 *   --dry-run  Show what would be submitted without actually submitting
 *   --help     Show this help message
 */

import { main } from '../src/generate/index.js';
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:generate', 'START');
main().finally(() => logSeparator('market-keeper:generate', 'END'));
