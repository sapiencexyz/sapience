#!/usr/bin/env node
/**
 * Market-data cron: prices-and-1d-7d-volume → refresh-volume.
 * Writes only price/volume fields (disjoint from tags), so it's safe to run
 * frequently and independently of the other crons.
 */
require('./lib/groups').runGroup('market-data');
