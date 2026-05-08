import { describe, it, expect } from 'vitest';
import { executeOperation } from '../helpers/testApollo';

interface DeprecatedField {
  name: string;
  isDeprecated: boolean;
  deprecationReason: string | null;
}

interface QueryFieldsResult {
  __type: {
    fields: DeprecatedField[];
  };
}

// Why this exists: an `@deprecated` directive without a reason is a
// silent footgun — clients see "deprecated" with no migration path and
// nothing tells the API maintainer what the replacement was. The
// SDL-first stack makes it easy to slip in a bare @deprecated, so this
// test is the guard against that.
describe('schema deprecation hygiene', () => {
  it('every deprecated Query field carries a non-empty deprecationReason', async () => {
    const result = await executeOperation<QueryFieldsResult>(`
      {
        __type(name: "Query") {
          fields(includeDeprecated: true) {
            name
            isDeprecated
            deprecationReason
          }
        }
      }
    `);
    expect(result.errors).toBeUndefined();
    const deprecated = result.data!.__type.fields.filter(
      (f) => f.isDeprecated
    );
    // Sanity: we expect SOME deprecations (the migration is in flight).
    expect(deprecated.length).toBeGreaterThan(0);

    const missingReason = deprecated.filter(
      (f) => !f.deprecationReason || f.deprecationReason.trim().length === 0
    );
    expect(
      missingReason,
      `Every deprecated Query field needs a reason. Missing on: ${missingReason
        .map((f) => f.name)
        .join(', ')}`
    ).toEqual([]);
  });

  it('deprecation reasons explain the migration path (mention "Use" or "Unused")', async () => {
    // Soft check — we want reasons to point at *what to do*, not just
    // "deprecated". Either:
    //   - "Use \`xxxPage\` instead" (replacement exists), or
    //   - "Unused; will be removed" (no replacement; consumers can drop)
    const result = await executeOperation<QueryFieldsResult>(`
      {
        __type(name: "Query") {
          fields(includeDeprecated: true) {
            name
            isDeprecated
            deprecationReason
          }
        }
      }
    `);
    const deprecated = result.data!.__type.fields.filter(
      (f) => f.isDeprecated && f.deprecationReason
    );
    const lowQuality = deprecated.filter((f) => {
      const r = f.deprecationReason!.toLowerCase();
      return !(r.includes('use ') || r.includes('unused'));
    });
    expect(
      lowQuality,
      `Deprecation reasons should hint at the migration path. Vague reasons on: ${lowQuality
        .map((f) => `${f.name}: "${f.deprecationReason}"`)
        .join('; ')}`
    ).toEqual([]);
  });
});
