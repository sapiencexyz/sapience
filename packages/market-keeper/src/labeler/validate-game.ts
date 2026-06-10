#!/usr/bin/env node
/// <reference types="node" />
/**
 * Label-free validation of gameEndTime: for each league, fetch closed games and
 * compare gameStartTime + per-league offset against the ACTUAL resolution
 * (umaEndDate). Reports median / p90 absolute error in minutes.
 *
 * (Offsets are calibrated on closed games, so the median error is ~0 by design;
 * the p90 is the honest signal — how tightly gst+offset tracks real resolution.)
 *
 * Usage: pnpm --filter @sapience/market-keeper labeler:validate-game
 */

import 'dotenv/config';

import { SPORT_LEAGUES, gameEndTime } from '../generate/extractors/sports/game';

const GAMMA = 'https://gamma-api.polymarket.com';
const PAUSE_MS = 100;

async function gammaGet(p: string): Promise<unknown> {
  const res = await fetch(`${GAMMA}${p}`);
  if (!res.ok) throw new Error(`gamma ${p} -> ${res.status} ${res.statusText}`);
  return res.json();
}
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const sortNum = (xs: number[]) => [...xs].sort((a, b) => a - b);
const median = (xs: number[]) =>
  xs.length ? sortNum(xs)[Math.floor(xs.length / 2)] : NaN;
const p90 = (xs: number[]) =>
  xs.length ? sortNum(xs)[Math.floor(xs.length * 0.9)] : NaN;

type RawMarket = { gameStartTime?: string | null; umaEndDate?: string | null };
type RawEvent = { markets?: RawMarket[] };

async function main(): Promise<void> {
  console.log('gameEndTime vs actual resolution (umaEndDate), closed games:\n');
  for (const league of SPORT_LEAGUES) {
    const events = (await gammaGet(
      `/events?tag_slug=${league}&closed=true&order=startDate&ascending=false&limit=100`
    )) as RawEvent[];
    const errs: number[] = [];
    const seen = new Set<string>();
    for (const ev of events ?? []) {
      for (const m of ev.markets ?? []) {
        if (!m.gameStartTime || !m.umaEndDate || seen.has(m.gameStartTime))
          continue;
        seen.add(m.gameStartTime);
        const pred = gameEndTime(m.gameStartTime, league);
        const actual = Date.parse(m.umaEndDate);
        if (pred == null || !Number.isFinite(actual)) continue;
        errs.push(Math.abs(pred * 1000 - actual) / 60_000);
      }
    }
    const m = median(errs);
    const p = p90(errs);
    console.log(
      `${league.padEnd(20)} n=${String(errs.length).padStart(3)}  ` +
        `medErr=${Number.isFinite(m) ? Math.round(m) : '-'}min  ` +
        `p90Err=${Number.isFinite(p) ? Math.round(p) : '-'}min`
    );
    await pause(PAUSE_MS);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
