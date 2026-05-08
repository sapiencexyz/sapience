import { describe, it, expect, vi } from 'vitest';

const helperMock = vi.hoisted(() => ({ loadRelation: vi.fn() }));

vi.mock('./relationHelpers', () => helperMock);

import { Condition } from './Condition';

type RelationFn = (parent: unknown, args?: unknown) => Promise<unknown>;

// Each Condition relation is a thin pass-through to loadRelation. These
// tests verify the wiring (parentModel, prismaRelationName, parentWhere)
// is correct — that's what catches a typo like
// `prismaRelationName: 'predcitions'` the moment it lands.
describe.each([
  { field: 'category', prismaRelationName: 'category' },
  { field: 'conditionGroup', prismaRelationName: 'conditionGroup' },
  { field: 'attestations', prismaRelationName: 'attestations' },
  { field: 'predictions', prismaRelationName: 'predictions' },
] as const)('Condition.$field', ({ field, prismaRelationName }) => {
  it(`forwards parent.id and args to loadRelation with prismaRelationName=${prismaRelationName}`, async () => {
    helperMock.loadRelation.mockClear();
    helperMock.loadRelation.mockResolvedValue('result');

    const fn = (Condition as unknown as Record<string, RelationFn>)[field];
    const args = { take: 10 };
    const result = await fn({ id: 'c-1' }, args);

    expect(result).toBe('result');
    expect(helperMock.loadRelation).toHaveBeenCalledWith(
      { id: 'c-1' },
      prismaRelationName,
      {
        parentModel: 'condition',
        parentWhere: { id: 'c-1' },
        prismaRelationName,
        args,
      }
    );
  });
});
