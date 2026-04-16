import { defineConfig } from 'vitest/config';
import { config as loadDotEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Load `.env` so TEST_DATABASE_URL (and any other developer-specific env)
// is visible both here and inside the globalSetup script, which runs in
// the main Vitest process before any test worker forks.
loadDotEnv({ path: fileURLToPath(new URL('./.env', import.meta.url)) });

const testDbUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://localhost:5432/sapience_test';

/**
 * Contract-test config. Tests run against a long-lived Apollo server spawned
 * by `globalSetup.ts` via tsx. The test process itself only needs to make
 * HTTP calls, so no decorator/metadata tooling is required here.
 */
export default defineConfig({
  test: {
    include: ['test/contract/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globalSetup: ['./test/helpers/globalSetup.ts'],
    env: {
      DATABASE_URL: testDbUrl,
      TEST_DATABASE_URL: testDbUrl,
    },
    testTimeout: 30_000,
    hookTimeout: 90_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
