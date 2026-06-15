#!/usr/bin/env node
/**
 * Settlement cron: cleanup-polymarket → settle (polymarket|manual) → settle-pyth.
 * Writes settlement state only; independent of the metadata/tag/market-data
 * crons, so a failure here can't block them.
 */
require('./lib/groups').runGroup('settlement');
