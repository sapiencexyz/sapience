#!/usr/bin/env node
/// <reference types="node" />
/**
 * Phase 1 scoring harness — non-LLM endTime estimators vs. the human labels.
 *
 * Decisions baked in (from Phase 0):
 *  - unit = events (deduped; same-event markets share a description)
 *  - benchmark set = all non-crypto labeled events + a 30-event diverse crypto
 *    sample (crypto is ~circular for endDate, kept only for completeness)
 *  - ground truth = the label  ->  SYMMETRIC error (reality is not in the loop)
 *  - deadband tolerance: imprecise -> ±1.5 days, precise -> strict (0)
 *  - hold-outs: endDate not scored on polymarket-sourced (circular) or crypto;
 *    regex not scored on regex-sourced
 *  - metric = error DISTRIBUTION (median / p90 abs err) + mean signed err (bias),
 *    with coverage reported separately from accuracy
 *
 * Usage: pnpm --filter @sapience/market-keeper labeler:score
 */

import * as fs from 'fs';
import * as path from 'path';

import { extractEndTime } from '../generate/endtime';

import { extractCategoryEndTime } from '../generate/extractors';
import { bestEndTime } from '../generate/extractors/cascade';
import { chronoEndTime } from '../generate/extractors/chrono';
import { gameEndTime } from '../generate/extractors/sports/game';

const DATA_DIR = process.env.LABELER_DATA ?? path.join(__dirname, 'data');
const DAY = 86_400_000;
const IMPRECISE_TOL_DAYS = 1.5; // ± room for imprecise labels (both ways)
const PRECISE_TOL_DAYS = 5 / 1440; // 5 minutes of slack for precise labels
const CRYPTO_SAMPLE = 30;

type Decision = 'labeled' | 'no-time' | 'skipped';
type Label = {
  conditionId: string;
  humanEndTime: string | null;
  decision: Decision;
  source: string | null;
  precise: boolean;
};
type Corpus = {
  conditionId: string;
  question: string;
  description: string;
  endDate: string | null;
  volume: number;
  eventSlug: string | null;
  eventTitle: string | null;
  sourceTagSlug: string | null;
  gameStartTime?: string | null;
  league?: string | null;
  llmEndTime?: number | null;
  llmEndTimeSonar?: number | null;
};
type Ev = Label & { c: Corpus };

function load<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')) as T;
}

const labels = load<Label[]>('labels.json');
const corpus = load<Corpus[]>('corpus.json');
const cx = new Map(corpus.map((c) => [c.conditionId, c]));

// labeled markets joined to corpus
const labeled: Ev[] = labels
  .filter((l) => l.decision === 'labeled' || l.decision === 'no-time')
  .map((l) => ({ ...l, c: cx.get(l.conditionId) as Corpus }))
  .filter((x) => x.c && x.humanEndTime);

const evKey = (c: Corpus) => c.eventSlug || c.eventTitle || c.conditionId;

// dedup to one (highest-volume) representative per event
const byEvent = new Map<string, Ev>();
for (const x of labeled) {
  const k = evKey(x.c);
  const ex = byEvent.get(k);
  if (!ex || (x.c.volume ?? 0) > (ex.c.volume ?? 0)) byEvent.set(k, x);
}
const allEvents = [...byEvent.values()];

// benchmark set: non-crypto + diverse crypto sample (≤3 per template, top 30 by vol)
const nonCrypto = allEvents.filter((e) => e.c.sourceTagSlug !== 'crypto');
const cryptoAll = allEvents.filter((e) => e.c.sourceTagSlug === 'crypto');
const tmpl = (t: string | null) =>
  (t ?? '')
    .toLowerCase()
    .replace(/[0-9]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/ +/g, ' ')
    .trim()
    .slice(0, 24);
const cgroups = new Map<string, Ev[]>();
for (const e of cryptoAll) {
  const k = tmpl(e.c.eventTitle ?? e.conditionId);
  let g = cgroups.get(k);
  if (!g) {
    g = [];
    cgroups.set(k, g);
  }
  g.push(e);
}
const cryptoSample = [...cgroups.values()]
  .map((g) => ({ g, maxVol: Math.max(...g.map((e) => e.c.volume ?? 0)) }))
  .sort((a, b) => b.maxVol - a.maxVol)
  .flatMap(({ g }) => g.slice(0, 3))
  .slice(0, CRYPTO_SAMPLE);
const benchmark = [...nonCrypto, ...cryptoSample];

// ---- estimators (non-LLM) ----
type Estimator = {
  name: string;
  predict: (e: Ev) => number | null; // ms epoch, or null = declined
  skip: (e: Ev) => boolean; // hold-out (not eligible for this estimator)
};
const estimators: Estimator[] = [
  {
    name: 'endDate',
    predict: (e) => (e.c.endDate ? Date.parse(e.c.endDate) : null),
    skip: (e) => e.source === 'polymarket' || e.c.sourceTagSlug === 'crypto',
  },
  {
    name: 'endDate+1d',
    predict: (e) => (e.c.endDate ? Date.parse(e.c.endDate) + DAY : null),
    skip: (e) => e.source === 'polymarket' || e.c.sourceTagSlug === 'crypto',
  },
  {
    name: 'regex',
    predict: (e) => {
      try {
        const ts = extractEndTime(e.c.question, e.c.description ?? '');
        return ts == null ? null : ts * 1000;
      } catch {
        return null;
      }
    },
    skip: (e) => e.source === 'regex',
  },
  {
    name: 'regex-cat',
    predict: (e) => {
      try {
        const ts = extractCategoryEndTime(
          e.c.question,
          e.c.description ?? '',
          e.c.sourceTagSlug
        );
        return ts == null ? null : ts * 1000;
      } catch {
        return null;
      }
    },
    skip: () => false,
  },
  {
    name: 'game',
    predict: (e) => {
      const ts = gameEndTime(e.c.gameStartTime, e.c.league);
      return ts == null ? null : ts * 1000;
    },
    skip: () => false,
  },
  {
    name: 'chrono',
    predict: (e) => {
      try {
        const ts = chronoEndTime(e.c.question, e.c.description ?? '');
        return ts == null ? null : ts * 1000;
      } catch {
        return null;
      }
    },
    skip: () => false,
  },
  {
    name: 'llm',
    predict: (e) => (e.c.llmEndTime != null ? e.c.llmEndTime * 1000 : null),
    skip: () => false,
  },
  {
    name: 'llm-sonar',
    predict: (e) =>
      e.c.llmEndTimeSonar != null ? e.c.llmEndTimeSonar * 1000 : null,
    skip: () => false,
  },
  {
    name: 'cascade',
    predict: (e) => {
      const ts = bestEndTime({
        question: e.c.question,
        description: e.c.description ?? '',
        tag: e.c.sourceTagSlug,
        gameStartTime: e.c.gameStartTime,
        league: e.c.league,
        endDate: e.c.endDate,
        llmEndTime: e.c.llmEndTime,
      });
      return ts == null ? null : ts * 1000;
    },
    skip: () => false,
  },
  {
    name: 'cascade-sonar',
    predict: (e) => {
      const ts = bestEndTime({
        question: e.c.question,
        description: e.c.description ?? '',
        tag: e.c.sourceTagSlug,
        gameStartTime: e.c.gameStartTime,
        league: e.c.league,
        endDate: e.c.endDate,
        llmEndTime: e.c.llmEndTimeSonar, // basic sonar instead of sonar-pro
      });
      return ts == null ? null : ts * 1000;
    },
    skip: () => false,
  },
];

const tolDays = (e: Ev) => (e.precise ? PRECISE_TOL_DAYS : IMPRECISE_TOL_DAYS);

type Row = { signed: number; abs: number; eff: number };
function scoreEvent(e: Ev, pred: number | null): Row | null {
  if (pred == null) return null;
  const label = Date.parse(e.humanEndTime as string);
  if (!Number.isFinite(label)) return null;
  const signed = (pred - label) / DAY;
  const abs = Math.abs(signed);
  const eff = Math.max(0, abs - tolDays(e));
  return { signed, abs, eff };
}

// ---- stats helpers ----
const sortNum = (xs: number[]) => [...xs].sort((a, b) => a - b);
const median = (xs: number[]) =>
  xs.length ? sortNum(xs)[Math.floor(xs.length / 2)] : NaN;
const pctl = (xs: number[], p: number) =>
  xs.length
    ? sortNum(xs)[Math.min(xs.length - 1, Math.floor(xs.length * p))]
    : NaN;
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const r2 = (x: number) =>
  Number.isFinite(x) ? (Math.round(x * 100) / 100).toString() : '-';

type Bucket = {
  eligible: number;
  answered: number;
  abs: number[];
  signed: number[];
  within: number;
};
const newBucket = (): Bucket => ({
  eligible: 0,
  answered: 0,
  abs: [],
  signed: [],
  within: 0,
});

const padE = (s: string | number, n: number) => String(s).padEnd(n);
const padS = (s: string | number, n: number) => String(s).padStart(n);

function header(): string {
  return (
    padE('category', 13) +
    padS('elig', 6) +
    padS('cov%', 7) +
    padS('medAbs', 9) +
    padS('p90Abs', 9) +
    padS('mSigned', 10) +
    padS('within%', 9)
  );
}
function line(cat: string, b: Bucket): string {
  const cov = b.eligible ? (b.answered * 100) / b.eligible : 0;
  const within = b.answered ? (b.within * 100) / b.answered : 0;
  return (
    padE(cat, 13) +
    padS(b.eligible, 6) +
    padS(Math.round(cov), 7) +
    padS(r2(median(b.abs)) + 'd', 9) +
    padS(r2(pctl(b.abs, 0.9)) + 'd', 9) +
    padS(r2(mean(b.signed)) + 'd', 10) +
    padS(Math.round(within) + '%', 9)
  );
}

// ---- run ----
console.log(
  `benchmark: ${benchmark.length} events ` +
    `(${nonCrypto.length} non-crypto + ${cryptoSample.length} crypto sample, ` +
    `from ${allEvents.length} labeled events)`
);
console.log(
  `tolerance: imprecise ±${IMPRECISE_TOL_DAYS}d, precise ±${PRECISE_TOL_DAYS}d  |  ` +
    `error is symmetric vs label; within% = share of answered with abs err inside tolerance\n`
);

for (const est of estimators) {
  const byCat = new Map<string, Bucket>();
  const all = newBucket();
  for (const e of benchmark) {
    if (est.skip(e)) continue;
    const cat = e.c.sourceTagSlug ?? 'null';
    let b = byCat.get(cat);
    if (!b) {
      b = newBucket();
      byCat.set(cat, b);
    }
    b.eligible++;
    all.eligible++;
    const row = scoreEvent(e, est.predict(e));
    if (row) {
      b.answered++;
      all.answered++;
      b.abs.push(row.abs);
      all.abs.push(row.abs);
      b.signed.push(row.signed);
      all.signed.push(row.signed);
      if (row.eff === 0) {
        b.within++;
        all.within++;
      }
    }
  }
  console.log(`=== ${est.name} ===`);
  console.log(header());
  console.log(line('ALL', all));
  const cats = [...byCat.entries()].sort(
    (a, b) => b[1].eligible - a[1].eligible
  );
  for (const [cat, b] of cats) console.log(line(cat, b));
  console.log('');
}

// optional per-event drill-down:  pnpm labeler:score -- --debug=NFL|NHL
const dbgArg = process.argv.find((a) => a.startsWith('--debug='));
if (dbgArg) {
  const re = new RegExp(dbgArg.slice('--debug='.length), 'i');
  const matched = benchmark.filter(
    (e) => re.test(e.c.eventTitle ?? '') || re.test(e.c.question)
  );
  console.log(
    `=== debug: ${matched.length} events matching /${re.source}/i ===`
  );
  for (const e of matched.slice(0, 25)) {
    const label = Date.parse(e.humanEndTime as string);
    const preds = estimators
      .map((est) => {
        if (est.skip(e)) return `${est.name}=skip`;
        const p = est.predict(e);
        if (p == null) return `${est.name}=—`;
        const errd = Math.round(((p - label) / DAY) * 10) / 10;
        return `${est.name}=${new Date(p).toISOString().slice(0, 10)}(${errd >= 0 ? '+' : ''}${errd}d)`;
      })
      .join('  ');
    console.log(
      `${(e.c.eventTitle ?? e.c.question).slice(0, 38).padEnd(39)} label=${(e.humanEndTime ?? '').slice(0, 10)}  ${preds}`
    );
  }
}

// optional: regex (rung 4) error broken down by confidence tier, to decide
// which tiers the cascade should trust vs. let decline.  labeler:score -- --regex-tiers
if (process.argv.includes('--regex-tiers')) {
  const byTier = new Map<string, number[]>();
  for (const e of benchmark) {
    const out = { tier: '' };
    let ts: number | null = null;
    try {
      ts = extractEndTime(e.c.question, e.c.description ?? '', out);
    } catch {
      ts = null;
    }
    if (ts == null) continue;
    const label = Date.parse(e.humanEndTime as string);
    if (!Number.isFinite(label)) continue;
    const abs = Math.abs((ts * 1000 - label) / DAY);
    const tier = out.tier || '(none)';
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)?.push(abs);
  }
  console.log('=== regex error by confidence tier (abs days) ===');
  for (const [tier, xs] of [...byTier.entries()].sort(
    (a, b) => b[1].length - a[1].length
  )) {
    console.log(
      `tier ${tier.padEnd(9)} n=${String(xs.length).padStart(3)}  ` +
        `med=${r2(median(xs))}d  p90=${r2(pctl(xs, 0.9))}d`
    );
  }
}
