import { describe, it, expect, vi, beforeEach } from 'vitest';

const helperMock = vi.hoisted(() => ({ loadRelation: vi.fn() }));
vi.mock('./relationHelpers', () => helperMock);

import { Condition } from './Condition';

type RelationFn = (
  parent: unknown,
  args?: unknown,
  ctx?: unknown
) => Promise<unknown>;

const callField = (
  field: 'category' | 'conditionGroup' | 'attestations' | 'predictions',
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

describe('Condition.attestations', () => {
  it('uses attestationsByConditionId loader when args are absent', async () => {
    const load = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const result = await callField(
      'attestations',
      { id: '0xcond' },
      undefined,
      { loaders: { attestationsByConditionId: { load } } }
    );
    expect(load).toHaveBeenCalledWith('0xcond');
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    expect(helperMock.loadRelation).not.toHaveBeenCalled();
  });

  it('falls back to loadRelation when args contain a where clause', async () => {
    helperMock.loadRelation.mockResolvedValue([]);
    const load = vi.fn();
    await callField(
      'attestations',
      { id: '0xcond' },
      { where: { schemaId: '0xs' } },
      { loaders: { attestationsByConditionId: { load } } }
    );
    expect(load).not.toHaveBeenCalled();
    expect(helperMock.loadRelation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['take', { take: 5 }],
    ['skip', { skip: 5 }],
    ['orderBy', { orderBy: [{ time: 'desc' }] }],
    ['cursor', { cursor: { id: 1 } }],
    ['distinct', { distinct: ['conditionId'] }],
  ])('falls back when args contain %s', async (_label, args) => {
    helperMock.loadRelation.mockResolvedValue([]);
    const load = vi.fn();
    await callField('attestations', { id: '0xcond' }, args, {
      loaders: { attestationsByConditionId: { load } },
    });
    expect(load).not.toHaveBeenCalled();
    expect(helperMock.loadRelation).toHaveBeenCalledTimes(1);
  });

  it('returns the pre-loaded array directly without touching loaders', async () => {
    const preloaded = [{ id: 99 }];
    const load = vi.fn();
    const result = await callField(
      'attestations',
      { id: '0xcond', attestations: preloaded },
      undefined,
      { loaders: { attestationsByConditionId: { load } } }
    );
    expect(result).toBe(preloaded);
    expect(load).not.toHaveBeenCalled();
  });
});

// `Condition.predictions` used to return a bare `[Prediction!]!` array
// loaded via the `predictionsByConditionId` DataLoader. The PR6
// convergence rewrite changed it to return `PredictionConnection!` and
// delegate to the root `predictionsConnection` runner with `conditionId`
// parent scope. The connection-level behavior is covered by
// `crossStream.test.ts`.
