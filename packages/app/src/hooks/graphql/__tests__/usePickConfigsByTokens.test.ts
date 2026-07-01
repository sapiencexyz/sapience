import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGraphqlRequest = vi.fn();

vi.mock('@sapience/sdk/queries/client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

async function getModule() {
  return import('../usePickConfigsByTokens');
}

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    pickConfigId: '0xpc1',
    chainId: 8453,
    escrow: '0xescrow',
    totalPredictorCollateral: '1000',
    totalCounterpartyCollateral: '3000',
    claimedPredictorCollateral: '0',
    claimedCounterpartyCollateral: '0',
    resolved: false,
    result: null,
    resolvedAt: null,
    predictorToken: '0xaaa',
    counterpartyToken: '0xbbb',
    endsAt: 1760000000,
    isLegacy: false,
    picks: [
      {
        conditionId: '0xcond1',
        resolver: '0xresolver1',
        predictedOutcome: 'YES',
        condition: {
          conditionId: '0xcond1',
          shortName: 'Short',
          optionName: null,
          question: 'Will it?',
          description: null,
          endTime: 1760000000,
          resolver: '0xresolver1',
          settled: false,
          resolvedToYes: false,
          nonDecisive: false,
          estimatedPrice: 0.5,
          category: { slug: 'crypto' },
        },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({
    pickConfigurations: { nodes: [] },
  });
});

describe('PICK_CONFIGS_BY_TOKENS_QUERY', () => {
  it('targets the pickConfigurations connection with explicit filter and orderBy', async () => {
    const mod = await getModule();
    const doc = mod.PICK_CONFIGS_BY_TOKENS_QUERY as string;
    expect(doc).toContain('filter: { tokens: $tokens }');
    expect(doc).toContain('first: $first');
    expect(doc).toContain('after: $after');
    expect(doc).toContain('hasNextPage');
    expect(doc).toContain('endCursor');
    expect(doc).toContain('orderBy: { field: CREATED_AT, direction: DESC }');
    expect(doc).toContain('nodes');
    expect(doc).toContain('pickConfigId');
    expect(doc).toContain('escrow');
    expect(doc).not.toContain('marketAddress');
    expect(doc).not.toContain('conditionResolver');
    expect(doc).not.toMatch(/\bid\b/);
  });
});

describe('usePickConfigsByTokens', () => {
  it('requests with deduped, lowercased, sorted tokens', async () => {
    const mod = await getModule();

    renderHook(() => mod.usePickConfigsByTokens(['0xBBB', '0xAAA', '0xaaa']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    });

    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables).toEqual({ tokens: ['0xaaa', '0xbbb'] });
  });

  it('does not fetch with an empty token list', async () => {
    const mod = await getModule();

    renderHook(() => mod.usePickConfigsByTokens([]), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });

  it('keys the map by both predictor and counterparty tokens with side flags', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurations: { nodes: [makeNode()] },
    });

    const { result } = renderHook(
      () => mod.usePickConfigsByTokens(['0xaaa', '0xbbb']),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.map.size).toBe(2);
    });

    expect(result.current.map.get('0xaaa')?.isPredictorToken).toBe(true);
    expect(result.current.map.get('0xbbb')?.isPredictorToken).toBe(false);
  });

  it('omits configs whose tokens were not requested', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurations: { nodes: [makeNode()] },
    });

    const { result } = renderHook(() => mod.usePickConfigsByTokens(['0xaaa']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.map.size).toBe(1);
    });

    expect(result.current.map.has('0xaaa')).toBe(true);
    expect(result.current.map.has('0xbbb')).toBe(false);
  });

  it('adapts nodes into the existing PickConfigData shape', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({
      pickConfigurations: { nodes: [makeNode()] },
    });

    const { result } = renderHook(() => mod.usePickConfigsByTokens(['0xaaa']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.map.size).toBe(1);
    });

    const entry = result.current.map.get('0xaaa');
    expect(entry?.pickConfig.id).toBe('0xpc1');
    expect(entry?.pickConfig.marketAddress).toBe('0xescrow');
    expect(entry?.pickConfig.result).toBe('UNRESOLVED');
    expect(entry?.pickConfig.isLegacy).toBe(false);
    expect(entry?.picks).toHaveLength(1);
    expect(entry?.picks[0].conditionResolver).toBe('0xresolver1');
    expect(entry?.picks[0].predictedOutcome).toBe(1);
    expect(entry?.picks[0].pickConfigId).toBe('0xpc1');
    expect(entry?.picks[0].condition?.id).toBe('0xcond1'); // CTF hash
  });

  it('pages through the connection until exhausted, enriching every token match', async () => {
    const mod = await getModule();
    mockGraphqlRequest
      .mockResolvedValueOnce({
        pickConfigurations: {
          nodes: Array.from({ length: 25 }, (_, i) =>
            makeNode({
              pickConfigId: `0xpc${i}`,
              predictorToken: `0xtok${i}`,
              counterpartyToken: `0xother${i}`,
            })
          ),
          pageInfo: { hasNextPage: true, endCursor: 'cursor-25' },
        },
      })
      .mockResolvedValueOnce({
        pickConfigurations: {
          nodes: [
            makeNode({
              pickConfigId: '0xpc25',
              predictorToken: '0xtok25',
              counterpartyToken: '0xother25',
            }),
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const tokens = Array.from({ length: 26 }, (_, i) => `0xtok${i}`);
    const { result } = renderHook(() => mod.usePickConfigsByTokens(tokens), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.map.size).toBe(26);
    });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1]).toMatchObject({
      after: null,
      first: 25,
    });
    expect(mockGraphqlRequest.mock.calls[1][1]).toMatchObject({
      after: 'cursor-25',
      first: 25,
    });
  });
});
