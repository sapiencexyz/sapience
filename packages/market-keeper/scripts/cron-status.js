#!/usr/bin/env node
/**
 * Status cron: balance heartbeat (OpenRouter credits + admin POL) to Discord.
 * Standalone — reads only, writes nothing, so it can run on its own cadence
 * (e.g. hourly) independent of the data/settlement crons.
 */
const { execSync } = require('child_process');

execSync('node dist/scripts/keeper-status.js', { stdio: 'inherit' });
