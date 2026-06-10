#!/usr/bin/env node
/// <reference types="node" />
/**
 * One-off script to add specific Polymarket events by slug.
 * Bypasses the 21-day end date window used by the generate pipeline.
 *
 * Shares the generate cron's processing exactly: it resolves each slug to its
 * market conditionIds, re-fetches those markets via the canonical /markets
 * endpoint (so they carry the same seriesSlug/series/gameStartTime embed the
 * endTime cascade needs), applies the same active/open + binary filters, then
 * runs groupMarkets → submitToAPI. The only intentional difference is that the
 * 21-day end-date window is not applied.
 *
 * Usage:
 *   tsx scripts/add-events.ts <event-slug-1> [event-slug-2] ...
 *   tsx scripts/add-events.ts --dry-run <event-slug-1> [event-slug-2] ...
 *
 * Example:
 *   tsx scripts/add-events.ts maine-senate-election-winner michigan-democratic-senate-primary-winner
 *   tsx scripts/add-events.ts --dry-run maine-senate-election-winner
 *
 * Environment Variables (required for API submission):
 *   SAPIENCE_API_URL     API URL (default: https://api.sapience.xyz)
 *   ADMIN_PRIVATE_KEY    64-char hex private key for signing admin requests
 */

import 'dotenv/config';
import { DEFAULT_SAPIENCE_API_URL } from '../src/constants';
import { validatePrivateKey, confirmProductionAccess } from '../src/utils';
import { fetchMarketsForEventSlugs } from '../src/generate/from-event-slugs';
import { groupMarkets, exportJSON } from '../src/generate/grouping';
import { printDryRun, submitToAPI } from '../src/generate/api';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const slugs = args.filter((a) => !a.startsWith('--'));

  if (slugs.length === 0) {
    console.error(
      'Usage: tsx scripts/add-events.ts [--dry-run] <event-slug-1> [event-slug-2] ...'
    );
    console.error(
      'Example: tsx scripts/add-events.ts maine-senate-election-winner'
    );
    process.exit(1);
  }

  const apiUrl = process.env.SAPIENCE_API_URL || DEFAULT_SAPIENCE_API_URL;
  let privateKey: `0x${string}` | undefined;
  try {
    privateKey = validatePrivateKey(process.env.ADMIN_PRIVATE_KEY);
  } catch (error) {
    if (!dryRun) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  // Confirm production access early (before any work), matching generate.
  if (!dryRun && privateKey) {
    await confirmProductionAccess(apiUrl);
  }

  // Fetch canonical markets for the requested slugs — same object shape and
  // active/open + binary filtering as the generate cron, minus the 21-day
  // window.
  const allMarkets = await fetchMarketsForEventSlugs(slugs);
  if (allMarkets.length === 0) {
    console.error('No markets found for the given event slugs.');
    process.exit(1);
  }

  console.log(`\nTotal markets fetched: ${allMarkets.length}`);

  // Transform through the same pipeline as generate.
  const sapienceData = await groupMarkets(allMarkets, apiUrl);
  console.log(
    `Transformed into ${sapienceData.metadata.totalConditions} conditions`
  );

  // Write the inspection artifact (generate writes this on every run).
  exportJSON(sapienceData);

  if (dryRun) {
    printDryRun(sapienceData);
    return;
  }

  if (!privateKey) {
    console.error(
      'ADMIN_PRIVATE_KEY is required for submission (use --dry-run to preview)'
    );
    process.exit(1);
  }

  await submitToAPI(apiUrl, privateKey, sapienceData);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
