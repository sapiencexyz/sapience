import { describe, it, expect, vi } from 'vitest';
import { createLoaders } from './loaders';

const makePrisma = (overrides: {
  picks?: { id: string }[];
  conditions?: { id: string; category?: { slug: string } | null }[];
  users?: { address?: string; id?: number }[];
  categories?: { id: number; name?: string }[];
  conditionGroups?: { id: number; name?: string }[];
  referralCodes?: { id: number }[];
  attestations?: { id: number; conditionId: string | null }[];
  predictions?: { id: number; conditionId: string }[];
}) => {
  const picksFindMany = vi.fn().mockResolvedValue(overrides.picks ?? []);
  const conditionFindMany = vi
    .fn()
    .mockResolvedValue(overrides.conditions ?? []);
  const userFindMany = vi.fn().mockResolvedValue(overrides.users ?? []);
  const categoryFindMany = vi
    .fn()
    .mockResolvedValue(overrides.categories ?? []);
  const conditionGroupFindMany = vi
    .fn()
    .mockResolvedValue(overrides.conditionGroups ?? []);
  const referralCodeFindMany = vi
    .fn()
    .mockResolvedValue(overrides.referralCodes ?? []);
  const attestationFindMany = vi
    .fn()
    .mockResolvedValue(overrides.attestations ?? []);
  const legacyPredictionFindMany = vi
    .fn()
    .mockResolvedValue(overrides.predictions ?? []);
  return {
    picksFindMany,
    conditionFindMany,
    userFindMany,
    categoryFindMany,
    conditionGroupFindMany,
    referralCodeFindMany,
    attestationFindMany,
    legacyPredictionFindMany,
    client: {
      picks: { findMany: picksFindMany },
      condition: { findMany: conditionFindMany },
      user: { findMany: userFindMany },
      category: { findMany: categoryFindMany },
      conditionGroup: { findMany: conditionGroupFindMany },
      referralCode: { findMany: referralCodeFindMany },
      attestation: { findMany: attestationFindMany },
      legacyPrediction: { findMany: legacyPredictionFindMany },
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

describe('createLoaders.categoryById', () => {
  it('batches concurrent loads into one findMany', async () => {
    const { categoryFindMany, client } = makePrisma({
      categories: [
        { id: 1, name: 'Crypto' },
        { id: 2, name: 'Sports' },
        { id: 3, name: 'Politics' },
      ],
    });
    const loaders = createLoaders(client);

    const [a, b, c] = await Promise.all([
      loaders.categoryById.load(1),
      loaders.categoryById.load(2),
      loaders.categoryById.load(3),
    ]);

    expect(categoryFindMany).toHaveBeenCalledTimes(1);
    expect(categoryFindMany.mock.calls[0][0].where.id.in.sort()).toEqual([
      1, 2, 3,
    ]);
    expect((a as { id: number }).id).toBe(1);
    expect((b as { id: number }).id).toBe(2);
    expect((c as { id: number }).id).toBe(3);
  });

  it('returns null for unmatched ids', async () => {
    const { client } = makePrisma({ categories: [{ id: 1 }] });
    const loaders = createLoaders(client);

    const [present, missing] = await Promise.all([
      loaders.categoryById.load(1),
      loaders.categoryById.load(999),
    ]);

    expect((present as { id: number }).id).toBe(1);
    expect(missing).toBeNull();
  });

  it('dedupes repeated loads of the same id', async () => {
    const { categoryFindMany, client } = makePrisma({
      categories: [{ id: 1 }],
    });
    const loaders = createLoaders(client);

    await Promise.all([
      loaders.categoryById.load(1),
      loaders.categoryById.load(1),
      loaders.categoryById.load(1),
    ]);

    expect(categoryFindMany).toHaveBeenCalledTimes(1);
    expect(categoryFindMany.mock.calls[0][0].where.id.in).toEqual([1]);
  });
});

describe('createLoaders.conditionGroupById', () => {
  it('batches concurrent loads into one findMany', async () => {
    const { conditionGroupFindMany, client } = makePrisma({
      conditionGroups: [
        { id: 10, name: 'Group A' },
        { id: 20, name: 'Group B' },
      ],
    });
    const loaders = createLoaders(client);

    const [a, b, missing] = await Promise.all([
      loaders.conditionGroupById.load(10),
      loaders.conditionGroupById.load(20),
      loaders.conditionGroupById.load(99),
    ]);

    expect(conditionGroupFindMany).toHaveBeenCalledTimes(1);
    expect((a as { id: number }).id).toBe(10);
    expect((b as { id: number }).id).toBe(20);
    expect(missing).toBeNull();
  });
});

describe('createLoaders.userById', () => {
  it('batches by integer pk (distinct from userByAddress)', async () => {
    const { userFindMany, client } = makePrisma({
      users: [
        { id: 1, address: '0xalice' },
        { id: 2, address: '0xbob' },
      ],
    });
    const loaders = createLoaders(client);

    const [a, b] = await Promise.all([
      loaders.userById.load(1),
      loaders.userById.load(2),
    ]);

    expect(userFindMany).toHaveBeenCalledTimes(1);
    expect(userFindMany.mock.calls[0][0].where.id.in.sort()).toEqual([1, 2]);
    expect((a as { id: number }).id).toBe(1);
    expect((b as { id: number }).id).toBe(2);
  });
});

describe('createLoaders.referralCodeById', () => {
  it('batches concurrent loads into one findMany', async () => {
    const { referralCodeFindMany, client } = makePrisma({
      referralCodes: [{ id: 5 }, { id: 7 }],
    });
    const loaders = createLoaders(client);

    const [a, b, missing] = await Promise.all([
      loaders.referralCodeById.load(5),
      loaders.referralCodeById.load(7),
      loaders.referralCodeById.load(999),
    ]);

    expect(referralCodeFindMany).toHaveBeenCalledTimes(1);
    expect((a as { id: number }).id).toBe(5);
    expect((b as { id: number }).id).toBe(7);
    expect(missing).toBeNull();
  });
});

describe('createLoaders.attestationsByConditionId', () => {
  it('groups one batched findMany result by conditionId', async () => {
    const { attestationFindMany, client } = makePrisma({
      attestations: [
        { id: 1, conditionId: '0xcond1' },
        { id: 2, conditionId: '0xcond1' },
        { id: 3, conditionId: '0xcond2' },
      ],
    });
    const loaders = createLoaders(client);

    const [forCond1, forCond2, forCond3] = await Promise.all([
      loaders.attestationsByConditionId.load('0xcond1'),
      loaders.attestationsByConditionId.load('0xcond2'),
      loaders.attestationsByConditionId.load('0xcond3'),
    ]);

    expect(attestationFindMany).toHaveBeenCalledTimes(1);
    expect(
      attestationFindMany.mock.calls[0][0].where.conditionId.in.sort()
    ).toEqual(['0xcond1', '0xcond2', '0xcond3']);
    expect(forCond1.map((a) => a.id)).toEqual([1, 2]);
    expect(forCond2.map((a) => a.id)).toEqual([3]);
    expect(forCond3).toEqual([]);
  });

  it('lowercases conditionIds for the lookup map', async () => {
    const { attestationFindMany, client } = makePrisma({
      attestations: [{ id: 1, conditionId: '0xcond1' }],
    });
    const loaders = createLoaders(client);

    const [mixed] = await Promise.all([
      loaders.attestationsByConditionId.load('0xCOND1'),
    ]);

    expect(attestationFindMany).toHaveBeenCalledTimes(1);
    expect(mixed.map((a) => a.id)).toEqual([1]);
  });
});

describe('createLoaders.predictionsByConditionId', () => {
  it('groups predictions by conditionId in a single findMany', async () => {
    const { legacyPredictionFindMany, client } = makePrisma({
      predictions: [
        { id: 100, conditionId: '0xcond1' },
        { id: 101, conditionId: '0xcond2' },
        { id: 102, conditionId: '0xcond1' },
      ],
    });
    const loaders = createLoaders(client);

    const [forCond1, forCond2] = await Promise.all([
      loaders.predictionsByConditionId.load('0xcond1'),
      loaders.predictionsByConditionId.load('0xcond2'),
    ]);

    expect(legacyPredictionFindMany).toHaveBeenCalledTimes(1);
    expect(forCond1.map((p) => p.id).sort()).toEqual([100, 102]);
    expect(forCond2.map((p) => p.id)).toEqual([101]);
  });
});
