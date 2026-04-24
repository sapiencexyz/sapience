/**
 * Vitest globalSetup for the contract suite.
 *
 * Runs once before any test file. Responsibilities:
 *   1. Require TEST_DATABASE_URL. Mirror it to DATABASE_URL so the
 *      production Prisma singleton resolves to the test database
 *      inside any process that loads it (including the test workers
 *      vitest spawns).
 *   2. Run `prisma migrate deploy` against that DB and, if present,
 *      load the `test/fixtures/contract.sql` fixture.
 *
 * Unlike the pre-SDL-first setup, this does NOT spawn a subprocess
 * ApolloServer. Contract tests now build the schema in-process via
 * `testApollo.ts`'s lazy Apollo singleton.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(thisDir, '..', '..');
const fixturePath = resolve(apiRoot, 'test', 'fixtures', 'contract.sql');

/** Escape hatch so schema-disk-only tests can run without the DB. */
const SKIP_SERVER = process.env.CONTRACT_SKIP_SERVER === '1';

export const setup = async (): Promise<void> => {
  if (SKIP_SERVER) {
    console.warn(
      '[contract setup] CONTRACT_SKIP_SERVER=1 — skipping DB setup.'
    );
    return;
  }

  const testUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      'Contract tests require TEST_DATABASE_URL — see packages/api/test-env.example. ' +
        'To run only schema-disk tests without a DB, set CONTRACT_SKIP_SERVER=1.'
    );
  }
  process.env.DATABASE_URL = testUrl;

  try {
    execSync('pnpm exec prisma migrate deploy', {
      cwd: apiRoot,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: testUrl },
    });
  } catch (err) {
    throw new Error(
      `prisma migrate deploy failed against ${testUrl}: ${(err as Error).message}. ` +
        `Ensure the test database exists and TEST_DATABASE_URL points at it.`
    );
  }

  if (existsSync(fixturePath)) {
    try {
      execSync(`psql "${testUrl}" -v ON_ERROR_STOP=1 -f "${fixturePath}"`, {
        stdio: 'inherit',
      });
    } catch (err) {
      console.warn(
        `[contract setup] failed to load ${fixturePath}: ${(err as Error).message}`
      );
    }
  } else {
    console.warn(
      `[contract setup] fixture ${fixturePath} missing — run \`pnpm --filter @sapience/api run snapshot-test-db\` to generate it.`
    );
  }
};

export const teardown = async (): Promise<void> => {
  // Nothing to tear down — no server process, and the Prisma client
  // in-process gets cleaned up when the test worker exits.
};
