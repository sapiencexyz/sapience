import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude the standalone stress test script
    exclude: ['**/node_modules/**', '**/dist/**', 'src/graphql/__tests__/stress.test.ts'],
  },
});
