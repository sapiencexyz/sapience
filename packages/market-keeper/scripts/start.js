#!/usr/bin/env node
const { execSync } = require('child_process');

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('node dist/scripts/refresh-metadata.js');
run('node dist/scripts/generate.js');
run('node dist/scripts/relist.js');
run('node dist/scripts/prices-and-1d-7d-volume.js');
run('node dist/scripts/refresh-volume.js');
run('node dist/scripts/cleanup-polymarket.js --execute');
// "today" tag runs AFTER refresh-metadata so we own the tag value last
// (refresh-metadata can rewrite tags from Polymarket event data).
run('node dist/scripts/refresh-imminent-tag.js');

if (process.env.DEFAULT_CHAIN_ID === '5064014') {
  run('node dist/scripts/settle-polymarket.js --execute --wait');
} else {
  run('node dist/scripts/settle-manual.js --execute --wait');
}

run('node dist/scripts/settle-pyth.js --execute --wait');
