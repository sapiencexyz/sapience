import { describe, it, expect, vi } from 'vitest';
import { createLoaders } from './loaders';

const makePrisma = (overrides: {
  picks?: { id: string }[];
  conditions?: { id: string; category?: { slug: string } | null }[];
  users?: { address: string }[];
}) => {
  const picksFindMany = vi.fn().mockResolvedValue(overrides.picks ?? []);
  const conditionFindMany = vi
    .fn()
    .mockResolvedValue(overrides.conditions ?? []);
  const userFindMany = vi.fn().mockResolvedValue(overrides.users ?? []);
  return {
    picksFindMany,
    conditionFindMany,
    userFindMany,
    client: {
      picks: { findMany: picksFindMany },
      condition: { findMany: conditionFindMany },
      user: { findMany: userFindMany },
    } as unknown as Parameters<typeof createLoaders>[0],
  };
};

describe('createLoaders.pickConfigById', () => {
  it('batches concurrent loads of distinct ids into one query', async () => {
    const { picksFindMany, client } = makePrisma({
      picks: [{ id: '0xa' }, { id: '0xb' }, { id: '0xc' }],
    });
    const loaders = createLoaders(client);

    const [a, b, c] = await Promise.all([
      loaders.pickConfigById.load('0xA'),
      loaders.pickConfigById.load('0xB'),
      loaders.pickConfigById.load('0xC'),
    ]);

    expect(picksFindMany).toHaveBeenCalledTimes(1);
    expect(picksFindMany.mock.calls[0][0].where.id.in).toEqual([
      '0xa',
      '0xb',
      '0xc',
    ]);
    expect((a as { id: string }).id).toBe('0xa');
    expect((b as { id: string }).id).toBe('0xb');
    expect((c as { id: string }).id).toBe('0xc');
  });

  it('returns null for missing ids while populating ones that exist', async () => {
    const { client } = makePrisma({ picks: [{ id: '0xa' }] });
    const loaders = createLoaders(client);

    const [a, missing] = await Promise.all([
      loaders.pickConfigById.load('0xa'),
      loaders.pickConfigById.load('0xmissing'),
    ]);

    expect((a as { id: string }).id).toBe('0xa');
    expect(missing).toBeNull();
  });

  it('dedupes a repeated load for the same id within a request', async () => {
    const { picksFindMany, client } = makePrisma({ picks: [{ id: '0xa' }] });
    const loaders = createLoaders(client);

    const [first, second] = await Promise.all([
      loaders.pickConfigById.load('0xa'),
      loaders.pickConfigById.load('0xa'),
    ]);

    expect(picksFindMany).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });
});

describe('createLoaders.conditionById', () => {
  it('includes category and batches mixed-case ids into one findMany', async () => {
    const { conditionFindMany, client } = makePrisma({
      conditions: [
        { id: '0xcond1', category: { slug: 'crypto' } },
        { id: '0xcond2', category: null },
      ],
    });
    const loaders = createLoaders(client);

    const [a, b] = await Promise.all([
      loaders.conditionById.load('0xCOND1'),
      loaders.conditionById.load('0xCond2'),
    ]);

    expect(conditionFindMany).toHaveBeenCalledTimes(1);
    expect(conditionFindMany.mock.calls[0][0].include).toEqual({
      category: true,
    });
    // Lowercased + deduped before being passed to Prisma.
    expect(conditionFindMany.mock.calls[0][0].where.id.in.sort()).toEqual([
      '0xcond1',
      '0xcond2',
    ]);
    expect((a as { id: string }).id).toBe('0xcond1');
    expect((b as { id: string }).id).toBe('0xcond2');
  });

  it('returns null for unmatched ids', async () => {
    const { client } = makePrisma({ conditions: [{ id: '0xcond1' }] });
    const loaders = createLoaders(client);

    const [present, missing] = await Promise.all([
      loaders.conditionById.load('0xcond1'),
      loaders.conditionById.load('0xmissing'),
    ]);

    expect((present as { id: string }).id).toBe('0xcond1');
    expect(missing).toBeNull();
  });
});

describe('createLoaders.userByAddress', () => {
  it('batches and lowercases addresses', async () => {
    const { userFindMany, client } = makePrisma({
      users: [{ address: '0xalice' }, { address: '0xbob' }],
    });
    const loaders = createLoaders(client);

    const [alice, bob, missing] = await Promise.all([
      loaders.userByAddress.load('0xALICE'),
      loaders.userByAddress.load('0xBob'),
      loaders.userByAddress.load('0xnobody'),
    ]);

    expect(userFindMany).toHaveBeenCalledTimes(1);
    expect(userFindMany.mock.calls[0][0].where.address.in.sort()).toEqual([
      '0xalice',
      '0xbob',
      '0xnobody',
    ]);
    expect((alice as { address: string }).address).toBe('0xalice');
    expect((bob as { address: string }).address).toBe('0xbob');
    expect(missing).toBeNull();
  });
});
