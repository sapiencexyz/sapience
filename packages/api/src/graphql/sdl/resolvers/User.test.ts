import { describe, it, expect, vi, beforeEach } from 'vitest';

const helperMock = vi.hoisted(() => ({ loadRelation: vi.fn() }));
vi.mock('./relationHelpers', () => helperMock);

import { User } from './User';

type RelationFn = (
  parent: unknown,
  args?: unknown,
  ctx?: unknown
) => Promise<unknown>;

const callField = (
  field: 'referrals' | 'referredBy' | 'referredByCode',
  parent: unknown,
  args: unknown,
  ctx: unknown
) => {
  const fn = (User as unknown as Record<string, RelationFn>)[field];
  return fn(parent, args, ctx);
};

beforeEach(() => {
  helperMock.loadRelation.mockReset();
});

describe('User.referredBy', () => {
  it('uses ctx.loaders.userById when referredById is set', async () => {
    const load = vi.fn().mockResolvedValue({ id: 42, address: '0xref' });
    const result = await callField(
      'referredBy',
      { id: 1, referredById: 42 },
      undefined,
      { loaders: { userById: { load } } }
    );
    expect(load).toHaveBeenCalledWith(42);
    expect(result).toEqual({ id: 42, address: '0xref' });
    expect(helperMock.loadRelation).not.toHaveBeenCalled();
  });

  it('returns null when referredById is null without invoking the loader', async () => {
    const load = vi.fn();
    const result = await callField(
      'referredBy',
      { id: 1, referredById: null },
      undefined,
      { loaders: { userById: { load } } }
    );
    expect(result).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('returns the pre-loaded value when present', async () => {
    const preloaded = { id: 42 };
    const result = await callField(
      'referredBy',
      { id: 1, referredById: 42, referredBy: preloaded },
      undefined,
      { loaders: { userById: { load: vi.fn() } } }
    );
    expect(result).toBe(preloaded);
  });
});

describe('User.referredByCode', () => {
  it('uses ctx.loaders.referralCodeById when referredByCodeId is set', async () => {
    const load = vi.fn().mockResolvedValue({ id: 7 });
    const result = await callField(
      'referredByCode',
      { id: 1, referredByCodeId: 7 },
      undefined,
      { loaders: { referralCodeById: { load } } }
    );
    expect(load).toHaveBeenCalledWith(7);
    expect(result).toEqual({ id: 7 });
  });

  it('returns null when referredByCodeId is null', async () => {
    const load = vi.fn();
    const result = await callField(
      'referredByCode',
      { id: 1, referredByCodeId: null },
      undefined,
      { loaders: { referralCodeById: { load } } }
    );
    expect(result).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});

describe('User.referrals (list, no loader)', () => {
  it('forwards to loadRelation (no batchable loader for paginated list)', async () => {
    helperMock.loadRelation.mockResolvedValue([]);
    await callField('referrals', { id: 1 }, { take: 10 }, {});
    expect(helperMock.loadRelation).toHaveBeenCalledTimes(1);
    expect(helperMock.loadRelation.mock.calls[0][1]).toBe('referrals');
  });
});
