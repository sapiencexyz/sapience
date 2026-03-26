#!/usr/bin/env node
const { execSync } = require('child_process');

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('node dist/scripts/generate.js');
run('node dist/scripts/relist.js');
run('node dist/scripts/refresh-prices.js');
run('node dist/scripts/cleanup-polymarket.js --execute');

if (process.env.DEFAULT_CHAIN_ID !== '5064014') {
  // Staging/testnet: manual resolver
  run('node dist/scripts/settle-manual.js --execute --wait');
}

// Unified settlement: dispatches to CT and Pyth handlers based on resolver.
// Handlers self-skip if their required env vars are missing.
run('node dist/scripts/settle-conditions.js --execute --wait');
