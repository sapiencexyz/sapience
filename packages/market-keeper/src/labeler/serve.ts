#!/usr/bin/env node
/// <reference types="node" />
/**
 * Start the endTime labeling UI server.
 *
 * Reads packages/market-keeper/src/labeler/data/corpus.json
 * Writes packages/market-keeper/src/labeler/data/labels.json
 *
 * Usage:
 *   pnpm --filter @sapience/market-keeper labeler:serve
 *   open http://localhost:5757
 *
 * Env:
 *   LABELER_PORT  default 5757
 *   LABELER_DATA  default ./src/labeler/data
 */

import 'dotenv/config';

import { start } from './server';

start();
