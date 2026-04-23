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

// Order matters for INSERTs: parents before children.
// Each TRUNCATE uses CASCADE, so a later table referencing an earlier one will
// be wiped when the earlier one truncates — always list parents before children.
const TABLES: TableSpec[] = [
  { name: 'category', limit: 25, orderBy: 'id' },
  { name: 'app_user', limit: 100, orderBy: 'id' },
  {
    name: 'condition_group',
    limit: 50,
    orderBy: '"publicConditionCount" DESC, "maxEndTime" DESC NULLS LAST',
  },
  {
    name: 'condition',
    limit: 1000,
    orderBy: '"createdAt" DESC',
    where: `"conditionGroupId" IS NULL OR "conditionGroupId" IN (${ACTIVE_GROUP_SUBQUERY})`,
  },
  { name: 'prediction', limit: 500, orderBy: '"createdAt" DESC' },
  { name: 'position', limit: 500, orderBy: 'id DESC' },
  { name: 'PositionStatus', limit: 500, orderBy: 'id DESC' },
  // V2 escrow tables — parents of Pick, Position (V2), Claim, Close.
  { name: 'Picks', limit: 200, orderBy: '"createdAt" DESC' },
  { name: 'Pick', limit: 1000, orderBy: '"createdAt" DESC' },
  { name: 'Position', limit: 500, orderBy: 'id DESC' },
  { name: 'Claim', limit: 500, orderBy: 'id DESC' },
  { name: 'Close', limit: 500, orderBy: 'id DESC' },
  { name: 'attestation', limit: 200, orderBy: 'id DESC' },
  { name: 'attestation_score', limit: 500, orderBy: 'id DESC' },
  { name: 'secondary_trade', limit: 200, orderBy: 'id DESC' },
  { name: 'collateral_transfer', limit: 200, orderBy: 'id DESC' },
  { name: 'protocol_stats_snapshot', limit: 200, orderBy: 'id DESC' },
  { name: 'V2SettlementResult', limit: 200, orderBy: 'id DESC' },
  { name: 'limit_order', limit: 100, orderBy: 'id DESC' },
  { name: 'referral_code', limit: 100, orderBy: 'id' },
  { name: 'chat_message', limit: 100, orderBy: 'id DESC' },
  { name: 'vault_flow_event', limit: 100, orderBy: 'id DESC' },
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
