import { describe, it, expect, beforeEach } from 'vitest';

import {
  toGlobalId,
  fromGlobalId,
  registerNodeType,
  resolveNode,
  resolveNodes,
  registeredNodeTypes,
  verifyFrozenNodeTypes,
  FROZEN_NODE_TYPES,
  __resetNodeRegistry,
  InvalidGlobalIdError,
} from './globalId';

beforeEach(() => {
  __resetNodeRegistry();
});

const register = (
  type: string,
  loader: (id: string, ctx: unknown) => Promise<unknown | null>
) => registerNodeType({ type, loader });

describe('toGlobalId / fromGlobalId', () => {
  it('round-trips a string domain id', () => {
    register('Trade', async (id) => ({ id }));
    const opaque = toGlobalId('Trade', '0xabc');
    expect(fromGlobalId(opaque)).toEqual({ type: 'Trade', id: '0xabc' });
  });

  it('round-trips a numeric domain id', () => {
    register('Condition', async (id) => ({ id }));
    const opaque = toGlobalId('Condition', 42);
    expect(fromGlobalId(opaque)).toEqual({ type: 'Condition', id: '42' });
  });

  it('produces a URL-safe base64 string', () => {
    register('Account', async (id) => ({ id }));
    const opaque = toGlobalId('Account', '0xDEADbeef');
    expect(opaque).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces different opaque ids for different types with the same domain id', () => {
    register('Prediction', async (id) => ({ id }));
    register('Position', async (id) => ({ id }));
    expect(toGlobalId('Prediction', 789)).not.toEqual(
      toGlobalId('Position', 789)
    );
  });

  it('throws InvalidGlobalIdError on malformed base64', () => {
    expect(() => fromGlobalId('not-valid-base64!!!')).toThrow(
      InvalidGlobalIdError
    );
  });

  it('throws InvalidGlobalIdError on a decoded value missing the colon', () => {
    const malformed = Buffer.from('NoColonHere', 'utf8').toString('base64url');
    expect(() => fromGlobalId(malformed)).toThrow(InvalidGlobalIdError);
  });

  it('throws InvalidGlobalIdError on empty type segment', () => {
    const malformed = Buffer.from(':42', 'utf8').toString('base64url');
    expect(() => fromGlobalId(malformed)).toThrow(InvalidGlobalIdError);
  });

  it('preserves colons inside the domain id segment', () => {
    register('Question', async (id) => ({ id }));
    const opaque = toGlobalId('Question', 'condition:123');
    expect(fromGlobalId(opaque)).toEqual({
      type: 'Question',
      id: 'condition:123',
    });
  });
});

describe('toGlobalId — registration enforcement', () => {
  it('throws InvalidGlobalIdError when the type is unregistered', () => {
    expect(() => toGlobalId('Trade', '0xabc')).toThrow(InvalidGlobalIdError);
  });

  it('throws InvalidGlobalIdError on empty type', () => {
    expect(() => toGlobalId('', '0xabc')).toThrow(InvalidGlobalIdError);
  });

  it('error message points the caller at registerNodeType', () => {
    try {
      toGlobalId('UnregisteredType', '42');
      throw new Error('expected toGlobalId to throw');
    } catch (e) {
      expect((e as Error).message).toContain('registerNodeType');
    }
  });
});

describe('node registry', () => {
  it('returns null when the registry is empty (id encoded against a since-removed type)', async () => {
    register('Trade', async (id) => ({ id }));
    const opaque = toGlobalId('Trade', '0xabc');
    __resetNodeRegistry();
    expect(await resolveNode(opaque, {})).toBeNull();
  });

  it('dispatches to a registered loader', async () => {
    register('Trade', async (id) => ({ id, hash: id }));
    const opaque = toGlobalId('Trade', '0xabc');
    expect(await resolveNode(opaque, {})).toMatchObject({
      id: '0xabc',
      hash: '0xabc',
    });
  });

  it('returns null when the loader returns null (entity not found)', async () => {
    register('Trade', async () => null);
    const opaque = toGlobalId('Trade', '0xmissing');
    expect(await resolveNode(opaque, {})).toBeNull();
  });

  it('returns null for an unregistered type without throwing', async () => {
    register('Trade', async (id) => ({ id }));
    const opaqueForOtherType = Buffer.from('Forecast:0xuid', 'utf8').toString(
      'base64url'
    );
    expect(await resolveNode(opaqueForOtherType, {})).toBeNull();
  });

  it('returns null for a malformed global id without throwing', async () => {
    expect(await resolveNode('not-valid', {})).toBeNull();
  });

  it('stamps __typename on the returned object', async () => {
    register('Trade', async (id) => ({ id, hash: id }));
    const opaque = toGlobalId('Trade', '0xabc');
    const result = (await resolveNode(opaque, {})) as { __typename?: string };
    expect(result?.__typename).toBe('Trade');
  });

  it('throws when registering the same type twice', () => {
    register('Trade', async (id) => ({ id }));
    expect(() => register('Trade', async (id) => ({ id }))).toThrow();
  });

  it('throws when registration has empty type', () => {
    expect(() => register('', async (id) => ({ id }))).toThrow();
  });
});

describe('resolveNodes (batch)', () => {
  it('returns nulls when the registry is empty', async () => {
    register('Trade', async (id) => ({ id }));
    const ids = [toGlobalId('Trade', '0xa'), toGlobalId('Trade', '0xb')];
    __resetNodeRegistry();
    expect(await resolveNodes(ids, {})).toEqual([null, null]);
  });

  it('preserves order in the result array', async () => {
    register('Trade', async (id) => ({ id, kind: 'trade' }));
    register('Condition', async (id) => ({ id, kind: 'condition' }));
    const ids = [
      toGlobalId('Condition', '5'),
      toGlobalId('Trade', '0xa'),
      toGlobalId('Condition', '7'),
    ];
    const result = await resolveNodes(ids, {});
    expect(result.map((n) => (n as { kind?: string } | null)?.kind)).toEqual([
      'condition',
      'trade',
      'condition',
    ]);
  });

  it('returns null in-place for malformed or unregistered ids', async () => {
    register('Trade', async (id) => ({ id }));
    const result = await resolveNodes(
      [
        toGlobalId('Trade', '0xa'),
        'malformed',
        Buffer.from('Forecast:0xb', 'utf8').toString('base64url'),
      ],
      {}
    );
    expect(result[0]).toBeTruthy();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeNull();
  });
});

describe('frozen node types — public-API stability', () => {
  it('PR 5 freezes collateral transfer, vault, and category node types', () => {
    expect(FROZEN_NODE_TYPES).toEqual([
      'CollateralTransfer',
      'Vault',
      'Category',
    ]);
    expect(registeredNodeTypes()).toHaveLength(0);
  });

  it('verifyFrozenNodeTypes passes when registry matches the frozen list', () => {
    for (const type of FROZEN_NODE_TYPES) {
      register(type, async (id) => ({ id }));
    }
    expect(verifyFrozenNodeTypes()).toEqual({ ok: true });
  });

  it('verifyFrozenNodeTypes flags registered types that are not in the frozen list', () => {
    register('Trade', async (id) => ({ id }));
    const result = verifyFrozenNodeTypes();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Trade');
      expect(result.message).toContain('FROZEN_NODE_TYPES');
    }
  });
});
