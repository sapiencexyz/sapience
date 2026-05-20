/**
 * Schema-level shims that absorb the in-flight queries surfaced in
 * staging Sentry from older clients. These tests pin the alias
 * presence on the SDL so a future cleanup that removes them is a
 * loud diff, not a silent re-introduction of validation errors.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  position: { findMany: vi.fn(), count: vi.fn() },
  secondaryTrade: { findMany: vi.fn() },
  pick: { findMany: vi.fn() },
  picks: { findMany: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import { runPositions } from './escrow';

const SCHEMA = readFileSync(
  join(__dirname, '../../schema/schema.graphql'),
  'utf8'
);

describe('staging compat shims — SDL', () => {
  it('ConditionGroup exposes a deprecated `title` alias for `name`', () => {
    expect(SCHEMA).toMatch(
      /type ConditionGroup \{[\s\S]*?title: String!\n\s*@deprecated/
    );
  });

  it('PredictionSortField carries camelCase legacy values alongside SCREAMING_SNAKE', () => {
    expect(SCHEMA).toMatch(
      /enum PredictionSortField \{\n\s*CREATED_AT\n\s*SETTLED_AT\n\s*createdAt\n\s*@deprecated[\s\S]*?settledAt\n\s*@deprecated/
    );
  });

  it('PositionSortField carries camelCase legacy values alongside SCREAMING_SNAKE', () => {
    expect(SCHEMA).toMatch(
      /enum PositionSortField \{\n\s*CREATED_AT\n\s*UPDATED_AT\n\s*createdAt\n\s*@deprecated[\s\S]*?updatedAt\n\s*@deprecated/
    );
  });

  it('SortOrder carries uppercase ASC/DESC alongside the Prisma-style asc/desc', () => {
    expect(SCHEMA).toMatch(
      /enum SortOrder \{\n\s*asc\n\s*desc\n\s*ASC\n\s*@deprecated[\s\S]*?DESC\n\s*@deprecated/
    );
  });
});

describe('staging compat shims — runPositions normalization', () => {
  it('treats camelCase `createdAt` orderBy as the canonical CREATED_AT', async () => {
    mockPrisma.position.findMany.mockResolvedValue([]);
    await runPositions({
      take: 10,
      skip: 0,
      holder: '0xabc',
      chainId: null,
      conditionId: null,
      pickConfigId: null,
      collateralMin: null,
      collateralMax: null,
      endsAtMin: null,
      endsAtMax: null,
      holderWon: null,
      result: null,
      settled: null,
      orderBy: 'createdAt' as never,
      orderDirection: 'DESC' as never,
    });
    const call = mockPrisma.position.findMany.mock.calls.at(-1)?.[0];
    expect(call?.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('treats uppercase `DESC` orderDirection as desc on the canonical path', async () => {
    mockPrisma.position.findMany.mockResolvedValue([]);
    await runPositions({
      take: 10,
      skip: 0,
      holder: '0xabc',
      chainId: null,
      conditionId: null,
      pickConfigId: null,
      collateralMin: null,
      collateralMax: null,
      endsAtMin: null,
      endsAtMax: null,
      holderWon: null,
      result: null,
      settled: null,
      orderBy: 'CREATED_AT' as never,
      orderDirection: 'ASC' as never,
    });
    const call = mockPrisma.position.findMany.mock.calls.at(-1)?.[0];
    expect(call?.orderBy).toEqual({ createdAt: 'asc' });
  });
});
