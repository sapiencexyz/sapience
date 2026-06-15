/**
 * Shared step definitions + a fail-fast sequential runner for the keeper's
 * cron groups.
 *
 * Each step is a separate `node dist/scripts/X.js` process: they share no
 * in-memory state and re-read their inputs from the Sapience API / Polymarket /
 * chain. So the groups below are split by *what they write* (to avoid two crons
 * writing the same field concurrently) and by cadence:
 *
 *   - discovery      generate, relist            create NEW rows only
 *   - metadata-tags  refresh-metadata,           the ONLY two writers of
 *                    refresh-imminent-tag        condition.tags — kept in one
 *                                                sequential group so they can
 *                                                never overlap and clobber each
 *                                                other's tag write
 *   - market-data    prices-1d-7d, refresh-volume   price/volume fields
 *   - settlement     cleanup, settle-*           settlement state
 *
 * Groups run FAIL-FAST: a thrown step aborts its group and the process exits
 * non-zero, so Railway's on_failure restart policy retries it. Cross-concern
 * isolation comes from running each group as its OWN Railway cron, not from
 * swallowing errors here — a broken settle cron can't block the tag cron.
 */
const { execSync } = require('child_process');

// Chain-dependent settlement entrypoint, matching the original start.js branch.
const settleCmd =
  process.env.DEFAULT_CHAIN_ID === '5064014'
    ? 'node dist/scripts/settle-polymarket.js --execute --wait'
    : 'node dist/scripts/settle-manual.js --execute --wait';

const GROUPS = {
  discovery: [
    ['generate', 'node dist/scripts/generate.js'],
    ['relist', 'node dist/scripts/relist.js'],
  ],
  'metadata-tags': [
    ['refresh-metadata', 'node dist/scripts/refresh-metadata.js'],
    ['refresh-imminent-tag', 'node dist/scripts/refresh-imminent-tag.js'],
  ],
  'market-data': [
    ['prices-and-1d-7d-volume', 'node dist/scripts/prices-and-1d-7d-volume.js'],
    ['refresh-volume', 'node dist/scripts/refresh-volume.js'],
  ],
  settlement: [
    ['cleanup-polymarket', 'node dist/scripts/cleanup-polymarket.js --execute'],
    ['settle', settleCmd],
    ['settle-pyth', 'node dist/scripts/settle-pyth.js --execute --wait'],
  ],
};

// Order used by the transitional all-in-one start.js: create → refresh
// metadata + tags → market data → settle.
const ORDER = ['discovery', 'metadata-tags', 'market-data', 'settlement'];

/** Run one group's steps sequentially, fail-fast (throws on first failure). */
function runGroup(name) {
  const steps = GROUPS[name];
  if (!steps) throw new Error(`Unknown keeper cron group: ${name}`);
  for (const [label, cmd] of steps) {
    console.log(`[keeper:${name}] ▶ ${label}`);
    execSync(cmd, { stdio: 'inherit' });
  }
}

module.exports = { GROUPS, ORDER, runGroup };
