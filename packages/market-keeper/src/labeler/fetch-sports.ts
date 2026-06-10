#!/usr/bin/env node
/// <reference types="node" />
/**
 * Fetch Polymarket sports GAME markets (one per game) across leagues and MERGE
 * them into corpus.json. Captures `gameStartTime` (the clean resolution signal)
 * and `league` (for the per-sport duration offset). Pulls both active
 * (unresolved) and closed (old) markets — closed is needed for NFL (offseason).
 * Tagged sourceTagSlug = "sports".
 *
 * Also reports how many *active* (unresolved) game-like markets carry a
 * gameStartTime — the "is this signal there before resolution?" check.
 *
 * Usage: pnpm --filter @sapience/market-keeper labeler:fetch-sports
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

import { SPORT_LEAGUES } from '../generate/extractors/sports/game';
import type { CorpusEntry } from './fetch-corpus';

const GAMMA = 'https://gamma-api.polymarket.com';
const DATA_DIR = path.join(__dirname, 'data');
const CORPUS_PATH = path.join(DATA_DIR, 'corpus.json');
const LEAGUES = SPORT_LEAGUES;
const PER_STATE = 12; // game-events per league per state (active / closed)
const EVENT_PAGE = 100;
const PAUSE_MS = 100;
const GAME_RE = / vs\.?\s| @ /i;

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
  sportsMarketType?: string | null;
  gameStartTime?: string | null;
};
type RawEvent = { title?: string; slug?: string; markets?: RawMarket[] };

async function gammaGet(p: string): Promise<unknown> {
  const res = await fetch(`${GAMMA}${p}`);
  if (!res.ok) throw new Error(`gamma ${p} -> ${res.status} ${res.statusText}`);
  return res.json();
}
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function toEntry(
  m: RawMarket,
  ev: RawEvent,
  league: string
): CorpusEntry | null {
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
    sportsMarketType: m.sportsMarketType ?? null,
    groupItemTitle: m.groupItemTitle ?? null,
    sourceTagSlug: 'sports',
    gameStartTime: m.gameStartTime ?? null,
    league,
  };
}

type Harvest = { entries: CorpusEntry[]; gameLike: number; withGst: number };

async function harvest(
  league: string,
  closed: boolean,
  limit: number,
  seen: Set<string>
): Promise<Harvest> {
  const out: Harvest = { entries: [], gameLike: 0, withGst: 0 };
  const stateQ = closed ? 'closed=true' : 'closed=false&active=true';
  const events = (await gammaGet(
    `/events?tag_slug=${league}&${stateQ}&order=startDate&ascending=false&limit=${EVENT_PAGE}`
  )) as RawEvent[];
  if (!Array.isArray(events)) return out;
  for (const ev of events) {
    // a game-like market in this event (title "A vs. B")
    const game = (ev.markets ?? []).find(
      (m) => m.conditionId && GAME_RE.test(m.question ?? '')
    );
    if (!game) continue;
    out.gameLike++;
    if (game.gameStartTime) out.withGst++;
    if (seen.has(game.conditionId!) || out.entries.length >= limit) continue;
    const entry = toEntry(game, ev, league);
    if (!entry) continue;
    seen.add(game.conditionId!);
    out.entries.push(entry);
  }
  return out;
}

async function main(): Promise<void> {
  const seen = new Set<string>();
  const harvested: CorpusEntry[] = [];
  let activeGameLike = 0;
  let activeWithGst = 0;

  for (const league of LEAGUES) {
    const a = await harvest(league, false, PER_STATE, seen);
    await pause(PAUSE_MS);
    const c = await harvest(league, true, PER_STATE, seen);
    await pause(PAUSE_MS);
    harvested.push(...a.entries, ...c.entries);
    activeGameLike += a.gameLike;
    activeWithGst += a.withGst;
    console.log(
      `[fetch-sports] ${league}: +${a.entries.length} active, +${c.entries.length} closed ` +
        `(active gameStartTime ${a.withGst}/${a.gameLike})`
    );
  }

  const corpus = JSON.parse(
    fs.readFileSync(CORPUS_PATH, 'utf8')
  ) as CorpusEntry[];
  const existing = new Set(corpus.map((c) => c.conditionId));
  const fresh = harvested.filter((h) => !existing.has(h.conditionId));
  fs.writeFileSync(CORPUS_PATH, JSON.stringify([...corpus, ...fresh], null, 2));

  console.log(
    `[fetch-sports] ${fresh.length} new game markets -> corpus now ${corpus.length + fresh.length}`
  );
  const pct =
    activeGameLike > 0 ? Math.round((activeWithGst * 100) / activeGameLike) : 0;
  console.log(
    `[fetch-sports] IN-THE-WILD CHECK: ${activeWithGst}/${activeGameLike} ` +
      `(${pct}%) ACTIVE/unresolved game markets carry gameStartTime`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
