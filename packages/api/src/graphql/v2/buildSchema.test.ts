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
  });

  it('declares the full v2 root query surface', async () => {
    const schema = await buildV2Schema();
    const query = schema.getQueryType()?.getFields() ?? {};
    const expected = [
      'account',
      'accounts',
      'vault',
      'vaults',
      'category',
      'categories',
      'trade',
      'trades',
      'condition',
      'conditions',
      'conditionGroup',
      'conditionGroups',
      'pickConfiguration',
      'pickConfigurations',
      'prediction',
      'predictions',
      'position',
      'positions',
      'claim',
      'claims',
      'close',
      'closes',
      'collateralTransfer',
      'collateralTransfers',
      'activity',
      'leaderboard',
      'protocol',
      'tags',
    ];
    for (const name of expected) {
      expect(query[name], `Query.${name} should be declared`).toBeDefined();
    }
  });

  it('declares the AddressEntity interface', async () => {
    const schema = await buildV2Schema();
    const iface = schema.getType('AddressEntity');
    expect(iface?.astNode?.kind).toBe('InterfaceTypeDefinition');
  });

  it('declares Account implementing Node & AddressEntity with account / accounts on Query', async () => {
    const schema = await buildV2Schema();
    const account = schema.getType('Account');
    expect(account).toBeDefined();
    const ifaces = (
      account as unknown as { getInterfaces: () => { name: string }[] }
    ).getInterfaces();
    expect(ifaces.map((i) => i.name).sort()).toEqual(['AddressEntity', 'Node']);
    const query = schema.getQueryType()?.getFields();
    expect(query?.account).toBeDefined();
    expect(query?.accounts).toBeDefined();
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

  it('types Prediction.predictorToken / counterpartyToken as nullable (a prediction may lack a pickConfiguration)', async () => {
    const schema = await buildV2Schema();
    const fields = (
      schema.getType('Prediction') as {
        getFields: () => Record<string, { type: { toString(): string } }>;
      }
    ).getFields();
    // The token values come from the nullable pickConfiguration relation,
    // so the field must be nullable — `Address`, not `Address!`. (toString()
    // avoids cross-graphql-copy instanceof checks.)
    expect(fields.predictorToken.type.toString()).toBe('Address');
    expect(fields.counterpartyToken.type.toString()).toBe('Address');
  });
});
