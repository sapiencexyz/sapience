import { describe, expect, it } from 'vitest';

import config from './codegen';

/**
 * The committed v2 SDK client types (`graphql.v2.ts`) are Prettier-formatted,
 * but raw graphql-codegen output is not — so the v2 output must run Prettier on
 * emit, else every `generate-types` produces whitespace-only diffs against the
 * committed file. The v1 `graphql.ts` is intentionally kept RAW (it is in
 * `.prettierignore`), so it must NOT carry a formatting hook.
 */
describe('frontend codegen config', () => {
  const v2 = config.generates['../sdk/types/graphql.v2.ts'];
  const v1 = config.generates['../sdk/types/graphql.ts'];

  const hookCommands = (target: unknown): string[] => {
    const hook = (target as { hooks?: { afterOneFileWrite?: unknown } })?.hooks
      ?.afterOneFileWrite;
    const arr = Array.isArray(hook) ? hook : hook ? [hook] : [];
    return arr.filter((c): c is string => typeof c === 'string');
  };

  it('formats the v2 output (graphql.v2.ts) with prettier on emit', () => {
    expect(hookCommands(v2).some((c) => c.includes('prettier'))).toBe(true);
  });

  it('does NOT format the v1 output (graphql.ts is in .prettierignore, kept raw)', () => {
    expect(hookCommands(v1).some((c) => c.includes('prettier'))).toBe(false);
    // ...and there must be no global hook that would also hit graphql.ts.
    expect(config.hooks?.afterAllFileWrite).toBeUndefined();
  });
});
