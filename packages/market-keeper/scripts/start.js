#!/usr/bin/env node
/**
 * Transitional all-in-one keeper entrypoint: runs every cron group in sequence
 * (discovery → metadata-tags → market-data → settlement), fail-fast.
 *
 * This preserves the original single-cron behaviour while the groups are being
 * split into separate Railway crons (scripts/cron-*.js + the start:* package
 * scripts). Once each group has its own Railway cron, this file can be retired
 * — cross-group failure isolation comes from that split, not from here.
 *
 * Ordering note: refresh-metadata + refresh-imminent-tag run back-to-back in
 * the metadata-tags group, and refresh-metadata now PRESERVES the "Today" tag
 * (KEEPER_INTERNAL_TAGS), so it no longer has to run last to "own" the tag.
 */
const { ORDER, runGroup } = require('./lib/groups');

(async () => {
  for (const name of ORDER) await runGroup(name);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
