import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Stress test is manually run only (needs a live API)
      'src/graphql/__tests__/stress.test.ts',
      // Contract suite runs via `pnpm test:contract` — it needs the long-
      // lived Apollo subprocess set up by test/helpers/globalSetup.ts and
      // a pre-loaded Postgres fixture. Running it from the default vitest
      // config fails with "TEST_GRAPHQL_URL is not set".
      'test/contract/**',
    ],
  },
});
