import { describe, expect, it } from 'vitest';
import {
  buildKeysetWhere,
  normalizeDirection,
  withCursorWhere,
} from './connection';

describe('normalizeDirection', () => {
  it('coerces ASC / DESC (any case) to lowercase Prisma directions', () => {
    expect(normalizeDirection('ASC', 'desc')).toBe('asc');
    expect(normalizeDirection('desc', 'asc')).toBe('desc');
    expect(normalizeDirection('Asc', 'desc')).toBe('asc');
  });

  it('falls back when the value is missing or unrecognized', () => {
    expect(normalizeDirection(undefined, 'desc')).toBe('desc');
    expect(normalizeDirection(null, 'asc')).toBe('asc');
    expect(normalizeDirection('garbage', 'desc')).toBe('desc');
  });
});

describe('buildKeysetWhere', () => {
  it('emits `lt` operators for DESC ordering', () => {
    const where = buildKeysetWhere<Record<string, unknown>>({
      orderField: 'createdAt',
      orderValue: new Date('2026-01-01'),
      idField: 'id',
      idValue: 7,
      direction: 'desc',
    });
    expect(where).toEqual({
      OR: [
        { createdAt: { lt: new Date('2026-01-01') } },
        {
          AND: [
            { createdAt: { equals: new Date('2026-01-01') } },
            { id: { lt: 7 } },
          ],
        },
      ],
    });
  });

  it('emits `gt` operators for ASC ordering', () => {
    const where = buildKeysetWhere<Record<string, unknown>>({
      orderField: 'name',
      orderValue: 'foo',
      idField: 'id',
      idValue: 'bar',
      direction: 'asc',
    });
    expect(where).toEqual({
      OR: [
        { name: { gt: 'foo' } },
        { AND: [{ name: { equals: 'foo' } }, { id: { gt: 'bar' } }] },
      ],
    });
  });
});

describe('withCursorWhere', () => {
  type W = Record<string, unknown>;

  it('returns the base when no cursor is provided', () => {
    const base: W = { chainId: 1 };
    expect(withCursorWhere<W>(base, null)).toBe(base);
  });

  it('AND-combines base and cursor fragments', () => {
    const base: W = { chainId: 1 };
    const cursor: W = { OR: [{ x: 1 }] };
    expect(withCursorWhere<W>(base, cursor)).toEqual({
      AND: [{ chainId: 1 }, { OR: [{ x: 1 }] }],
    });
  });
});
