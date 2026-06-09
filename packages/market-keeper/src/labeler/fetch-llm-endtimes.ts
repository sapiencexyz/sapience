#!/usr/bin/env node
/// <reference types="node" />
/**
 * Run the production LLM endTime path (Perplexity Sonar via OpenRouter) over the
 * labeled markets and write each market's OWN endTime (unix seconds) into
 * corpus.json.
 *
 * PER-MARKET: no propagation, no event-flattening. enrichEndTimesWithLLM shares
 * one search per event (grouped by event id/slug) but returns a result per
 * conditionId, so laddered events (Game 1 vs Game 5) keep distinct endTimes.
 * Writes are chunked so a long run checkpoints instead of losing everything.
 *
 * PAID. Env:
 *   LLM_ENDTIME_MODEL  model (e.g. perplexity/sonar-pro)
 *   LLM_FIELD          corpus field to write (default 'llmEndTime')
 *   LLM_SCOPE          'labeled' (default) | 'all'
 *
 * Usage: pnpm --filter @sapience/market-keeper labeler:fetch-llm-endtimes
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

import { LLM_ENDTIME_MODEL } from '../constants';
import { enrichEndTimesWithLLM } from '../llm/enrichment';
import type { PolymarketMarket } from '../types';

const DATA_DIR = path.join(__dirname, 'data');
const CORPUS_PATH = path.join(DATA_DIR, 'corpus.json');
const LABELS_PATH = path.join(DATA_DIR, 'labels.json');
const FIELD = process.env.LLM_FIELD ?? 'llmEndTime';
const SCOPE = process.env.LLM_SCOPE ?? 'labeled';
const CHUNK_EVENTS = 50; // events per chunk (checkpoint granularity)

type Label = { conditionId: string; decision: string };
type Corpus = {
  conditionId: string;
  question: string;
  description: string;
  eventTitle: string | null;
  eventSlug: string | null;
};

const load = <T>(p: string): T => JSON.parse(fs.readFileSync(p, 'utf8')) as T;
const evKey = (c: Corpus) => c.eventSlug || c.eventTitle || c.conditionId;

async function main(): Promise<void> {
  const labels = load<Label[]>(LABELS_PATH);
  const corpus = load<Corpus[]>(CORPUS_PATH);
  const labeled = new Set(
    labels
      .filter((l) => l.decision === 'labeled' || l.decision === 'no-time')
      .map((l) => l.conditionId)
  );
  const inScope = corpus.filter(
    (c) => SCOPE === 'all' || labeled.has(c.conditionId)
  );

  // group markets into whole-event buckets so each chunk = complete events
  const byEvent = new Map<string, Corpus[]>();
  for (const c of inScope) {
    const k = evKey(c);
    let g = byEvent.get(k);
    if (!g) {
      g = [];
      byEvent.set(k, g);
    }
    g.push(c);
  }
  const MAX = parseInt(process.env.LLM_MAX_EVENTS ?? '0', 10);
  let eventGroups = [...byEvent.values()];
  if (MAX > 0) eventGroups = eventGroups.slice(0, MAX);
  console.log(
    `[llm-endtimes] scope=${SCOPE} field=${FIELD} model=${LLM_ENDTIME_MODEL} | ` +
      `${inScope.length} markets in ${eventGroups.length} events`
  );

  const cxById = new Map(corpus.map((c) => [c.conditionId, c]));
  let doneEvents = 0;
  let high = 0;
  let low = 0;
  let unknown = 0;
  let written = 0;

  for (let i = 0; i < eventGroups.length; i += CHUNK_EVENTS) {
    const chunk = eventGroups.slice(i, i + CHUNK_EVENTS).flat();
    const markets = chunk.map((c) => ({
      conditionId: c.conditionId,
      question: c.question,
      description: c.description,
      events: [
        {
          id: c.eventSlug ?? c.conditionId,
          slug: c.eventSlug ?? undefined,
          title: c.eventTitle ?? undefined,
        },
      ],
    })) as unknown as PolymarketMarket[];

    const llmMap = await enrichEndTimesWithLLM(markets, {
      enabled: true,
      apiKey: process.env.OPENROUTER_API_KEY,
      model: LLM_ENDTIME_MODEL,
    });

    for (const [cid, r] of llmMap) {
      if (r.confidence === 'high') high++;
      else if (r.confidence === 'low') low++;
      else unknown++;
      const c = cxById.get(cid);
      if (c && r.ts != null) {
        (c as Record<string, unknown>)[FIELD] = r.ts;
        written++;
      }
    }
    fs.writeFileSync(CORPUS_PATH, JSON.stringify(corpus, null, 2)); // checkpoint
    doneEvents += Math.min(CHUNK_EVENTS, eventGroups.length - i);
    console.log(
      `[llm-endtimes] ${doneEvents}/${eventGroups.length} events ` +
        `(high=${high} low=${low} unknown=${unknown}, wrote ${written})`
    );
  }
  console.log(
    `[llm-endtimes] DONE: high=${high} low=${low} unknown=${unknown}; ` +
      `wrote ${FIELD} for ${written} markets`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
