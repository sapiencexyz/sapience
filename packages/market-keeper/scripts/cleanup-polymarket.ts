#!/usr/bin/env node
/// <reference types="node" />

import 'dotenv/config';
import { main } from '../src/cleanup/index.js';
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:cleanup-polymarket', 'START');
main().finally(() => logSeparator('market-keeper:cleanup-polymarket', 'END'));
