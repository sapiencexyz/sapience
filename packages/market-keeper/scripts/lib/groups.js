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
 *
 * Reporting: each step process appends a structured summary to the file named
 * by KEEPER_SUMMARY_FILE (see src/notify/summary.ts). After the group runs we
 * read those summaries back and POST one aggregated embed to the keeper Discord
 * webhook (DISCORD_KEEPER_WEBHOOK). This is the only place the source-JS
 * orchestration layer reaches into compiled code, via the single
 * dist/src/notify/report entry point.
 */
// Load .env so the runner itself (which posts the Discord summary) sees
// DISCORD_KEEPER_WEBHOOK locally. dotenv does not override already-set vars, so
// Railway-injected env still wins in production. The subservices load their own
// dotenv when they run; this is only for the orchestrator's own env reads.
require('dotenv/config');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

// Lazily-required so a missing/stale dist build degrades to "no Discord report"
// instead of crashing the runner. Returns null if dist isn't built yet.
function loadReporter() {
  try {
    return require('../../dist/src/notify/report');
  } catch (err) {
    console.error(
      '[keeper] Discord reporter unavailable (dist not built?):',
      err && err.message ? err.message : err
    );
    return null;
  }
}

/**
 * Run one group's steps sequentially, fail-fast. Captures each step's
 * pass/fail, duration, and emitted summary, posts an aggregated Discord
 * report, then re-throws on failure to preserve the non-zero exit code.
 */
async function runGroup(name) {
  const steps = GROUPS[name];
  if (!steps) throw new Error(`Unknown keeper cron group: ${name}`);

  const reporter = loadReporter();
  const summaryFile = path.join(
    os.tmpdir(),
    `keeper-summary-${name}-${process.pid}-${Date.now()}.jsonl`
  );
  try {
    fs.writeFileSync(summaryFile, '');
  } catch {
    // if we can't create the file, steps just won't emit; carry on
  }

  const runs = [];
  let failure = null;
  let consumed = 0;

  for (const [label, cmd] of steps) {
    console.log(`[keeper:${name}] ▶ ${label}`);
    const start = Date.now();
    let status = 'ok';
    let error;
    try {
      execSync(cmd, {
        stdio: 'inherit',
        env: { ...process.env, KEEPER_SUMMARY_FILE: summaryFile },
      });
    } catch (err) {
      status = 'failed';
      error = err && err.message ? err.message : String(err);
      failure = err;
    }
    const durationMs = Date.now() - start;

    let summaries = [];
    if (reporter) {
      const all = reporter.readStepSummaries(summaryFile);
      summaries = all.slice(consumed);
      consumed = all.length;
    }
    runs.push({ label, status, durationMs, summaries, error });

    if (failure) break;
  }

  // Mark steps that never ran (aborted by fail-fast) as skipped.
  if (failure) {
    const ranLabels = new Set(runs.map((r) => r.label));
    for (const [label] of steps) {
      if (!ranLabels.has(label)) {
        runs.push({ label, status: 'skipped', durationMs: 0, summaries: [] });
      }
    }
  }

  if (reporter) {
    try {
      await reporter.postGroupReport({ group: name, runs });
    } catch (err) {
      console.error(
        '[keeper] Failed to post Discord summary:',
        err && err.message ? err.message : err
      );
    }
  }

  try {
    fs.unlinkSync(summaryFile);
  } catch {
    // ignore cleanup failure
  }

  if (failure) throw failure; // preserve fail-fast / non-zero exit
}

module.exports = { GROUPS, ORDER, runGroup };
