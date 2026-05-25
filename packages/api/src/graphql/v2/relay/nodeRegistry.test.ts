import { describe, it, expect, beforeEach } from 'vitest';

import {
  FROZEN_NODE_TYPES_V2,
  __resetNodeRegistryV2,
  fromGlobalIdV2,
  registerNodeTypeV2,
  resolveNodeV2,
  resolveNodesV2,
  toGlobalIdV2,
  tryFromGlobalIdV2,
  verifyFrozenNodeTypesV2,
} from './nodeRegistry';

beforeEach(() => {
  __resetNodeRegistryV2();
});

describe('v2 nodeRegistry encoding', () => {
  it('round-trips type + id through encode/decode', () => {
    registerNodeTypeV2({ type: 'Trade', loader: async () => null });
    const encoded = toGlobalIdV2('Trade', '0xabc');
    expect(fromGlobalIdV2(encoded)).toEqual({ type: 'Trade', id: '0xabc' });
  });

  it('refuses to encode for an unregistered type', () => {
    expect(() => toGlobalIdV2('Unknown', '1')).toThrow(/not registered/);
  });

  it('coerces numeric ids to strings', () => {
    registerNodeTypeV2({ type: 'Category', loader: async () => null });
    const encoded = toGlobalIdV2('Category', 42);
    expect(fromGlobalIdV2(encoded)).toEqual({ type: 'Category', id: '42' });
  });

  it('tryFromGlobalIdV2 returns null on garbage', () => {
    expect(tryFromGlobalIdV2('not-base64')).toBeNull();
  });
});

describe('v2 nodeRegistry dispatch', () => {
  it('dispatches to the registered loader and stamps __typename', async () => {
    registerNodeTypeV2({
      type: 'Trade',
      loader: async (id) => ({ id, hash: id }),
    });
    const encoded = toGlobalIdV2('Trade', '0xabc');
    const result = (await resolveNodeV2(encoded, {})) as {
      __typename: string;
      hash: string;
    };
    expect(result.__typename).toBe('Trade');
    expect(result.hash).toBe('0xabc');
  });

  it('returns null when the loader resolves to null', async () => {
    registerNodeTypeV2({ type: 'Trade', loader: async () => null });
    const encoded = toGlobalIdV2('Trade', '0xmissing');
    expect(await resolveNodeV2(encoded, {})).toBeNull();
  });

  it('resolveNodesV2 preserves input order across types', async () => {
    registerNodeTypeV2({
      type: 'Trade',
      loader: async (id) => ({ id, kind: 'trade' }),
    });
    registerNodeTypeV2({
      type: 'Account',
      loader: async (id) => ({ id, kind: 'account' }),
    });
    const ids = [
      toGlobalIdV2('Account', '0xaaa'),
      toGlobalIdV2('Trade', '0xbbb'),
      toGlobalIdV2('Account', '0xccc'),
    ];
    const result = await resolveNodesV2(ids, {});
    expect(result.map((n) => (n as { kind?: string } | null)?.kind)).toEqual([
      'account',
      'trade',
      'account',
    ]);
  });

  it('refuses duplicate registration', () => {
    registerNodeTypeV2({ type: 'Trade', loader: async () => null });
    expect(() =>
      registerNodeTypeV2({ type: 'Trade', loader: async () => null })
    ).toThrow(/already registered/);
  });
});

describe('v2 nodeRegistry frozen list', () => {
  it('contains the type names registered by each landed phase', () => {
    // Append the name of each new Node-implementing type as its phase
    // lands. Removals require a deprecation cycle — see ./nodeRegistry.ts.
    expect(FROZEN_NODE_TYPES_V2).toEqual([
      'Account',
      'Vault',
      'Category',
      'Forecast',
      'Trade',
      'Condition',
      'ConditionGroup',
      'PickConfiguration',
      'Prediction',
      'Position',
    ]);
  });

  it('verifyFrozenNodeTypesV2 reports mismatch against an empty registry', () => {
    // beforeEach resets the runtime registry; phase modules re-register
    // via module import in their own test files.
    const result = verifyFrozenNodeTypesV2();
    expect(result.ok).toBe(false);
  });
});
