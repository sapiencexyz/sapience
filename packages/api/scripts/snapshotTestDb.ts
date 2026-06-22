/**
 * Pulls a curated subset of rows from SNAPSHOT_DATABASE_URL (read-only)
 * into `packages/api/test/fixtures/contract.sql`. Loaded by the contract
 * test suite's globalSetup on every run.
 *
 * Uses `pg_dump` for schema-less data dumps, then filters to a subset of
 * tables + row counts via intermediate temp tables. The generated SQL is
 * data-only — the contract suite runs `prisma migrate deploy` first, so
 * the fixture just populates existing tables.
 *
 * Usage:
 *   SNAPSHOT_DATABASE_URL=postgresql://... pnpm --filter @sapience/api run snapshot-test-db
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const apiRoot = resolve(dirname(thisFile), '..');
const fixturePath = resolve(apiRoot, 'test', 'fixtures', 'contract.sql');

interface TableSpec {
  name: string;
  limit: number;
  orderBy?: string;
  /** Optional SQL fragment injected as a WHERE clause (without the `WHERE` keyword). */
  where?: string;
}

// Active groups captured first, then the conditions belonging to them. The
// `questions` resolver's Part A only surfaces groups with
// `publicConditionCount > 0`, and its Prisma include returns nested conditions
// filtered by `public = true` — so the captured conditions must overlap with
// the captured groups for the contract snapshot to exercise nested shapes.
const ACTIVE_GROUP_SUBQUERY = `
  SELECT id FROM condition_group
  WHERE "publicConditionCount" > 0
  ORDER BY "publicConditionCount" DESC, "maxEndTime" DESC NULLS LAST
  LIMIT 50
`.trim();

// The condition capture's predicate/order/limit, shared with the
// CAPTURED_CONDITION_SUBQUERY below so child tables (attestation) scope to
// exactly the condition rows that land in the fixture.
const CONDITION_WHERE = `"conditionGroupId" IS NULL OR "conditionGroupId" IN (${ACTIVE_GROUP_SUBQUERY})`;
const CONDITION_LIMIT = 1000;

// Mirrors the `condition` table spec (same WHERE / ORDER BY / LIMIT). The
// fixture loads with FK triggers disabled (session_replication_role =
// 'replica'), so a child row pointing at a non-captured condition would load
// silently with a dangling FK; this subquery keeps those rows out.
const CAPTURED_CONDITION_SUBQUERY = `
  SELECT id FROM condition
  WHERE ${CONDITION_WHERE}
  ORDER BY "createdAt" DESC
  LIMIT ${CONDITION_LIMIT}
`.trim();

// Order matters: each TRUNCATE uses CASCADE, which wipes any table with an FK
// pointing at the target — regardless of ON DELETE action. So parents (FK
// targets) must come before their children, otherwise a later parent's
// TRUNCATE wipes a previously-loaded child.
//
// Current FK graph (child → parent):
//   condition_group      → category
//   condition            → category, condition_group
//   attestation          → condition
//   attestation_score    → attestation
//   Pick                 → Picks, condition
//   Position (V2)        → Picks
//   Prediction (V2)      → Picks
//   prediction (V1)      → condition, limit_order, position
//   app_user             → referral_code, app_user (self)
const TABLES: TableSpec[] = [
  // Roots: no FK parents among tables we capture.
  { name: 'category', limit: 25, orderBy: 'id' },
  { name: 'referral_code', limit: 100, orderBy: 'id' },
  { name: 'app_user', limit: 100, orderBy: 'id' },
  { name: 'limit_order', limit: 100, orderBy: 'id DESC' },
  { name: 'position', limit: 500, orderBy: 'id DESC' },
  { name: 'Picks', limit: 200, orderBy: '"createdAt" DESC' },
  { name: 'Claim', limit: 500, orderBy: 'id DESC' },
  { name: 'Close', limit: 500, orderBy: 'id DESC' },
  { name: 'secondary_trade', limit: 200, orderBy: 'id DESC' },
  { name: 'protocol_stats_snapshot', limit: 200, orderBy: 'id DESC' },
  { name: 'chat_message', limit: 100, orderBy: 'id DESC' },
  { name: 'vault_flow_event', limit: 100, orderBy: 'id DESC' },
  // Read by accountAccuracy / accuracyLeaderboard / accountAccuracyRank.
  { name: 'attester_market_tw_error', limit: 500, orderBy: 'id DESC' },
  // Not currently present on staging — script skips if the table is absent.
  { name: 'PositionStatus', limit: 500, orderBy: 'id DESC' },
  { name: 'V2SettlementResult', limit: 200, orderBy: 'id DESC' },

  // Depends on category.
  {
    name: 'condition_group',
    limit: 50,
    orderBy: '"publicConditionCount" DESC, "maxEndTime" DESC NULLS LAST',
  },

  // Depends on condition_group, category.
  {
    name: 'condition',
    limit: CONDITION_LIMIT,
    orderBy: '"createdAt" DESC',
    where: CONDITION_WHERE,
  },

  // Depend on Picks, condition, position, limit_order.
  {
    name: 'attestation',
    limit: 200,
    orderBy: 'id DESC',
    // Keep NULL conditionId rows (a legal domain state — the column is
    // nullable) but drop rows whose conditionId points outside the captured
    // condition set, which would otherwise load as dangling FKs.
    where: `"conditionId" IS NULL OR "conditionId" IN (${CAPTURED_CONDITION_SUBQUERY})`,
  },
  { name: 'Pick', limit: 1000, orderBy: '"createdAt" DESC' },
  { name: 'Position', limit: 500, orderBy: 'id DESC' },
  { name: 'Prediction', limit: 500, orderBy: '"onChainCreatedAt" DESC' },
  { name: 'prediction', limit: 500, orderBy: '"createdAt" DESC' },

  // Depends on attestation.
  { name: 'attestation_score', limit: 500, orderBy: 'id DESC' },
];

const requireCmd = (cmd: string): void => {
  const r = spawnSync('which', [cmd]);
  if (r.status !== 0) {
    throw new Error(
      `${cmd} not found on PATH. Install Postgres client tools (e.g. \`brew install libpq && brew link --force libpq\`).`
    );
  }
};

/**
 * Runs a single SELECT against the source DB and returns COPY-formatted
 * rows (plus the column list) so the fixture can reload via COPY.
 */
const tableExists = (url: string, table: string): boolean => {
  try {
    const out = execFileSync(
      'psql',
      [
        url,
        '-Atq',
        '-c',
        `SELECT to_regclass('public."${table}"') IS NOT NULL`,
      ],
      { maxBuffer: 1024 * 1024 }
    )
      .toString()
      .trim();
    return out === 't';
  } catch {
    return false;
  }
};

const dumpTable = (url: string, spec: TableSpec): string => {
  if (!tableExists(url, spec.name)) {
    process.stdout.write(`     (skipped: ${spec.name} not present on source)\n`);
    return `-- ${spec.name}: not present on source DB, skipped\n`;
  }
  const where = spec.where ? ` WHERE ${spec.where}` : '';
  const order = spec.orderBy ? ` ORDER BY ${spec.orderBy}` : '';
  const result = execFileSync(
    'psql',
    [
      url,
      '-Atq',
      '-c',
      `\\copy (SELECT * FROM "${spec.name}"${where}${order} LIMIT ${spec.limit}) TO STDOUT WITH CSV HEADER`,
    ],
    { maxBuffer: 256 * 1024 * 1024 }
  ).toString();

  const [headerLine, ...dataLines] = result.split('\n').filter(Boolean);
  if (!headerLine) return `-- ${spec.name}: no rows\n`;
  const columns = headerLine
    .split(',')
    .map((c) => `"${c.replace(/^"|"$/g, '')}"`)
    .join(', ');

  const lines: string[] = [
    `-- ${spec.name}: ${dataLines.length} rows`,
    `TRUNCATE TABLE "${spec.name}" RESTART IDENTITY CASCADE;`,
    `COPY "${spec.name}" (${columns}) FROM STDIN WITH (FORMAT CSV, QUOTE '"', ESCAPE '"');`,
    ...dataLines,
    '\\.',
    '',
  ];
  return lines.join('\n');
};

const main = async (): Promise<void> => {
  const url = process.env.SNAPSHOT_DATABASE_URL;
  if (!url) {
    throw new Error(
      'SNAPSHOT_DATABASE_URL is not set. Point it at a read-only populated DB to pull fixture data.'
    );
  }
  requireCmd('psql');

  const header = [
    '-- Generated by scripts/snapshotTestDb.ts',
    '-- DO NOT EDIT BY HAND. Regenerate with:',
    '--   SNAPSHOT_DATABASE_URL=... pnpm --filter @sapience/api run snapshot-test-db',
    '',
    'BEGIN;',
    "SET session_replication_role = 'replica';",
    '',
  ].join('\n');

  const body: string[] = [];
  for (const spec of TABLES) {
    process.stdout.write(`  -> ${spec.name}\n`);
    body.push(dumpTable(url, spec));
  }

  const footer = [
    "SET session_replication_role = 'origin';",
    'COMMIT;',
    '',
  ].join('\n');

  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, header + body.join('\n') + footer);
  process.stdout.write(`\nWrote ${fixturePath}\n`);
};

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
