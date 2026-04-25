/**
 * Compare `protocolStats` between a local API and production.
 *
 * Fetches both endpoints, buckets by UTC day, picks the latest snapshot per
 * day for point-in-time + cumulative fields, sums intraday snapshots for
 * period-delta fields, and prints a side-by-side diff table.
 *
 * Handles both the new resolver schema (`periodPnL`/`periodVolume`, timestamps
 * returned as-is) and the old one (`dailyPnL`/`dailyVolume`, timestamps shifted
 * back by 86400). Auto-detects per endpoint.
 *
 * Usage:
 *   tsx src/scripts/compareProtocolStats.ts                # defaults
 *   LOCAL_URL=http://localhost:3001/graphql \
 *   PROD_URL=https://api.sapience.xyz/graphql \
 *   tsx src/scripts/compareProtocolStats.ts
 *
 *   --verbose   Print every field for every day, not just mismatches
 */

export {};

const LOCAL_URL = process.env.LOCAL_URL ?? 'http://localhost:3001/graphql';
const PROD_URL = process.env.PROD_URL ?? 'https://api.sapience.xyz/graphql';
const VERBOSE = process.argv.includes('--verbose');

// Fields are categorized so mismatches are labelled appropriately.
// - ON_CHAIN:   sourced from readContract at historical blocks. A mismatch here
//               means block resolution or on-chain reads diverged.
// - MIXED:      uses on-chain state + DB filter (DB indexer output feeds in).
// - DB_ONLY:    derived purely from indexed DB data. Drift here is expected
//               if the two DBs aren't in lock-step.
// - PERIOD:     daily delta — summed across the day on the local side.
type Category = 'ON_CHAIN' | 'MIXED' | 'DB_ONLY' | 'PERIOD';

const FIELDS: Array<{
  key: string;
  category: Category;
  agg: 'latest' | 'sum';
}> = [
  { key: 'vaultBalance', category: 'ON_CHAIN', agg: 'latest' },
  { key: 'vaultAvailableAssets', category: 'ON_CHAIN', agg: 'latest' },
  { key: 'escrowBalance', category: 'ON_CHAIN', agg: 'latest' },
  { key: 'vaultDeployed', category: 'MIXED', agg: 'latest' },
  { key: 'vaultAirdropGains', category: 'MIXED', agg: 'latest' },
  { key: 'cumulativeVolume', category: 'DB_ONLY', agg: 'latest' },
  { key: 'openInterest', category: 'DB_ONLY', agg: 'latest' },
  { key: 'vaultCumulativePnL', category: 'DB_ONLY', agg: 'latest' },
  { key: 'vaultPositionsWon', category: 'DB_ONLY', agg: 'latest' },
  { key: 'vaultPositionsLost', category: 'DB_ONLY', agg: 'latest' },
  { key: 'vaultDeposits', category: 'DB_ONLY', agg: 'latest' },
  { key: 'vaultWithdrawals', category: 'DB_ONLY', agg: 'latest' },
  { key: 'periodPnL', category: 'PERIOD', agg: 'sum' },
  { key: 'periodVolume', category: 'PERIOD', agg: 'sum' },
];

type Snapshot = Record<string, string | number> & { timestamp: number };

const QUERY_NEW = /* GraphQL */ `
  query ProtocolStats {
    protocolStats {
      timestamp
      vaultBalance
      vaultAvailableAssets
      escrowBalance
      vaultDeployed
      vaultAirdropGains
      cumulativeVolume
      openInterest
      vaultCumulativePnL
      vaultPositionsWon
      vaultPositionsLost
      vaultDeposits
      vaultWithdrawals
      periodPnL
      periodVolume
    }
  }
`;

const QUERY_OLD = /* GraphQL */ `
  query ProtocolStats {
    protocolStats {
      timestamp
      vaultBalance
      vaultAvailableAssets
      escrowBalance
      vaultDeployed
      vaultAirdropGains
      cumulativeVolume
      openInterest
      vaultCumulativePnL
      vaultPositionsWon
      vaultPositionsLost
      vaultDeposits
      vaultWithdrawals
      dailyPnL
      dailyVolume
    }
  }
`;

type FetchResult = {
  snapshots: Snapshot[];
  schema: 'new' | 'old';
};

async function gqlRequest<T>(url: string, query: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}: ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: T; errors?: unknown[] };
  if (body.errors && body.errors.length > 0) {
    throw new Error(
      `GraphQL errors from ${url}: ${JSON.stringify(body.errors)}`
    );
  }
  if (!body.data) throw new Error(`No data in response from ${url}`);
  return body.data;
}

async function fetchSnapshots(
  url: string,
  label: string
): Promise<FetchResult> {
  const attempt = async (query: string): Promise<Snapshot[]> => {
    const data = await gqlRequest<{ protocolStats: Snapshot[] }>(url, query);
    return data.protocolStats;
  };

  try {
    const snapshots = await attempt(QUERY_NEW);
    return { snapshots, schema: 'new' };
  } catch {
    console.log(
      `[${label}] new schema failed (periodPnL/periodVolume not found?), retrying with old schema...`
    );
    const snapshots = await attempt(QUERY_OLD);
    // Normalize field names only: rename dailyPnL/dailyVolume → periodPnL/periodVolume.
    // NO timestamp shift — both resolvers now return timestamps shifted back by
    // one interval (old: hardcoded -86400, new: -interval). At daily cadence
    // they already line up, so applying a manual shift here would off-by-one.
    for (const s of snapshots) {
      if ('dailyPnL' in s) {
        s.periodPnL = s.dailyPnL;
        delete s.dailyPnL;
      }
      if ('dailyVolume' in s) {
        s.periodVolume = s.dailyVolume;
        delete s.dailyVolume;
      }
    }
    return { snapshots, schema: 'old' };
  }
}

function utcDayKey(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function bucketByDay(snapshots: Snapshot[]): Map<string, Snapshot> {
  // For each day: keep the latest snapshot (by timestamp) for point-in-time +
  // cumulative fields, and sum the PERIOD fields across all snapshots in that day.
  const latestByDay = new Map<string, Snapshot>();
  const periodSums = new Map<
    string,
    { periodPnL: bigint; periodVolume: bigint }
  >();

  for (const s of snapshots) {
    const day = utcDayKey(Number(s.timestamp));
    const prev = latestByDay.get(day);
    if (!prev || Number(s.timestamp) > Number(prev.timestamp)) {
      latestByDay.set(day, s);
    }
    const sums = periodSums.get(day) ?? {
      periodPnL: 0n,
      periodVolume: 0n,
    };
    sums.periodPnL += BigInt(s.periodPnL ?? 0);
    sums.periodVolume += BigInt(s.periodVolume ?? 0);
    periodSums.set(day, sums);
  }

  // Overwrite PERIOD fields with the daily sum.
  for (const [day, latest] of latestByDay) {
    const sums = periodSums.get(day)!;
    latest.periodPnL = sums.periodPnL.toString();
    latest.periodVolume = sums.periodVolume.toString();
  }

  return latestByDay;
}

/**
 * Diagnostic: check whether the shifted prod timestamps actually line up with
 * any local timestamps. If the normalization is correct, every prod timestamp
 * should equal some local timestamp (because daily-cadence snapshots hit UTC
 * midnight which is also a 4h-cadence boundary). If no prod timestamps match,
 * the +86400 shift is wrong.
 */
function checkTimestampAlignment(local: Snapshot[], prod: Snapshot[]): void {
  console.log('── Timestamp alignment check ──');
  const localSet = new Set(local.map((s) => Number(s.timestamp)));
  const prodSet = new Set(prod.map((s) => Number(s.timestamp)));

  const common = [...prodSet].filter((t) => localSet.has(t));
  const prodOnly = [...prodSet].filter((t) => !localSet.has(t));
  const localOnly = [...localSet].filter((t) => !prodSet.has(t));

  console.log(
    `  Unique timestamps — local: ${localSet.size}, prod: ${prodSet.size}`
  );
  console.log(
    `  Exact matches (prod ts in local set):  ${common.length} / ${prodSet.size}`
  );
  console.log(`  Prod-only timestamps:                  ${prodOnly.length}`);
  console.log(`  Local-only timestamps:                 ${localOnly.length}`);

  // If some prod timestamps don't match any local timestamp, try common shifts
  // to see if a different normalization would have fit better.
  if (prodOnly.length > 0) {
    const candidates = [-86400, -3600, -60, 60, 3600, 86400];
    for (const shift of candidates) {
      const shiftedMatches = [...prodSet].filter((t) =>
        localSet.has(t + shift)
      ).length;
      if (shiftedMatches > common.length) {
        console.log(
          `  ⚠ If prod ts were shifted by ${shift >= 0 ? '+' : ''}${shift}s, matches would jump to ${shiftedMatches}/${prodSet.size}`
        );
      }
    }
  }

  // Show a sample of the prod timestamps that don't match, to eyeball.
  if (prodOnly.length > 0) {
    console.log(`  Sample prod-only timestamps (up to 5):`);
    for (const t of prodOnly.slice(0, 5)) {
      console.log(`    ${t}  (${new Date(t * 1000).toISOString()})`);
    }
  }

  // Also flag if local has intraday timestamps (sub-daily cadence) — that's
  // fine but worth noting so the user understands the "prod snapshots / local
  // snapshots" ratio.
  const localUtcMidnights = [...localSet].filter((t) => t % 86400 === 0).length;
  const localOffMidnight = localSet.size - localUtcMidnights;
  console.log(
    `  Local timestamps at UTC midnight: ${localUtcMidnights}; off-midnight: ${localOffMidnight}`
  );

  console.log('');
}

function asBigIntOrNumber(v: unknown): bigint | number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    // Some fields are int counts (vaultPositionsWon/Lost); others are bigint strings.
    if (/^-?\d+$/.test(v)) {
      // Prefer bigint to avoid precision loss on huge wei values.
      return BigInt(v);
    }
  }
  return BigInt(0);
}

function fmt(v: bigint | number): string {
  if (typeof v === 'number') return v.toString();
  // Format wei-like values as plain decimal (18 decimals) for readability.
  const abs = v < 0n ? -v : v;
  if (abs >= 10n ** 15n) {
    const sign = v < 0n ? '-' : '';
    const whole = abs / 10n ** 18n;
    const frac = abs % 10n ** 18n;
    const fracStr = frac
      .toString()
      .padStart(18, '0')
      .replace(/0+$/, '')
      .slice(0, 4);
    return `${sign}${whole.toString()}${fracStr ? '.' + fracStr : ''}`;
  }
  return v.toString();
}

function diff(a: bigint | number, b: bigint | number): bigint | number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return (
    (typeof a === 'number' ? BigInt(a) : a) -
    (typeof b === 'number' ? BigInt(b) : b)
  );
}

function isZero(v: bigint | number): boolean {
  return typeof v === 'number' ? v === 0 : v === 0n;
}

async function main() {
  console.log(`Fetching local:  ${LOCAL_URL}`);
  console.log(`Fetching prod:   ${PROD_URL}`);
  console.log('');

  const [local, prod] = await Promise.all([
    fetchSnapshots(LOCAL_URL, 'local'),
    fetchSnapshots(PROD_URL, 'prod'),
  ]);

  console.log(
    `Local: ${local.snapshots.length} snapshots (schema=${local.schema})`
  );
  console.log(
    `Prod:  ${prod.snapshots.length} snapshots (schema=${prod.schema})`
  );
  console.log('');

  checkTimestampAlignment(local.snapshots, prod.snapshots);

  const localByDay = bucketByDay(local.snapshots);
  const prodByDay = bucketByDay(prod.snapshots);

  const days = [...new Set([...localByDay.keys(), ...prodByDay.keys()])].sort();

  const mismatchCounts: Record<Category, number> = {
    ON_CHAIN: 0,
    MIXED: 0,
    DB_ONLY: 0,
    PERIOD: 0,
  };

  // Days present in only one side.
  const onlyLocal = days.filter((d) => localByDay.has(d) && !prodByDay.has(d));
  const onlyProd = days.filter((d) => !localByDay.has(d) && prodByDay.has(d));
  if (onlyLocal.length) {
    console.log(`Days only in LOCAL: ${onlyLocal.length}`);
    for (const d of onlyLocal.slice(0, 10)) console.log(`  ${d}`);
    if (onlyLocal.length > 10)
      console.log(`  ... and ${onlyLocal.length - 10} more`);
    console.log('');
  }
  if (onlyProd.length) {
    console.log(`Days only in PROD: ${onlyProd.length}`);
    for (const d of onlyProd.slice(0, 10)) console.log(`  ${d}`);
    if (onlyProd.length > 10)
      console.log(`  ... and ${onlyProd.length - 10} more`);
    console.log('');
  }

  const overlappingDays = days.filter(
    (d) => localByDay.has(d) && prodByDay.has(d)
  );

  console.log(`Overlapping days: ${overlappingDays.length}`);
  console.log('');
  console.log('Per-day comparison (mismatches only unless --verbose):');
  console.log('');

  const mismatchDays: string[] = [];

  for (const day of overlappingDays) {
    const l = localByDay.get(day)!;
    const p = prodByDay.get(day)!;

    const rows: Array<{
      key: string;
      category: Category;
      local: bigint | number;
      prod: bigint | number;
      delta: bigint | number;
    }> = [];

    for (const f of FIELDS) {
      const lv = asBigIntOrNumber(l[f.key]);
      const pv = asBigIntOrNumber(p[f.key]);
      const d = diff(lv, pv);
      if (!isZero(d)) {
        mismatchCounts[f.category]++;
        rows.push({
          key: f.key,
          category: f.category,
          local: lv,
          prod: pv,
          delta: d,
        });
      } else if (VERBOSE) {
        rows.push({
          key: f.key,
          category: f.category,
          local: lv,
          prod: pv,
          delta: d,
        });
      }
    }

    if (rows.length === 0) continue;
    mismatchDays.push(day);

    console.log(`── ${day} ──`);
    const pad = (s: string, n: number) => s.padEnd(n);
    console.log(
      `  ${pad('field', 24)} ${pad('category', 10)} ${pad('local', 24)} ${pad('prod', 24)} ${'Δ'}`
    );
    for (const r of rows) {
      const mark = isZero(r.delta) ? ' ' : '⚠';
      console.log(
        `  ${mark} ${pad(r.key, 22)} ${pad(r.category, 10)} ${pad(fmt(r.local), 24)} ${pad(fmt(r.prod), 24)} ${fmt(r.delta)}`
      );
    }
    console.log('');
  }

  console.log('────────────────────────────────────────────────────────────');
  console.log('Summary');
  console.log('────────────────────────────────────────────────────────────');
  console.log(`  Overlapping days:       ${overlappingDays.length}`);
  console.log(`  Days with any mismatch: ${mismatchDays.length}`);
  console.log(`  Mismatches by category:`);
  console.log(`    ON_CHAIN (critical):  ${mismatchCounts.ON_CHAIN}`);
  console.log(`    MIXED:                ${mismatchCounts.MIXED}`);
  console.log(`    DB_ONLY (expected):   ${mismatchCounts.DB_ONLY}`);
  console.log(`    PERIOD:               ${mismatchCounts.PERIOD}`);
  console.log('');
  if (mismatchCounts.ON_CHAIN === 0) {
    console.log(
      '✅ All on-chain-derived fields match. Block resolution + RPC reads look correct.'
    );
  } else {
    console.log(
      '❌ On-chain mismatches present — investigate block resolution or legacy contract selection.'
    );
  }
}

await main();
process.exit(0);
