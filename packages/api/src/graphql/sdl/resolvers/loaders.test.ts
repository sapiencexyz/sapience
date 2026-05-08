import { describe, it, expect, vi } from 'vitest';
import { createLoaders } from './loaders';

describe('createLoaders.pickConfigById', () => {
  const makePrisma = (rows: { id: string }[]) => {
    const findMany = vi.fn().mockResolvedValue(rows);
    return {
      findMany,
      client: { picks: { findMany } } as unknown as Parameters<
        typeof createLoaders
      >[0],
    };
  };

  it('batches concurrent loads of distinct ids into one query', async () => {
    const { findMany, client } = makePrisma([
      { id: '0xa' },
      { id: '0xb' },
      { id: '0xc' },
    ]);
    const loaders = createLoaders(client);

    const [a, b, c] = await Promise.all([
      loaders.pickConfigById.load('0xA'),
      loaders.pickConfigById.load('0xB'),
      loaders.pickConfigById.load('0xC'),
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where.id.in).toEqual([
      '0xa',
      '0xb',
      '0xc',
    ]);
    expect((a as { id: string }).id).toBe('0xa');
    expect((b as { id: string }).id).toBe('0xb');
    expect((c as { id: string }).id).toBe('0xc');
  });

  it('returns null for missing ids while populating ones that exist', async () => {
    const { client } = makePrisma([{ id: '0xa' }]);
    const loaders = createLoaders(client);

    const [a, missing] = await Promise.all([
      loaders.pickConfigById.load('0xa'),
      loaders.pickConfigById.load('0xmissing'),
    ]);

    expect((a as { id: string }).id).toBe('0xa');
    expect(missing).toBeNull();
  });

  it('dedupes a repeated load for the same id within a request', async () => {
    const { findMany, client } = makePrisma([{ id: '0xa' }]);
    const loaders = createLoaders(client);

    const [first, second] = await Promise.all([
      loaders.pickConfigById.load('0xa'),
      loaders.pickConfigById.load('0xa'),
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });
});
