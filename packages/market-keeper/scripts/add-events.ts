#!/usr/bin/env node
/// <reference types="node" />
/**
 * One-off script to add specific Polymarket events by slug.
 * Bypasses the 21-day end date window used by the generate pipeline.
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
import type { PolymarketMarket } from '../src/types';
import { DEFAULT_SAPIENCE_API_URL } from '../src/constants';
import { fetchWithRetry, validatePrivateKey } from '../src/utils';
import { groupMarkets } from '../src/generate/grouping';
import { printDryRun, submitToAPI } from '../src/generate/api';

async function fetchEventBySlug(slug: string): Promise<PolymarketMarket[]> {
  const url = `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`;
  const response = await fetchWithRetry(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    console.error(`[Polymarket] Failed to fetch event "${slug}": HTTP ${response.status}`);
    return [];
  }

  const events: Array<{
    id?: string;
    title?: string;
    slug?: string;
    description?: string;
    markets?: PolymarketMarket[];
  }> = await response.json();

  if (events.length === 0) {
    console.warn(`[Polymarket] No event found for slug "${slug}"`);
    return [];
  }

  const markets: PolymarketMarket[] = [];
  for (const event of events) {
    const parentEvent = {
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
    };

    for (const market of event.markets ?? []) {
      market.events = [parentEvent];
      // API requires non-empty description; fall back to event description or question
      if (!market.description) {
        market.description = event.description || market.question;
      }
      markets.push(market);
    }

    console.log(
      `[Polymarket] Event "${event.title}" (${slug}): ${event.markets?.length ?? 0} markets`
    );
  }

  return markets;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const slugs = args.filter((a) => !a.startsWith('--'));

  if (slugs.length === 0) {
    console.error('Usage: tsx scripts/add-events.ts [--dry-run] <event-slug-1> [event-slug-2] ...');
    console.error('Example: tsx scripts/add-events.ts maine-senate-election-winner');
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

  // Fetch all markets from the given event slugs
  const allMarkets: PolymarketMarket[] = [];
  for (const slug of slugs) {
    const markets = await fetchEventBySlug(slug);
    allMarkets.push(...markets);
  }

  if (allMarkets.length === 0) {
    console.error('No markets found for the given event slugs.');
    process.exit(1);
  }

  console.log(`\nTotal markets fetched: ${allMarkets.length}`);

  // Transform through the same pipeline as generate
  const sapienceData = await groupMarkets(allMarkets, apiUrl);
  console.log(`Transformed into ${sapienceData.metadata.totalConditions} conditions`);

  if (dryRun) {
    printDryRun(sapienceData);
    return;
  }

  if (!privateKey) {
    console.error('ADMIN_PRIVATE_KEY is required for submission (use --dry-run to preview)');
    process.exit(1);
  }

  await submitToAPI(apiUrl, privateKey, sapienceData);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
