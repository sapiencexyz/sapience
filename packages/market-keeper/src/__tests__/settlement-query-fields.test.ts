import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageRoot = resolve(__dirname, '../..');

function readScript(relativePath: string): string {
  return readFileSync(resolve(packageRoot, relativePath), 'utf8');
}

describe('settlement GraphQL filters', () => {
  it.each([
    'scripts/settle-manual.ts',
    'scripts/settle-polymarket.ts',
    'scripts/settle-pyth.ts',
  ])('uses ConditionFilter.marketAddress in %s', (scriptPath) => {
    const source = readScript(scriptPath);

    expect(source).toContain('marketAddress');
    expect(source).not.toContain('contractAddress');
  });
});
