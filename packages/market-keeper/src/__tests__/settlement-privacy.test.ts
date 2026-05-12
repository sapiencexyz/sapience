import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptsDir = resolve(__dirname, '../../scripts');

describe('settlement condition discovery privacy', () => {
  // The API `conditions` resolver injects a default `public: { equals: true }`
  // filter whenever the caller does not already filter on `public`. So merely
  // *omitting* a public filter from the settlement discovery query is not
  // enough — the resolver re-adds it server-side and privated conditions stay
  // hidden. The query must carry its own `public` filter that explicitly
  // admits private conditions, so any privated condition that still has
  // engagement (open interest / attestations) remains a settlement candidate.
  it.each(['settle-polymarket.ts', 'settle-manual.ts'])(
    '%s discovery query explicitly admits private conditions',
    (scriptName) => {
      const source = readFileSync(resolve(scriptsDir, scriptName), 'utf8');

      expect(source).toMatch(/public:\s*\{\s*equals:\s*false\s*\}/);
    }
  );
});
