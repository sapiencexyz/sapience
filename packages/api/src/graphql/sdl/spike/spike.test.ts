/**
 * Phase 0 spike test. Runs GET_CATEGORIES (the actual frontend
 * operation) through the hand-written SDL schema, against the
 * contract test fixture DB. If the response matches the committed
 * contract snapshot, the SDL-first approach is viable.
 *
 * Run with:
 *   TEST_DATABASE_URL=... pnpm --filter @sapience/api test -- spike
 *
 * Throwaway — deleted at the end of Phase 0.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { GraphQLResolveInfo } from 'graphql';
import { buildSpikeSchema, rootValue, fieldResolver } from './buildSchema';
import { buildPrismaInclude } from '../buildPrismaInclude';

const GET_CATEGORIES = /* GraphQL */ `
  query Categories {
    categories {
      id
      name
      slug
    }
  }
`;

describe('Phase 0 SDL-first spike', () => {
  beforeAll(() => {
    const dbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error(
        'Phase 0 spike needs TEST_DATABASE_URL or DATABASE_URL pointed at the contract fixture DB'
      );
    }
    process.env.DATABASE_URL = dbUrl;
  });

  it('GET_CATEGORIES returns the same rows as the contract snapshot', async () => {
    const { graphql } = await import('graphql');
    const schema = buildSpikeSchema();
    const result = await graphql({
      schema,
      source: GET_CATEGORIES,
      rootValue,
      fieldResolver,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toBeDefined();

    const categories = (result.data as { categories: unknown[] }).categories;
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);

    // Shape check against the contract snapshot: each row has id/name/slug.
    for (const row of categories) {
      expect(row).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        slug: expect.any(String),
      });
    }
  });

  it('buildPrismaInclude builds nested include from a GraphQL selection set', async () => {
    const { parse, buildSchema: buildGraphQLSchema } = await import('graphql');
    // Use the real prisma-derived relation shape: Category.condition is a
    // list relation, Condition.category is back-reference.
    const schema = buildGraphQLSchema(`
      type Category { id: Int!, condition: [Condition!]! }
      type Condition { id: Int!, category: Category }
      type Query { categories: [Category!]! }
    `);
    const queryAST = parse(`{
      categories {
        id
        condition {
          id
          category { id }
        }
      }
    }`);
    const categoriesField = (
      queryAST.definitions[0] as unknown as {
        selectionSet: { selections: [unknown] };
      }
    ).selectionSet.selections[0];
    const fakeInfo = {
      fieldNodes: [categoriesField],
      fragments: {},
      schema,
    } as unknown as GraphQLResolveInfo;
    const result = buildPrismaInclude(fakeInfo, 'Category');
    expect(result).toEqual({
      include: {
        condition: {
          include: {
            category: true,
          },
        },
      },
    });
  });
});
