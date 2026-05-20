import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SDK chain helpers reference `process.env.NEXT_PUBLIC_*` for Next.js; in Vite
// we shim `process.env` to an empty object so those lookups return undefined
// and fall through to the defaults.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    'process.env': '{}',
    global: 'globalThis',
  },
});
