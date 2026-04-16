import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(thisDir, '..', '..');
const fixturePath = resolve(apiRoot, 'test', 'fixtures', 'contract.sql');
const testServerEntry = resolve(apiRoot, 'test', 'helpers', 'startTestServer.ts');

let server: ChildProcess | undefined;

const waitForReady = (proc: ChildProcess): Promise<{ url: string; port: number }> =>
  new Promise((resolvePromise, rejectPromise) => {
    const stderrChunks: string[] = [];
    const timeout = setTimeout(() => {
      rejectPromise(
        new Error(
          `startTestServer did not become ready within 60s. stderr:\n${stderrChunks.join('')}`
        )
      );
    }, 60_000);

    let buffer = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const nl = buffer.indexOf('\n');
      if (nl === -1) return;
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      try {
        const parsed = JSON.parse(line) as { testServerReady?: boolean; url?: string; port?: number };
        if (parsed.testServerReady && parsed.url && parsed.port) {
          clearTimeout(timeout);
          resolvePromise({ url: parsed.url, port: parsed.port });
        }
      } catch {
        process.stdout.write(`[test-server] ${line}\n`);
      }
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      const str = chunk.toString();
      stderrChunks.push(str);
      process.stderr.write(`[test-server] ${str}`);
    });
    proc.on('exit', (code) => {
      clearTimeout(timeout);
      rejectPromise(new Error(`startTestServer exited early with code ${code}`));
    });
  });

/**
 * Vitest globalSetup for the contract suite.
 *
 * 1. Requires TEST_DATABASE_URL. Mirrors it to DATABASE_URL so the production
 *    Prisma singleton resolves to the test database.
 * 2. Runs `prisma migrate deploy` and loads `test/fixtures/contract.sql` when
 *    present.
 * 3. Spawns `test/helpers/startTestServer.ts` via `tsx` (same runtime that
 *    boots the prod server, so decorator metadata works exactly as prod).
 *    Exposes the running URL via `TEST_GRAPHQL_URL` for tests.
 */
const SKIP_SERVER = process.env.CONTRACT_SKIP_SERVER === '1';

export const setup = async (): Promise<void> => {
  const testUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  if (SKIP_SERVER) {
    console.warn('[contract setup] CONTRACT_SKIP_SERVER=1 — skipping DB + server.');
    return;
  }

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

  server = spawn('pnpm', ['exec', 'tsx', testServerEntry], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const { url } = await waitForReady(server);
  process.env.TEST_GRAPHQL_URL = url;
};

export const teardown = async (): Promise<void> => {
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 250));
    if (!server.killed) server.kill('SIGKILL');
  }
};
