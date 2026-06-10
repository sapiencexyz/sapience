#!/usr/bin/env node
/// <reference types="node" />
/**
 * Fetch Polymarket "Highest/Lowest temperature in <City> on <Date>?" markets
 * and MERGE them into corpus.json (dedup by conditionId; existing data kept).
 *
 * These are the daily-temperature recurring weather markets we want for the
 * weather category. Tagged sourceTagSlug = "weather". Unlike labeler:fetch this
 * does NOT overwrite the corpus — it appends only new conditionIds.
 *
 * Usage: pnpm --filter @sapience/market-keeper labeler:fetch-weather
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

import type { CorpusEntry } from './fetch-corpus';

const GAMMA = 'https://gamma-api.polymarket.com';
const DATA_DIR = path.join(__dirname, 'data');
const CORPUS_PATH = path.join(DATA_DIR, 'corpus.json');
const TAG = 'weather';
const EVENT_PAGE = 100;
const MAX_EVENT_PAGES = 10;
const MARKET_LIMIT = 150;
const PAUSE_MS = 100;
const TEMP_RE = /(highest|lowest) temperature in/i;

type RawMarket = {
  conditionId?: string;
  question?: string;
  description?: string;
  endDate?: string | null;
  endDateIso?: string | null;
  slug?: string;
  volume?: string | number | null;
  volumeNum?: number | null;
  groupItemTitle?: string | null;
};
type RawEvent = { title?: string; slug?: string; markets?: RawMarket[] };

async function gammaGet(p: string): Promise<unknown> {
  const res = await fetch(`${GAMMA}${p}`);
  if (!res.ok) throw new Error(`gamma ${p} -> ${res.status} ${res.statusText}`);
  return res.json();
}
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function toEntry(m: RawMarket, ev: RawEvent): CorpusEntry | null {
  if (!m.conditionId || !m.question) return null;
  let volume = 0;
  if (typeof m.volumeNum === 'number') volume = m.volumeNum;
  else if (typeof m.volume === 'number') volume = m.volume;
  else if (typeof m.volume === 'string') volume = parseFloat(m.volume) || 0;
  return {
    conditionId: m.conditionId,
    question: m.question,
    description: m.description ?? '',
    endDate: m.endDate ?? m.endDateIso ?? null,
    slug: m.slug ?? '',
    volume,
    eventTitle: ev.title ?? null,
    eventSlug: ev.slug ?? null,
    sportsMarketType: null,
    groupItemTitle: m.groupItemTitle ?? null,
    sourceTagSlug: 'weather',
  };
}

async function main(): Promise<void> {
  const harvested: CorpusEntry[] = [];
  const seen = new Set<string>();

  for (
    let page = 0;
    page < MAX_EVENT_PAGES && harvested.length < MARKET_LIMIT;
    page++
  ) {
    const events = (await gammaGet(
      `/events?tag_slug=${TAG}&closed=false&active=true` +
        `&order=startDate&ascending=false&limit=${EVENT_PAGE}&offset=${page * EVENT_PAGE}`
    )) as RawEvent[];
    if (!Array.isArray(events) || events.length === 0) break;

    for (const ev of events) {
      for (const m of ev.markets ?? []) {
        if (!m.conditionId || seen.has(m.conditionId)) continue;
        if (!TEMP_RE.test(m.question ?? '')) continue;
        const entry = toEntry(m, ev);
        if (!entry) continue;
        seen.add(m.conditionId);
        harvested.push(entry);
        break; // one market per event — price brackets are siblings that
        // resolve at the same time, so we keep just one per city-date for
        // city variety instead of 11 redundant brackets.
      }
      if (harvested.length >= MARKET_LIMIT) break;
    }
    if (events.length < EVENT_PAGE) break;
    await pause(PAUSE_MS);
  }

  const corpus = JSON.parse(
    fs.readFileSync(CORPUS_PATH, 'utf8')
  ) as CorpusEntry[];
  const existing = new Set(corpus.map((c) => c.conditionId));
  const fresh = harvested.filter((h) => !existing.has(h.conditionId));
  const merged = [...corpus, ...fresh];
  fs.writeFileSync(CORPUS_PATH, JSON.stringify(merged, null, 2));

  console.log(
    `[fetch-weather] harvested ${harvested.length} temperature markets, ` +
      `${fresh.length} new -> corpus now ${merged.length} (was ${corpus.length})`
  );
  const cities = [
    ...new Set(
      fresh
        .map((f) => (f.question.match(/temperature in (.+?) on/i) ?? [])[1])
        .filter(Boolean)
    ),
  ];
  console.log(`[fetch-weather] ${cities.length} cities: ${cities.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
