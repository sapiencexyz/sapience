import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  fetchPickConfigurations,
  GET_PICK_CONFIGURATIONS,
} from '../pickConfigurations';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/** A pickConfigurations node as served by /v2/graphql. */
const makeNode = (overrides: Record<string, unknown> = {}) => ({
  pickConfigId: '0xpickcfg1',
  chainId: 5064014,
  totalPredictorCollateral: '100',
  totalCounterpartyCollateral: '200',
  resolved: false,
  picks: [
    {
      conditionId: '0xc1',
      resolver: '0xr1',
      predictedOutcome: 'YES',
      condition: {
        id: '0xc1', // aliased from conditionId in the document
        shortName: 'BTC',
        optionName: null,
        question: 'Will BTC hit 100k?',
        description: 'desc',
        endTime: 1767225600,
        resolver: '0xr1',
        settled: false,
        resolvedToYes: false,
        nonDecisive: false,
        estimatedPrice: 0.42,
        category: { slug: 'crypto' },
      },
    },
    {
      conditionId: '0xc2',
      resolver: '0xr2',
      predictedOutcome: 'NO',
      condition: null,
    },
  ],
  ...overrides,
});

// ============================================================================
// GET_PICK_CONFIGURATIONS document
// ============================================================================

describe('GET_PICK_CONFIGURATIONS document', () => {
  test('queries the connection with explicit orderBy and filter', () => {
    expect(GET_PICK_CONFIGURATIONS).toContain(
      'orderBy: { field: CREATED_AT, direction: DESC }'
    );
    expect(GET_PICK_CONFIGURATIONS).toContain('filter: $filter');
    expect(GET_PICK_CONFIGURATIONS).toContain('first: $first');
    expect(GET_PICK_CONFIGURATIONS).toContain('nodes');
    expect(GET_PICK_CONFIGURATIONS).toContain('pickConfigId');
  });

  test('uses current field names on picks and aliases the condition hash', () => {
    // Pick.resolver replaces conditionResolver on the wire
    expect(GET_PICK_CONFIGURATIONS).not.toContain('conditionResolver');
    expect(GET_PICK_CONFIGURATIONS).toContain('id: conditionId');
    expect(GET_PICK_CONFIGURATIONS).not.toContain('$take');
    expect(GET_PICK_CONFIGURATIONS).not.toContain('$skip');
    expect(GET_PICK_CONFIGURATIONS).not.toContain('$chainId: Int');
  });
});

// ============================================================================
// fetchPickConfigurations
// ============================================================================

describe('fetchPickConfigurations', () => {
  test('uses default first=10 and no filter when no opts provided', async () => {
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurations: { nodes: [] },
    });
    await fetchPickConfigurations();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_PICK_CONFIGURATIONS, {
      first: 10,
      after: null,
      filter: undefined,
    });
  });

  test('passes chainId and resolved through the filter', async () => {
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurations: { nodes: [] },
    });
    await fetchPickConfigurations({
      take: 50,
      chainId: 42161,
      resolved: false,
    });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_PICK_CONFIGURATIONS, {
      first: 50,
      after: null,
      filter: { chainId: 42161, resolved: false },
    });
  });

  test('omits unset filter keys', async () => {
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurations: { nodes: [] },
    });
    await fetchPickConfigurations({ take: 5, resolved: true });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_PICK_CONFIGURATIONS, {
      first: 5,
      after: null,
      filter: { resolved: true },
    });
  });

  test('maps nodes onto the stable PickConfigurationResult shape', async () => {
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurations: { nodes: [makeNode()] },
    });
    const [pc] = await fetchPickConfigurations();
    expect(pc).toEqual({
      id: '0xpickcfg1', // pickConfigId hash carried under the stable name
      chainId: 5064014,
      totalPredictorCollateral: '100',
      totalCounterpartyCollateral: '200',
      resolved: false,
      picks: [
        {
          conditionId: '0xc1',
          conditionResolver: '0xr1', // resolver mapped back
          predictedOutcome: 1, // YES → 1
          condition: {
            id: '0xc1',
            shortName: 'BTC',
            optionName: null,
            question: 'Will BTC hit 100k?',
            description: 'desc',
            endTime: 1767225600,
            resolver: '0xr1',
            settled: false,
            resolvedToYes: false,
            nonDecisive: false,
            estimatedPrice: 0.42,
            category: { slug: 'crypto' },
          },
        },
        {
          conditionId: '0xc2',
          conditionResolver: '0xr2',
          predictedOutcome: 0, // NO → 0
          condition: null,
        },
      ],
    });
  });

  test('coerces collateral BigInt values to strings', async () => {
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurations: {
        nodes: [
          makeNode({
            totalPredictorCollateral: 100,
            totalCounterpartyCollateral: 200,
          }),
        ],
      },
    });
    const [pc] = await fetchPickConfigurations();
    expect(pc.totalPredictorCollateral).toBe('100');
    expect(pc.totalCounterpartyCollateral).toBe('200');
  });

  test('pages the cursor connection then slices to the skip window', async () => {
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurations: {
        nodes: [
          makeNode({ pickConfigId: '0x1' }),
          makeNode({ pickConfigId: '0x2' }),
          makeNode({ pickConfigId: '0x3' }),
        ],
      },
    });
    const result = await fetchPickConfigurations({ take: 2, skip: 1 });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      GET_PICK_CONFIGURATIONS,
      expect.objectContaining({ first: 3 })
    );
    expect(result.map((pc) => pc.id)).toEqual(['0x2', '0x3']);
  });

  test('uses cursors when take + skip exceeds the page cap', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) =>
      makeNode({ pickConfigId: `0x${i}` })
    );
    const secondPage = Array.from({ length: 50 }, (_, i) =>
      makeNode({ pickConfigId: `0x${i + 100}` })
    );
    mockGraphqlRequest
      .mockResolvedValueOnce({
        pickConfigurations: {
          nodes: firstPage,
          pageInfo: { hasNextPage: true, endCursor: 'cursor-100' },
        },
      })
      .mockResolvedValueOnce({
        pickConfigurations: {
          nodes: secondPage,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await fetchPickConfigurations({ take: 100, skip: 50 });

    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(
      1,
      GET_PICK_CONFIGURATIONS,
      expect.objectContaining({ first: 100, after: null })
    );
    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(
      2,
      GET_PICK_CONFIGURATIONS,
      expect.objectContaining({ first: 50, after: 'cursor-100' })
    );
    expect(result).toHaveLength(100);
    expect(result[0].id).toBe('0x50');
    expect(result[99].id).toBe('0x149');
  });

  test('throws on invalid response structure', async () => {
    mockGraphqlRequest.mockResolvedValue(null);
    await expect(fetchPickConfigurations()).rejects.toThrow(
      'Failed to fetch pick configurations: Invalid response structure'
    );
    mockGraphqlRequest.mockResolvedValue({});
    await expect(fetchPickConfigurations()).rejects.toThrow(
      'Failed to fetch pick configurations: Invalid response structure'
    );
  });
});
