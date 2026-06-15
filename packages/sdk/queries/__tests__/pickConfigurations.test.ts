import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  fetchPickConfigurations,
  GET_PICK_CONFIGURATIONS,
} from '../pickConfigurations';

const mockGraphqlRequestV2 = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequestV2: (...args: unknown[]) => mockGraphqlRequestV2(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/** A v2 pickConfigurations node as served by /v2/graphql. */
const v2Node = (overrides: Record<string, unknown> = {}) => ({
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
// GET_PICK_CONFIGURATIONS document (v2)
// ============================================================================

describe('GET_PICK_CONFIGURATIONS v2 document', () => {
  test('queries the v2 connection with explicit orderBy and filter', () => {
    expect(GET_PICK_CONFIGURATIONS).toContain(
      'orderBy: { field: CREATED_AT, direction: DESC }'
    );
    expect(GET_PICK_CONFIGURATIONS).toContain('filter: $filter');
    expect(GET_PICK_CONFIGURATIONS).toContain('first: $first');
    expect(GET_PICK_CONFIGURATIONS).toContain('nodes');
    expect(GET_PICK_CONFIGURATIONS).toContain('pickConfigId');
  });

  test('uses v2 field names on picks and aliases the condition hash', () => {
    // Pick.resolver replaces v1 conditionResolver on the wire
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
    mockGraphqlRequestV2.mockResolvedValue({
      pickConfigurations: { nodes: [] },
    });
    await fetchPickConfigurations();
    expect(mockGraphqlRequestV2).toHaveBeenCalledWith(GET_PICK_CONFIGURATIONS, {
      first: 10,
      filter: undefined,
    });
  });

  test('passes chainId and resolved through the v2 filter', async () => {
    mockGraphqlRequestV2.mockResolvedValue({
      pickConfigurations: { nodes: [] },
    });
    await fetchPickConfigurations({
      take: 50,
      chainId: 42161,
      resolved: false,
    });
    expect(mockGraphqlRequestV2).toHaveBeenCalledWith(GET_PICK_CONFIGURATIONS, {
      first: 50,
      filter: { chainId: 42161, resolved: false },
    });
  });

  test('omits unset filter keys', async () => {
    mockGraphqlRequestV2.mockResolvedValue({
      pickConfigurations: { nodes: [] },
    });
    await fetchPickConfigurations({ take: 5, resolved: true });
    expect(mockGraphqlRequestV2).toHaveBeenCalledWith(GET_PICK_CONFIGURATIONS, {
      first: 5,
      filter: { resolved: true },
    });
  });

  test('maps v2 nodes onto the stable PickConfigurationResult shape', async () => {
    mockGraphqlRequestV2.mockResolvedValue({
      pickConfigurations: { nodes: [v2Node()] },
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
    mockGraphqlRequestV2.mockResolvedValue({
      pickConfigurations: {
        nodes: [
          v2Node({
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

  test('emulates v1 skip by over-fetching and slicing', async () => {
    mockGraphqlRequestV2.mockResolvedValue({
      pickConfigurations: {
        nodes: [
          v2Node({ pickConfigId: '0x1' }),
          v2Node({ pickConfigId: '0x2' }),
          v2Node({ pickConfigId: '0x3' }),
        ],
      },
    });
    const result = await fetchPickConfigurations({ take: 2, skip: 1 });
    expect(mockGraphqlRequestV2).toHaveBeenCalledWith(
      GET_PICK_CONFIGURATIONS,
      expect.objectContaining({ first: 3 })
    );
    expect(result.map((pc) => pc.id)).toEqual(['0x2', '0x3']);
  });

  test('throws on invalid response structure', async () => {
    mockGraphqlRequestV2.mockResolvedValue(null);
    await expect(fetchPickConfigurations()).rejects.toThrow(
      'Failed to fetch pick configurations: Invalid response structure'
    );
    mockGraphqlRequestV2.mockResolvedValue({});
    await expect(fetchPickConfigurations()).rejects.toThrow(
      'Failed to fetch pick configurations: Invalid response structure'
    );
  });
});
