import { describe, it, expect } from 'vitest';
import { buildV2Schema } from './buildSchema';

/**
 * Smoke tests for the v2 stub schema. Asserts shape, not resolution —
 * executing queries via `graphql()` would cross the v1/v2/graphql-tools
 * module-resolution boundary and trip pnpm's "two graphql copies"
 * detection. Per-resolver behaviour is covered in
 * `relay/nodeRegistry.test.ts` and (in future PRs) per-entity unit
 * tests that import resolver functions directly.
 */
describe('v2 schema stub', () => {
  it('builds without errors', async () => {
    const schema = await buildV2Schema();
    expect(schema.getQueryType()?.name).toBe('Query');
  });

  it('declares the foundation surface', async () => {
    const schema = await buildV2Schema();
    const query = schema.getQueryType();
    const fields = query?.getFields();
    expect(fields).toBeDefined();
    expect(fields?.node).toBeDefined();
    expect(fields?.nodes).toBeDefined();
    expect(fields?._v2Health).toBeDefined();
  });

  it('declares the Node interface', async () => {
    const schema = await buildV2Schema();
    const node = schema.getType('Node');
    expect(node?.astNode?.kind).toBe('InterfaceTypeDefinition');
  });

  it('declares shared scalars (Address, BigInt, UnixSeconds, DateTimeISO)', async () => {
    const schema = await buildV2Schema();
    for (const name of ['Address', 'BigInt', 'UnixSeconds', 'DateTimeISO']) {
      expect(schema.getType(name)).toBeDefined();
    }
  });

  it('declares PageInfo with the canonical Relay shape', async () => {
    const schema = await buildV2Schema();
    const pageInfo = schema.getType('PageInfo');
    expect(pageInfo).toBeDefined();
    const fields = (
      pageInfo as { getFields: () => Record<string, unknown> }
    ).getFields();
    for (const name of [
      'hasNextPage',
      'hasPreviousPage',
      'startCursor',
      'endCursor',
    ]) {
      expect(fields[name]).toBeDefined();
    }
  });
});
