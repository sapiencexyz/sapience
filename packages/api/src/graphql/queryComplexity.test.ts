import { describe, it, expect } from 'vitest';
import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLSchema,
  GraphQLNonNull,
  parse,
} from 'graphql';
import {
  getComplexity,
  simpleEstimator,
  fieldExtensionsEstimator,
  listMultiplierEstimator,
  fieldCostEstimator,
} from './queryComplexity.js';

// Create a minimal test schema
const ItemType: GraphQLObjectType = new GraphQLObjectType({
  name: 'Item',
  fields: () => ({
    id: { type: GraphQLString },
    name: { type: GraphQLString },
    value: { type: GraphQLInt },
    children: {
      type: new GraphQLList(ItemType),
      args: {
        take: { type: GraphQLInt },
        first: { type: GraphQLInt },
      },
    },
  }),
});

const AggregateType = new GraphQLObjectType({
  name: 'Aggregate',
  fields: {
    groupField: { type: GraphQLString },
    _count: {
      type: new GraphQLObjectType({
        name: 'Count',
        fields: {
          _all: { type: GraphQLInt },
          id: { type: GraphQLInt },
        },
      }),
    },
    _sum: {
      type: new GraphQLObjectType({
        name: 'Sum',
        fields: {
          value: { type: GraphQLInt },
        },
      }),
    },
    _avg: {
      type: new GraphQLObjectType({
        name: 'Avg',
        fields: {
          value: { type: GraphQLInt },
        },
      }),
    },
  },
});

const QueryType = new GraphQLObjectType({
  name: 'Query',
  fields: {
    item: {
      type: ItemType,
      args: { id: { type: new GraphQLNonNull(GraphQLString) } },
    },
    items: {
      type: new GraphQLList(ItemType),
      args: {
        take: { type: GraphQLInt },
        first: { type: GraphQLInt },
        limit: { type: GraphQLInt },
      },
    },
    scalar: { type: GraphQLString },
    aggregate: {
      type: new GraphQLList(AggregateType),
      args: { by: { type: new GraphQLList(GraphQLString) } },
    },
  },
});

const testSchema = new GraphQLSchema({ query: QueryType });

describe('queryComplexity', () => {
  describe('simpleEstimator', () => {
    it('assigns default complexity of 1 to each field', () => {
      const query = parse(`{ item(id: "1") { id name } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [simpleEstimator({ defaultComplexity: 1 })],
      });
      // item (1) + id (1) + name (1) = 3
      expect(complexity).toBe(3);
    });

    it('uses custom default complexity', () => {
      const query = parse(`{ scalar }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [simpleEstimator({ defaultComplexity: 5 })],
      });
      expect(complexity).toBe(5);
    });

    it('adds child complexity', () => {
      const query = parse(`{ item(id: "1") { id name value } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [simpleEstimator({ defaultComplexity: 1 })],
      });
      // item (1) + id (1) + name (1) + value (1) = 4
      expect(complexity).toBe(4);
    });
  });

  describe('listMultiplierEstimator', () => {
    it('multiplies list fields by defaultListSize', () => {
      const query = parse(`{ items { id } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [
          listMultiplierEstimator({ defaultListSize: 10 }),
          simpleEstimator({ defaultComplexity: 1 }),
        ],
      });
      // items: 1 + (1 * 10) = 11
      expect(complexity).toBe(11);
    });

    it('uses take argument for list size', () => {
      const query = parse(`{ items(take: 5) { id } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [
          listMultiplierEstimator({ defaultListSize: 10 }),
          simpleEstimator({ defaultComplexity: 1 }),
        ],
      });
      // items: 1 + (1 * 5) = 6
      expect(complexity).toBe(6);
    });

    it('uses first argument for list size', () => {
      const query = parse(`{ items(first: 3) { id } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [
          listMultiplierEstimator({ defaultListSize: 10 }),
          simpleEstimator({ defaultComplexity: 1 }),
        ],
      });
      // items: 1 + (1 * 3) = 4
      expect(complexity).toBe(4);
    });

    it('caps list size at maxListSize', () => {
      const query = parse(`{ items(take: 1000) { id } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [
          listMultiplierEstimator({ defaultListSize: 10, maxListSize: 100 }),
          simpleEstimator({ defaultComplexity: 1 }),
        ],
      });
      // items: 1 + (1 * 100) = 101 (capped at 100, not 1000)
      expect(complexity).toBe(101);
    });

    it('multiplies nested lists', () => {
      const query = parse(
        `{ items(take: 10) { id children(take: 5) { id } } }`
      );
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [
          listMultiplierEstimator({ defaultListSize: 10 }),
          simpleEstimator({ defaultComplexity: 1 }),
        ],
      });
      // children: 1 + (1 * 5) = 6
      // items: 1 + ((1 + 6) * 10) = 71
      expect(complexity).toBe(71);
    });

    it('does not multiply non-list fields', () => {
      const query = parse(`{ item(id: "1") { id } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [
          listMultiplierEstimator({ defaultListSize: 10 }),
          simpleEstimator({ defaultComplexity: 1 }),
        ],
      });
      // item (1) + id (1) = 2 (no multiplication)
      expect(complexity).toBe(2);
    });

    it('handles variables for take argument', () => {
      const query = parse(`query($n: Int) { items(take: $n) { id } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        variables: { n: 25 },
        estimators: [
          listMultiplierEstimator({ defaultListSize: 10 }),
          simpleEstimator({ defaultComplexity: 1 }),
        ],
      });
      // items: 1 + (1 * 25) = 26
      expect(complexity).toBe(26);
    });
  });

  describe('fieldCostEstimator', () => {
    it('assigns custom cost to specific fields by name', () => {
      const query = parse(`{ aggregate { _count { _all } } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [
          fieldCostEstimator({ _all: 10000 }),
          simpleEstimator({ defaultComplexity: 1 }),
        ],
      });
      // aggregate (list, but no estimator for lists here) + _count + _all (10000)
      expect(complexity).toBeGreaterThan(10000);
    });

    it('assigns custom cost using function matcher', () => {
      const query = parse(
        `{ aggregate { _count { _all id } _sum { value } } }`
      );
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [
          fieldCostEstimator((fieldName) => {
            if (fieldName === '_all') return 10000;
            if (fieldName.startsWith('_count')) return 5000;
            if (fieldName.startsWith('_sum')) return 5000;
            return undefined;
          }),
          simpleEstimator({ defaultComplexity: 1 }),
        ],
      });
      // Should include high costs for _all (10000) and _sum (5000)
      expect(complexity).toBeGreaterThan(15000);
    });

    it('falls through to next estimator when no match', () => {
      const query = parse(`{ scalar }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [
          fieldCostEstimator({ nonexistent: 10000 }),
          simpleEstimator({ defaultComplexity: 1 }),
        ],
      });
      expect(complexity).toBe(1);
    });
  });

  describe('fieldExtensionsEstimator', () => {
    it('falls through when no extensions', () => {
      const query = parse(`{ scalar }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [
          fieldExtensionsEstimator(),
          simpleEstimator({ defaultComplexity: 1 }),
        ],
      });
      expect(complexity).toBe(1);
    });
  });

  describe('combined estimators (production config)', () => {
    const productionEstimators = [
      fieldExtensionsEstimator(),
      fieldCostEstimator((fieldName) => {
        if (fieldName === '_all') return 10000;
        if (fieldName.startsWith('_count')) return 5000;
        if (fieldName.startsWith('_sum')) return 5000;
        if (fieldName.startsWith('_avg')) return 5000;
        return undefined;
      }),
      listMultiplierEstimator({ defaultListSize: 10, maxListSize: 100 }),
      simpleEstimator({ defaultComplexity: 1 }),
    ];

    it('simple queries have low complexity', () => {
      const query = parse(`{ scalar }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: productionEstimators,
      });
      expect(complexity).toBe(1);
    });

    it('paginated list queries have reasonable complexity', () => {
      const query = parse(`{ items(take: 20) { id name value } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: productionEstimators,
      });
      // items: 1 + ((1 + 1 + 1) * 20) = 61
      expect(complexity).toBe(61);
    });

    it('deeply nested list queries have high complexity', () => {
      const query = parse(`{
        items(take: 50) {
          id
          children(take: 50) {
            id
            children(take: 50) {
              id
            }
          }
        }
      }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: productionEstimators,
      });
      // Should be very high due to nested multiplication
      // level 3: 1 + (1 * 50) = 51
      // level 2: 1 + ((1 + 51) * 50) = 2601
      // level 1: 1 + ((1 + 2601) * 50) = 130101
      expect(complexity).toBeGreaterThan(100000);
    });

    it('aggregate queries with _all are blocked', () => {
      const query = parse(`{ aggregate { _count { _all } } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: productionEstimators,
      });
      // _all has cost of 10000
      expect(complexity).toBeGreaterThan(10000);
    });

    it('aggregate queries with multiple aggregates are blocked', () => {
      const query = parse(
        `{ aggregate { _count { id } _sum { value } _avg { value } } }`
      );
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: productionEstimators,
      });
      // Each aggregate field costs 5000
      expect(complexity).toBeGreaterThan(15000);
    });

    it('maxListSize prevents abuse via large take values', () => {
      const query = parse(`{ items(take: 10000) { id } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: productionEstimators,
      });
      // Capped at maxListSize=100: 1 + (1 * 100) = 101
      expect(complexity).toBe(101);
    });
  });

  describe('edge cases', () => {
    it('handles empty selection sets', () => {
      const query = parse(`{ __typename }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [simpleEstimator({ defaultComplexity: 1 })],
      });
      expect(complexity).toBe(1);
    });

    it('handles introspection queries', () => {
      const query = parse(`{ __schema { types { name } } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [simpleEstimator({ defaultComplexity: 1 })],
      });
      expect(complexity).toBeGreaterThan(0);
    });

    it('handles multiple root fields', () => {
      const query = parse(`{ scalar item(id: "1") { id } }`);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators: [simpleEstimator({ defaultComplexity: 1 })],
      });
      // scalar (1) + item (1) + id (1) = 3
      expect(complexity).toBe(3);
    });
  });
});
