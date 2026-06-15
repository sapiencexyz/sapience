#!/usr/bin/env node
// -----------------------------------------------------------------------------
// generatePools.mjs — build daily World Cup bingo pools from the Sapience API.
//
// One pool per match day. A pool OPENS the day before its matches and CLOSES at
// the start of the match day (US Eastern), so when it closes its markets have
// not resolved yet — you play "today" for "tomorrow's" matches.
//
//   match day D (ET):  opensAt = D-1 00:00 ET, cutoff = D 00:00 ET
//   conditions:        every World-Cup-tagged condition whose endTime falls on
//                      day D (ET), unsettled, public.
//
// Mutually exclusive outcomes (conditions sharing a neg-risk ConditionGroup) are
// collapsed to a single condition — the most balanced one (estimatedPrice
// closest to 0.5), since a card can't sensibly carry two cells that can't both
// be true.
//
// Economic params (multiplierBps / referralBps / minCardPriceWei) are inherited
// from the last existing pool in the target file. Existing pools are kept (so
// historical cards stay resolvable) and the new daily pools are appended.
//
// Usage:
//   node server/scripts/generatePools.mjs --network staging
//   node server/scripts/generatePools.mjs --network main --start 2026-06-16 --days 6
//   node server/scripts/generatePools.mjs --network staging --dry-run
// -----------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(HERE, '..', '..'); // packages/bingo

const NETWORKS = {
  staging: { api: 'https://api.staging.sapience.xyz/graphql', file: 'pool.json' },
  main: { api: 'https://api.sapience.xyz/graphql', file: 'pool.main.json' },
};

// Tags that mark a condition as World Cup related (any one matches).
const WORLD_CUP_TAGS = ['World Cup', 'FIFA World Cup', '2026 FIFA World Cup'];

// US Eastern is EDT (UTC-4) for the whole 2026 World Cup window (DST runs
// Mar–Nov), so a fixed offset is correct here. Revisit if pools ever span the
// Nov DST boundary.
const ET_OFFSET_SECONDS = -4 * 3600;
const DAY = 86400;
const CELL_COUNT = 16; // pool.ts requires at least this many conditions
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

function parseArgs(argv) {
  const out = { network: 'staging', days: 6, start: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--network') out.network = argv[++i];
    else if (a === '--days') out.days = Number(argv[++i]);
    else if (a === '--start') out.start = argv[++i];
    else if (a === '--dry-run' || a === '--dry') out.dryRun = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!NETWORKS[out.network]) {
    throw new Error(`--network must be one of: ${Object.keys(NETWORKS).join(', ')}`);
  }
  return out;
}

/** Unix seconds for 00:00 US-Eastern on a given ET calendar date. */
function etMidnight(year, month /* 1-12 */, day) {
  return Math.floor(Date.UTC(year, month - 1, day, 0, 0, 0) / 1000) - ET_OFFSET_SECONDS;
}

/** The ET calendar date (start-of-day unix) that an endTime falls on. */
function etDayStart(unixSeconds) {
  const etDate = new Date((unixSeconds + ET_OFFSET_SECONDS) * 1000);
  return etMidnight(
    etDate.getUTCFullYear(),
    etDate.getUTCMonth() + 1,
    etDate.getUTCDate(),
  );
}

function ymd(unixSeconds) {
  const d = new Date((unixSeconds + ET_OFFSET_SECONDS) * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), label: `${d.getUTCFullYear()}-${mm}-${dd}` };
}

const monAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

async function fetchConditions(apiUrl, gte, lte) {
  const all = [];
  for (let skip = 0; ; skip += 100) {
    const body = {
      query: `query($w:ConditionWhereInput!,$skip:Int!){conditions(where:$w,take:100,skip:$skip,orderBy:[{endTime:asc}]){id endTime resolver shortName question estimatedPrice similarMarketImage public conditionGroup{id negRisk}}}`,
      variables: {
        skip,
        w: {
          tags: { hasSome: WORLD_CUP_TAGS },
          settled: { equals: false },
          public: { equals: true },
          endTime: { gte, lte },
        },
      },
    };
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.errors) throw new Error(`API error: ${JSON.stringify(json.errors)}`);
    const page = json.data.conditions;
    all.push(...page);
    if (page.length < 100) break;
  }
  return all;
}

/** Collapse neg-risk groups to one condition (estimatedPrice closest to 0.5),
 *  drop malformed ids, and dedupe by (conditionId, resolver). */
function selectConditions(raw) {
  const balance = (c) =>
    typeof c.estimatedPrice === 'number' ? Math.abs(c.estimatedPrice - 0.5) : Infinity;

  const bestByGroup = new Map(); // negRisk group id -> condition
  const standalone = [];
  for (const c of raw) {
    if (!BYTES32_RE.test(c.id)) continue;
    if (c.conditionGroup?.negRisk) {
      const gid = c.conditionGroup.id;
      const cur = bestByGroup.get(gid);
      if (!cur || balance(c) < balance(cur)) bestByGroup.set(gid, c);
    } else {
      standalone.push(c);
    }
  }

  const seen = new Set();
  const out = [];
  for (const c of [...standalone, ...bestByGroup.values()]) {
    const key = `${c.id.toLowerCase()}:${c.resolver.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      conditionId: c.id,
      resolver: c.resolver.toLowerCase(),
      ...(c.shortName ? { shortName: c.shortName } : {}),
      ...(c.question ? { question: c.question } : {}),
      ...(c.similarMarketImage ? { imageUrl: c.similarMarketImage } : {}),
      ...(typeof c.estimatedPrice === 'number' ? { estimatedPrice: c.estimatedPrice } : {}),
      ...(typeof c.endTime === 'number' ? { endTime: c.endTime } : {}),
    });
  }
  // Stable order by endTime then id for deterministic, reviewable output.
  out.sort((a, b) => (a.endTime ?? 0) - (b.endTime ?? 0) || a.conditionId.localeCompare(b.conditionId));
  return out;
}

function uniquePoolId(base, taken) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-v${n}`;
  taken.add(id);
  return id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { api, file } = NETWORKS[args.network];
  const filePath = resolve(PKG_DIR, file);

  const existing = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!Array.isArray(existing) || existing.length === 0) {
    throw new Error(`${file}: expected a non-empty array of pools`);
  }
  const econ = existing[existing.length - 1];
  const takenIds = new Set(existing.map((p) => p.poolId));

  // First match day: explicit --start, else "tomorrow" in ET.
  let firstDay;
  if (args.start) {
    const [y, m, d] = args.start.split('-').map(Number);
    firstDay = etMidnight(y, m, d);
  } else {
    firstDay = etDayStart(Math.floor(Date.now() / 1000)) + DAY;
  }

  console.log(`network=${args.network} api=${api}`);
  console.log(`file=${file}  existing pools=${existing.length}`);

  const newPools = [];
  for (let i = 0; i < args.days; i++) {
    const dayStart = firstDay + i * DAY;
    const dayEnd = dayStart + DAY;
    const tag = ymd(dayStart);

    const raw = await fetchConditions(api, dayStart, dayEnd - 1);
    // The window filter is UTC-based on the server; re-bucket by ET day to be
    // exact (a condition near the boundary could land a day off).
    const onDay = raw.filter((c) => etDayStart(c.endTime) === dayStart);
    const conditions = selectConditions(onDay);

    const negRiskGroups = new Set(
      onDay.filter((c) => c.conditionGroup?.negRisk).map((c) => c.conditionGroup.id),
    );

    if (conditions.length < CELL_COUNT) {
      console.log(
        `  ${tag.label}: ${conditions.length} conditions (< ${CELL_COUNT}) — SKIPPED`,
      );
      continue;
    }

    const poolId = uniquePoolId(`world-cup-2026-${monAbbr[tag.m - 1]}${String(tag.d).padStart(2, '0')}`, takenIds);
    newPools.push({
      poolId,
      opensAt: dayStart - DAY,
      cutoff: dayStart,
      minCardPriceWei: econ.minCardPriceWei,
      referralBps: econ.referralBps,
      multiplierBps: econ.multiplierBps,
      conditions,
    });
    console.log(
      `  ${tag.label}: ${conditions.length} conditions (from ${raw.length} raw, ${negRiskGroups.size} neg-risk groups collapsed) -> ${poolId}`,
    );
  }

  if (newPools.length === 0) {
    console.log('No pools generated. Nothing written.');
    return;
  }

  const merged = [...existing, ...newPools];
  if (args.dryRun) {
    console.log(`\n[dry-run] would write ${newPools.length} new pool(s) to ${file}`);
    return;
  }
  writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`\nWrote ${newPools.length} new pool(s) to ${file} (total ${merged.length}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
