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
  createComplexityEstimators,
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

const QuestionType = new GraphQLObjectType({
  name: 'Question',
  fields: {
    questionType: { type: GraphQLString },
    predictionCount: { type: GraphQLInt },
  },
});

// `*Page` envelope shape — matches the SDL contract for paginated
// queries: items: [X!]!, hasMore, totalCount. The estimator must
// recognize the envelope and apply the `take` from the parent field.
const ItemsPageType = new GraphQLObjectType({
  name: 'ItemsPage',
  fields: {
    items: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ItemType))),
    },
    hasMore: { type: new GraphQLNonNull(GraphQLString) },
    totalCount: { type: GraphQLInt },
  },
});

// `*Connection` envelope shape — Relay-style sibling of `*Page` with two
// inner list fields (`nodes`, `edges`) and `first` instead of `take`.
const PageInfoType = new GraphQLObjectType({
  name: 'PageInfo',
  fields: {
    hasNextPage: { type: new GraphQLNonNull(GraphQLString) },
    hasPreviousPage: { type: new GraphQLNonNull(GraphQLString) },
    startCursor: { type: GraphQLString },
    endCursor: { type: GraphQLString },
  },
});

const ItemEdgeType = new GraphQLObjectType({
  name: 'ItemEdge',
  fields: {
    node: { type: new GraphQLNonNull(ItemType) },
    cursor: { type: new GraphQLNonNull(GraphQLString) },
  },
});

const ItemsConnectionType = new GraphQLObjectType({
  name: 'ItemsConnection',
  fields: {
    nodes: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ItemType))),
    },
    edges: {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(ItemEdgeType))
      ),
    },
    pageInfo: { type: new GraphQLNonNull(PageInfoType) },
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
    itemsPage: {
      type: new GraphQLNonNull(ItemsPageType),
      args: {
        take: { type: GraphQLInt },
        skip: { type: GraphQLInt },
      },
    },
    itemsConnection: {
      type: new GraphQLNonNull(ItemsConnectionType),
      args: {
        first: { type: GraphQLInt },
        after: { type: GraphQLString },
      },
    },
    scalar: { type: GraphQLString },
    aggregate: {
      type: new GraphQLList(AggregateType),
      args: { by: { type: new GraphQLList(GraphQLString) } },
    },
    questions: {
      type: new GraphQLList(QuestionType),
      args: {
        take: { type: GraphQLInt },
        skip: { type: GraphQLInt },
      },
    },
    protocolStats: {
      type: new GraphQLObjectType({
        name: 'ProtocolStats',
        fields: { totalVolume: { type: GraphQLString } },
      }),
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

    // *Page envelope handling — the fix for the audit finding that
    // `predictionsPage(take: 100)` priced lower than `predictions(take: 100)`
    // because the *Page field isn't itself a list.
    describe('*Page envelope recognition', () => {
      it('treats `*Page` return type as a list of `take` rows', () => {
        const query = parse(`{ itemsPage(take: 50) { items { id } } }`);
        const complexity = getComplexity({
          schema: testSchema,
          query,
          estimators: [
            listMultiplierEstimator({ defaultListSize: 10 }),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });
        // items is the *Page passthrough: 1 + 1 = 2.
        // itemsPage applies the envelope multiplier: 1 + 2 * 50 = 101.
        expect(complexity).toBe(101);
      });

      it('uses default listSize when *Page take arg is missing', () => {
        const query = parse(`{ itemsPage { items { id } } }`);
        const complexity = getComplexity({
          schema: testSchema,
          query,
          estimators: [
            listMultiplierEstimator({ defaultListSize: 10 }),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });
        // items passthrough: 1 + 1 = 2.
        // itemsPage envelope falls back to default listSize of 10:
        // 1 + 2 * 10 = 21.
        expect(complexity).toBe(21);
      });

      it('caps *Page envelope at maxListSize', () => {
        const query = parse(`{ itemsPage(take: 5000) { items { id } } }`);
        const complexity = getComplexity({
          schema: testSchema,
          query,
          estimators: [
            listMultiplierEstimator({ defaultListSize: 10, maxListSize: 100 }),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });
        // take=5000 caps at 100. items passthrough: 1 + 1 = 2.
        // itemsPage: 1 + 2 * 100 = 201.
        expect(complexity).toBe(201);
      });

      it('paginated `*Page` and bare-array list with the same take price equivalently', () => {
        // Same selection set, same take — switching to the *Page
        // wrapper should price identically (modulo the envelope's
        // own field-cost contribution).
        const bareQuery = parse(`{ items(take: 50) { id name } }`);
        const pageQuery = parse(
          `{ itemsPage(take: 50) { items { id name } } }`
        );
        const ests = [
          listMultiplierEstimator({ defaultListSize: 10 }),
          simpleEstimator({ defaultComplexity: 1 }),
        ];
        const bareCost = getComplexity({
          schema: testSchema,
          query: bareQuery,
          estimators: ests,
        });
        const pageCost = getComplexity({
          schema: testSchema,
          query: pageQuery,
          estimators: ests,
        });
        // bare: 1 + 2 * 50 = 101.
        // page: items passthrough = 1 + 2 = 3. envelope = 1 + 3 * 50 = 151.
        // The +50 difference is the envelope's per-row "1" contribution
        // (items still pays a base cost of 1) — same order of magnitude.
        expect(pageCost).toBeGreaterThanOrEqual(bareCost);
        expect(pageCost - bareCost).toBeLessThanOrEqual(100);
      });

      it('regression (Connection): fat `nodes` selection stays bounded by `first`', () => {
        // Doc §1859 calls out that *Connection envelopes need the same
        // pass-through as *Page. Without the fix, this query would price
        // as `1 + (1 + (3 + 31)*10) * 50 = 17051` and trip the 15k cap.
        const query = parse(`{
          itemsConnection(first: 50) {
            nodes {
              id
              name
              value
              children {
                id
                name
                value
              }
            }
          }
        }`);
        const complexity = getComplexity({
          schema: testSchema,
          query,
          estimators: [
            listMultiplierEstimator({ defaultListSize: 10, maxListSize: 100 }),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });
        // children (real list, default 10): 1 + 3*10 = 31.
        // nodes passthrough: 1 + (1 + 1 + 1 + 31) = 35.
        // itemsConnection: 1 + 35 * 50 = 1751.
        expect(complexity).toBe(1751);
        expect(complexity).toBeLessThan(15000);
      });

      it('treats `*Connection` return type as a list of `first` rows via `nodes`', () => {
        const query = parse(`{ itemsConnection(first: 50) { nodes { id } } }`);
        const complexity = getComplexity({
          schema: testSchema,
          query,
          estimators: [
            listMultiplierEstimator({ defaultListSize: 10 }),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });
        // nodes passthrough: 1 + 1 = 2.
        // itemsConnection envelope: 1 + 2 * 50 = 101.
        expect(complexity).toBe(101);
      });

      it('treats `*Connection` return type as a list of `first` rows via `edges`', () => {
        const query = parse(
          `{ itemsConnection(first: 50) { edges { node { id } } } }`
        );
        const complexity = getComplexity({
          schema: testSchema,
          query,
          estimators: [
            listMultiplierEstimator({ defaultListSize: 10 }),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });
        // edges passthrough: 1 + (1 /* node */ + 1 /* id */) = 3.
        // itemsConnection envelope: 1 + 3 * 50 = 151.
        expect(complexity).toBe(151);
      });

      it('uses default listSize when *Connection `first` arg is missing', () => {
        const query = parse(`{ itemsConnection { nodes { id } } }`);
        const complexity = getComplexity({
          schema: testSchema,
          query,
          estimators: [
            listMultiplierEstimator({ defaultListSize: 10 }),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });
        // nodes passthrough: 1 + 1 = 2. envelope falls back to 10: 1 + 2*10 = 21.
        expect(complexity).toBe(21);
      });

      it('caps *Connection envelope at maxListSize', () => {
        const query = parse(
          `{ itemsConnection(first: 5000) { nodes { id } } }`
        );
        const complexity = getComplexity({
          schema: testSchema,
          query,
          estimators: [
            listMultiplierEstimator({ defaultListSize: 10, maxListSize: 100 }),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });
        // first=5000 caps at 100. nodes passthrough: 1 + 1 = 2.
        // itemsConnection: 1 + 2 * 100 = 201.
        expect(complexity).toBe(201);
      });

      it('regression: `questionsConnection` fat selection stays under the 15k cap', () => {
        // The frontend's GET_QUESTIONS query hit 82,762 before the
        // double-count fix. Reconstruct a comparable fat selection on
        // the simplified test schema and verify the new pricing is
        // bounded by `take` rather than `take * defaultListSize`.
        const query = parse(`{
          itemsPage(take: 50) {
            items {
              id
              name
              value
              children {
                id
                name
                value
              }
            }
          }
        }`);
        const complexity = getComplexity({
          schema: testSchema,
          query,
          estimators: [
            listMultiplierEstimator({ defaultListSize: 10, maxListSize: 100 }),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });
        // children (real list, default 10): 1 + 3*10 = 31.
        // items passthrough: 1 + (1 + 1 + 1 + 31) = 35.
        // itemsPage: 1 + 35 * 50 = 1751.
        // Pre-fix this same shape would be 1 + (1 + (3 + 31)*10) * 50 = 17051.
        expect(complexity).toBe(1751);
        expect(complexity).toBeLessThan(15000);
      });
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

  describe('createComplexityEstimators', () => {
    it('assigns fixed cost to questions field, bypassing list multiplier', () => {
      const query = parse(
        `{ questions(take: 50) { questionType predictionCount } }`
      );
      const estimators = createComplexityEstimators(100);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators,
      });
      // questions gets fixed cost 500 from fieldCostEstimator
      // + childComplexity (questionType: 1 + predictionCount: 1 = 2) = 502
      // NOT 1 + 2 * 50 = 101 (which the list multiplier would produce)
      expect(complexity).toBe(502);
    });

    it('assigns fixed cost to protocolStats field', () => {
      const query = parse(`{ protocolStats { totalVolume } }`);
      const estimators = createComplexityEstimators(100);
      const complexity = getComplexity({
        schema: testSchema,
        query,
        estimators,
      });
      // protocolStats: 2000 + totalVolume (1) = 2001
      expect(complexity).toBe(2001);
    });

    it('questions cost stays fixed regardless of take value', () => {
      const small = parse(
        `{ questions(take: 10) { questionType predictionCount } }`
      );
      const large = parse(
        `{ questions(take: 100) { questionType predictionCount } }`
      );
      const estimators = createComplexityEstimators(100);
      const smallComplexity = getComplexity({
        schema: testSchema,
        query: small,
        estimators,
      });
      const largeComplexity = getComplexity({
        schema: testSchema,
        query: large,
        estimators,
      });
      // Both should have the same complexity since questions uses fixed cost
      expect(smallComplexity).toBe(largeComplexity);
      expect(smallComplexity).toBe(502);
    });
  });
});
