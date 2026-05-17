import { describe, it, expect, beforeEach } from 'vitest';

import {
  __resetNodeRegistry,
  registerNodeType,
  toGlobalId,
} from '../../../relay/globalId';
import { node, nodes } from './node';

type ResolverFn<Args, Out> = (
  parent: unknown,
  args: Args,
  ctx: unknown,
  info: unknown
) => Promise<Out>;

const nodeFn = node as unknown as ResolverFn<{ id: string }, unknown>;
const nodesFn = nodes as unknown as ResolverFn<
  { ids: string[] },
  (unknown | null)[]
>;

const register = (
  type: string,
  loader: (id: string, ctx: unknown) => Promise<unknown | null>
) => registerNodeType({ type, loader });

beforeEach(() => {
  __resetNodeRegistry();
});

describe('node(id:) resolver', () => {
  it('returns null when the registry is empty', async () => {
    register('Trade', async (id) => ({ id }));
    const id = toGlobalId('Trade', '0xabc');
    __resetNodeRegistry();
    expect(await nodeFn(null, { id }, {}, null)).toBeNull();
  });

  it('returns null for a malformed global id', async () => {
    expect(await nodeFn(null, { id: 'not-valid' }, {}, null)).toBeNull();
  });

  it('dispatches to a registered loader and stamps __typename', async () => {
    register('Trade', async (id) => ({ id, hash: id }));
    const id = toGlobalId('Trade', '0xabc');
    const result = (await nodeFn(null, { id }, {}, null)) as {
      __typename: string;
      hash: string;
    };
    expect(result.__typename).toBe('Trade');
    expect(result.hash).toBe('0xabc');
  });

  it('returns null when the loader resolves to null (entity not found)', async () => {
    register('Trade', async () => null);
    const id = toGlobalId('Trade', '0xmissing');
    expect(await nodeFn(null, { id }, {}, null)).toBeNull();
  });

  it('forwards the GraphQL context to the loader', async () => {
    let seen: unknown = undefined;
    register('Trade', async (id, ctx) => {
      seen = ctx;
      return { id };
    });
    const id = toGlobalId('Trade', '0xabc');
    const ctx = { user: 'alice' };
    await nodeFn(null, { id }, ctx, null);
    expect(seen).toBe(ctx);
  });
});

describe('nodes(ids:) resolver', () => {
  it('returns an array of nulls when the registry is empty', async () => {
    register('Trade', async (id) => ({ id }));
    const ids = [toGlobalId('Trade', '0xa'), toGlobalId('Trade', '0xb')];
    __resetNodeRegistry();
    expect(await nodesFn(null, { ids }, {}, null)).toEqual([null, null]);
  });

  it('preserves input order across types', async () => {
    register('Trade', async (id) => ({ id, kind: 'trade' }));
    register('Condition', async (id) => ({ id, kind: 'condition' }));
    const ids = [
      toGlobalId('Condition', '5'),
      toGlobalId('Trade', '0xa'),
      toGlobalId('Condition', '7'),
    ];
    const result = await nodesFn(null, { ids }, {}, null);
    expect(result.map((n) => (n as { kind?: string } | null)?.kind)).toEqual([
      'condition',
      'trade',
      'condition',
    ]);
  });

  it('returns null in-place for malformed ids without throwing', async () => {
    register('Trade', async (id) => ({ id }));
    const result = await nodesFn(
      null,
      { ids: [toGlobalId('Trade', '0xa'), 'malformed'] },
      {},
      null
    );
    expect(result[0]).toBeTruthy();
    expect(result[1]).toBeNull();
  });

  it('handles an empty ids array', async () => {
    expect(await nodesFn(null, { ids: [] }, {}, null)).toEqual([]);
  });

  it('stamps __typename on each returned node', async () => {
    register('Trade', async (id) => ({ id }));
    register('Condition', async (id) => ({ id }));
    const result = await nodesFn(
      null,
      {
        ids: [toGlobalId('Trade', '0xa'), toGlobalId('Condition', '5')],
      },
      {},
      null
    );
    expect((result[0] as { __typename?: string }).__typename).toBe('Trade');
    expect((result[1] as { __typename?: string }).__typename).toBe('Condition');
  });
});
