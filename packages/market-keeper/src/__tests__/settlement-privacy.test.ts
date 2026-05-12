import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptsDir = resolve(__dirname, '../../scripts');

describe('settlement condition discovery privacy', () => {
  it.each(['settle-polymarket.ts', 'settle-manual.ts'])(
    '%s includes private conditions in settlement discovery',
    (scriptName) => {
      const source = readFileSync(resolve(scriptsDir, scriptName), 'utf8');

      expect(source).not.toMatch(/public:\s*\{\s*equals:\s*true\s*\}/);
    }
  );
});
