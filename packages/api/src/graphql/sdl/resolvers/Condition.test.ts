import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registeredNodeTypes } from '../../relay/globalId';

const helperMock = vi.hoisted(() => ({ loadRelation: vi.fn() }));
vi.mock('./relationHelpers', () => helperMock);

import { Condition } from './Condition';

type RelationFn = (
  parent: unknown,
  args?: unknown,
  ctx?: unknown
) => Promise<unknown>;

const callField = (
  field: 'category' | 'conditionGroup',
  parent: unknown,
  args: unknown,
  ctx: unknown
) => {
  const fn = (Condition as unknown as Record<string, RelationFn>)[field];
  return fn(parent, args, ctx);
};

beforeEach(() => {
  helperMock.loadRelation.mockReset();
});

describe('Condition identity', () => {
  it('Condition is no longer a Node type — id returns the natural on-chain conditionId', async () => {
    expect(registeredNodeTypes()).not.toContain('Condition');

    const conditionId = await (
      Condition.conditionId as (parent: unknown) => string
    )({ id: 'condition-1' });

    expect(conditionId).toBe('condition-1');
  });
});

describe('Condition.category', () => {
  it('returns the pre-loaded relation without calling loaders or loadRelation', async () => {
    const preloaded = { id: 7, name: 'Crypto' };
    const result = await callField(
      'category',
      { id: 'c-1', categoryId: 7, category: preloaded },
      undefined,
      { loaders: { categoryById: { load: vi.fn() } } }
    );
    expect(result).toBe(preloaded);
    expect(helperMock.loadRelation).not.toHaveBeenCalled();
  });

  it('returns null when categoryId is null without invoking the loader', async () => {
    const load = vi.fn();
    const result = await callField(
      'category',
      { id: 'c-1', categoryId: null },
      undefined,
      { loaders: { categoryById: { load } } }
    );
    expect(result).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('uses ctx.loaders.categoryById when present', async () => {
    const load = vi.fn().mockResolvedValue({ id: 7, name: 'Crypto' });
    const result = await callField(
      'category',
      { id: 'c-1', categoryId: 7 },
      undefined,
      { loaders: { categoryById: { load } } }
    );
    expect(load).toHaveBeenCalledWith(7);
    expect(result).toEqual({ id: 7, name: 'Crypto' });
    expect(helperMock.loadRelation).not.toHaveBeenCalled();
  });

  it('falls back to loadRelation when no loaders are on context', async () => {
    helperMock.loadRelation.mockResolvedValue({ id: 7 });
    await callField(
      'category',
      { id: 'c-1', categoryId: 7 },
      { foo: 'bar' },
      {}
    );
    expect(helperMock.loadRelation).toHaveBeenCalledTimes(1);
    expect(helperMock.loadRelation.mock.calls[0][1]).toBe('category');
  });
});

describe('Condition.conditionGroup', () => {
  it('uses ctx.loaders.conditionGroupById when conditionGroupId is set', async () => {
    const load = vi.fn().mockResolvedValue({ id: 11 });
    const result = await callField(
      'conditionGroup',
      { id: 'c-1', conditionGroupId: 11 },
      undefined,
      { loaders: { conditionGroupById: { load } } }
    );
    expect(load).toHaveBeenCalledWith(11);
    expect(result).toEqual({ id: 11 });
  });

  it('returns null when conditionGroupId is missing', async () => {
    const load = vi.fn();
    const result = await callField(
      'conditionGroup',
      { id: 'c-1', conditionGroupId: null },
      undefined,
      { loaders: { conditionGroupById: { load } } }
    );
    expect(result).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});

// `Condition.predictionsConnection` (Relay-shaped) is the only prediction
// surface on Condition; its behavior (parent-scope merge into `filter`) is
// covered by `crossStream.test.ts`.
