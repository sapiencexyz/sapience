import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**', '**/*.spec.ts'],
    css: false,
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
      // constants/chain is not in the SDK export map but is imported by app code
      '@sapience/sdk/constants/chain': path.resolve(
        __dirname,
        '../sdk/constants/chain.ts'
      ),
    },
  },
});
