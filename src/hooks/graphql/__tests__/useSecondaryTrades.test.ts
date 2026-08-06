import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGraphqlRequest = vi.fn();

vi.mock('~/lib/sdk/queries/client/graphqlClient', () => ({
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
  return import('../useSecondaryTrades');
}

function makeTradeNode(overrides: Record<string, unknown> = {}) {
  return {
    tradeHash: '0xhash1',
    chainId: 8453,
    token: '0xtoken',
    collateral: '0xcollateral',
    seller: '0xseller',
    buyer: '0xbuyer',
    tokenAmount: '1000000000000000000',
    price: '250000000000000000',
    txHash: '0xtx',
    blockNumber: 123,
    executedAt: 1750000000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({ trades: { nodes: [] } });
});

describe('trade documents', () => {
  it('participant query collapses seller+buyer into one filter with explicit orderBy', async () => {
    const mod = await getModule();
    const doc = mod.TRADES_BY_PARTICIPANT_QUERY as string;
    expect(doc).toContain(
      'filter: { participant: $participant, chainId: $chainId }'
    );
    expect(doc).toContain('orderBy: { field: EXECUTED_AT, direction: DESC }');
    expect(doc).toContain('first: $first');
    expect(doc).toContain('after: $after');
    expect(doc).toContain('hasNextPage');
    expect(doc).toContain('endCursor');
    expect(doc).toContain('nodes');
    expect(doc).not.toMatch(/\bid\b/);
    expect(doc).not.toContain('seller:');
    expect(doc).not.toContain('buyer:');
  });

  it('all-trades query filters by chainId with explicit orderBy', async () => {
    const mod = await getModule();
    const doc = mod.ALL_TRADES_QUERY as string;
    expect(doc).toContain('filter: { chainId: $chainId }');
    expect(doc).toContain('orderBy: { field: EXECUTED_AT, direction: DESC }');
    expect(doc).toContain('first: $first');
    expect(doc).toContain('after: $after');
    expect(doc).toContain('hasNextPage');
    expect(doc).toContain('endCursor');
    expect(doc).not.toMatch(/\bid\b/);
  });

  it('single-trade query looks up by tradeHash', async () => {
    const mod = await getModule();
    const doc = mod.TRADE_QUERY as string;
    expect(doc).toContain('trade(tradeHash: $tradeHash)');
    expect(doc).not.toMatch(/\bid\b/);
  });
});

describe('useSecondaryTradesByAddress', () => {
  it('issues a single request keyed on participant (no seller/buyer double query)', async () => {
    const mod = await getModule();

    renderHook(
      () => mod.useSecondaryTradesByAddress({ address: '0xme', chainId: 8453 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    });

    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables).toEqual({
      participant: '0xme',
      chainId: 8453,
      first: 25,
      after: null,
    });
  });

  it('passes chainId: null when chainId is omitted', async () => {
    const mod = await getModule();

    renderHook(() => mod.useSecondaryTradesByAddress({ address: '0xme' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    });

    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables).toEqual({
      participant: '0xme',
      chainId: null,
      first: 25,
      after: null,
    });
  });

  it('returns mapped trades without numeric row ids', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({
      trades: { nodes: [makeTradeNode({ id: 42 })] },
    });

    const { result } = renderHook(
      () => mod.useSecondaryTradesByAddress({ address: '0xme' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });

    const trade = result.current.data[0];
    expect(trade).not.toHaveProperty('id');
    expect(Object.keys(trade).sort()).toEqual(
      [
        'tradeHash',
        'chainId',
        'token',
        'collateral',
        'seller',
        'buyer',
        'tokenAmount',
        'price',
        'txHash',
        'blockNumber',
        'executedAt',
      ].sort()
    );
    expect(trade.tradeHash).toBe('0xhash1');
    expect(trade.executedAt).toBe(1750000000); // epoch seconds, unchanged
  });

  it('pages through the connection until hasNextPage is false, accumulating all trades', async () => {
    const mod = await getModule();
    mockGraphqlRequest
      .mockResolvedValueOnce({
        trades: {
          nodes: [makeTradeNode({ tradeHash: '0xa' })],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      })
      .mockResolvedValueOnce({
        trades: {
          nodes: [makeTradeNode({ tradeHash: '0xb' })],
          pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
        },
      });

    const { result } = renderHook(
      () => mod.useSecondaryTradesByAddress({ address: '0xme', chainId: 8453 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(2);
    });

    // Two pages, then it stops (hasNextPage: false on page 2).
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1]).toEqual({
      participant: '0xme',
      chainId: 8453,
      first: 25,
      after: null,
    });
    // Second page threads the previous endCursor.
    expect(mockGraphqlRequest.mock.calls[1][1]).toEqual({
      participant: '0xme',
      chainId: 8453,
      first: 25,
      after: 'cursor-1',
    });
    expect(result.current.data.map((t) => t.tradeHash)).toEqual(['0xa', '0xb']);
  });

  it('does not fetch without an address', async () => {
    const mod = await getModule();

    renderHook(() => mod.useSecondaryTradesByAddress({}), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });
});

describe('useSecondaryTrades (all trades)', () => {
  it('requests the trades connection filtered by chainId', async () => {
    const mod = await getModule();

    renderHook(() => mod.useSecondaryTrades({ chainId: 8453 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    });

    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables).toEqual({ chainId: 8453, first: 25, after: null });
  });

  it('normalizes BigInt wire values to strings', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({
      trades: { nodes: [makeTradeNode({ tokenAmount: 5, price: 7 })] },
    });

    const { result } = renderHook(() => mod.useSecondaryTrades({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });

    expect(result.current.data[0].tokenAmount).toBe('5');
    expect(result.current.data[0].price).toBe('7');
  });

  it('pages through the connection until exhausted, accumulating all trades', async () => {
    const mod = await getModule();
    mockGraphqlRequest
      .mockResolvedValueOnce({
        trades: {
          nodes: [makeTradeNode({ tradeHash: '0xa' })],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      })
      .mockResolvedValueOnce({
        trades: {
          nodes: [makeTradeNode({ tradeHash: '0xb' })],
          pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
        },
      });

    const { result } = renderHook(() => mod.useSecondaryTrades({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data.length).toBe(2);
    });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1]).toEqual({
      chainId: null,
      first: 25,
      after: null,
    });
    expect(mockGraphqlRequest.mock.calls[1][1]).toEqual({
      chainId: null,
      first: 25,
      after: 'cursor-1',
    });
    expect(result.current.data.map((t) => t.tradeHash)).toEqual(['0xa', '0xb']);
  });

  it('stops after one page when hasNextPage is false', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValueOnce({
      trades: {
        nodes: [makeTradeNode()],
        pageInfo: { hasNextPage: false, endCursor: 'cursor-1' },
      },
    });

    const { result } = renderHook(() => mod.useSecondaryTrades({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
  });
});

describe('useSecondaryTrade', () => {
  it('looks up a single trade by tradeHash', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({ trade: makeTradeNode() });

    const { result } = renderHook(() => mod.useSecondaryTrade('0xhash1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables).toEqual({ tradeHash: '0xhash1' });
    expect(result.current.data?.tradeHash).toBe('0xhash1');
    expect(result.current.data).not.toHaveProperty('id');
  });

  it('returns null when the trade is missing', async () => {
    const mod = await getModule();
    mockGraphqlRequest.mockResolvedValue({ trade: null });

    const { result } = renderHook(() => mod.useSecondaryTrade('0xmissing'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    });

    expect(result.current.data).toBeNull();
  });
});
