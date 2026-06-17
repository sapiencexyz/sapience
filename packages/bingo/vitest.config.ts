import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Runs before test modules load, so config.ts cleanEnv sees the dummy env.
    setupFiles: ['./server/__tests__/setup.ts'],
  },
});
