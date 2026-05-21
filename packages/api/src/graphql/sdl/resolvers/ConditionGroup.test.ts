import { describe, it, expect, vi, beforeEach } from 'vitest';

const helperMock = vi.hoisted(() => ({ loadRelation: vi.fn() }));
vi.mock('./relationHelpers', () => helperMock);

import { ConditionGroup } from './ConditionGroup';

type RelationFn = (
  parent: unknown,
  args?: unknown,
  ctx?: unknown
) => Promise<unknown>;

const callField = (
  field: 'category' | 'conditions' | 'title',
  parent: unknown,
  args: unknown,
  ctx: unknown
) => {
  const fn = (ConditionGroup as unknown as Record<string, RelationFn>)[field];
  return fn(parent, args, ctx);
};

beforeEach(() => {
  helperMock.loadRelation.mockReset();
});

describe('ConditionGroup.category', () => {
  it('uses ctx.loaders.categoryById when categoryId is set', async () => {
    const load = vi.fn().mockResolvedValue({ id: 4 });
    const result = await callField(
      'category',
      { id: 1, categoryId: 4 },
      undefined,
      { loaders: { categoryById: { load } } }
    );
    expect(load).toHaveBeenCalledWith(4);
    expect(result).toEqual({ id: 4 });
    expect(helperMock.loadRelation).not.toHaveBeenCalled();
  });

  it('returns null without invoking the loader when categoryId is null', async () => {
    const load = vi.fn();
    const result = await callField(
      'category',
      { id: 1, categoryId: null },
      undefined,
      { loaders: { categoryById: { load } } }
    );
    expect(result).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('returns the pre-loaded relation without touching loaders', async () => {
    const preloaded = { id: 4, name: 'Crypto' };
    const result = await callField(
      'category',
      { id: 1, categoryId: 4, category: preloaded },
      undefined,
      { loaders: { categoryById: { load: vi.fn() } } }
    );
    expect(result).toBe(preloaded);
    expect(helperMock.loadRelation).not.toHaveBeenCalled();
  });
});

describe('ConditionGroup.title', () => {
  it('mirrors `name` so older clients selecting `title` keep working', async () => {
    const result = await callField('title', { id: 1, name: 'Crypto' }, {}, {});
    expect(result).toBe('Crypto');
  });

  it('returns empty string when name is missing rather than null', async () => {
    const result = await callField('title', { id: 1, name: null }, {}, {});
    expect(result).toBe('');
  });
});

describe('ConditionGroup.conditions', () => {
  it('forces public:true and defaults orderBy to displayOrder asc', async () => {
    helperMock.loadRelation.mockResolvedValue([]);
    await callField('conditions', { id: 1 }, undefined, {});
    expect(helperMock.loadRelation).toHaveBeenCalledTimes(1);
    const opts = helperMock.loadRelation.mock.calls[0][2] as {
      args: { where: unknown; orderBy: unknown };
    };
    expect(opts.args.where).toEqual({ public: true });
    expect(opts.args.orderBy).toEqual({ displayOrder: 'asc' });
  });

  it('preserves caller orderBy if supplied, but still forces public:true', async () => {
    helperMock.loadRelation.mockResolvedValue([]);
    await callField(
      'conditions',
      { id: 1 },
      { orderBy: { endTime: 'desc' } },
      {}
    );
    const opts = helperMock.loadRelation.mock.calls[0][2] as {
      args: { where: unknown; orderBy: unknown };
    };
    expect(opts.args.where).toEqual({ public: true });
    expect(opts.args.orderBy).toEqual({ endTime: 'desc' });
  });

  it('returns the pre-loaded condition list directly when present', async () => {
    const preloaded = [{ id: 'c-1' }, { id: 'c-2' }];
    const result = await callField(
      'conditions',
      { id: 1, condition: preloaded },
      undefined,
      {}
    );
    expect(result).toBe(preloaded);
    expect(helperMock.loadRelation).not.toHaveBeenCalled();
  });
});
