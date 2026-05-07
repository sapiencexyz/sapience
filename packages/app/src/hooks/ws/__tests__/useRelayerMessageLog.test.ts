import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock WS and settings
// ---------------------------------------------------------------------------

type MsgCallback = (msg: unknown) => void;
type VoidCallback = () => void;

const wsListeners: MsgCallback[] = [];
const openListeners: VoidCallback[] = [];
const wsSent: Record<string, unknown>[] = [];

const mockWsClient = {
  send: vi.fn((msg: Record<string, unknown>) => {
    wsSent.push(msg);
  }),
  addMessageListener: vi.fn((cb: MsgCallback) => {
    wsListeners.push(cb);
    return () => {
      const idx = wsListeners.indexOf(cb);
      if (idx !== -1) wsListeners.splice(idx, 1);
    };
  }),
  addOpenListener: vi.fn((cb: VoidCallback) => {
    openListeners.push(cb);
    return () => {
      const idx = openListeners.indexOf(cb);
      if (idx !== -1) openListeners.splice(idx, 1);
    };
  }),
};

vi.mock('~/lib/ws/AuctionWsClient', () => ({
  getSharedAuctionWsClient: () => mockWsClient,
  getMessageSource: (msg: unknown) =>
    (msg as Record<string, unknown>)?.__source as string | undefined,
}));

vi.mock('~/lib/ws/auctionUrl', () => ({
  toAuctionWsUrl: (url: string) => `ws://${url}`,
}));

vi.mock('~/lib/context/SettingsContext', () => ({
  useSettings: () => ({ apiBaseUrl: 'localhost:9999' }),
}));

function deliverMessage(msg: Record<string, unknown>) {
  for (const cb of [...wsListeners]) cb(msg);
}

function triggerReconnect() {
  for (const cb of [...openListeners]) cb();
}

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { useRelayerMessageLog } = await import('../useRelayerMessageLog');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRelayerMessageLog', () => {
  beforeEach(() => {
    wsListeners.length = 0;
    openListeners.length = 0;
    wsSent.length = 0;
    mockWsClient.send.mockClear();
    mockWsClient.addMessageListener.mockClear();
    mockWsClient.addOpenListener.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to vault and secondary feeds on mount', () => {
    renderHook(() => useRelayerMessageLog());

    const sentTypes = wsSent.map((m) => m.type);
    expect(sentTypes).toContain('vault_quote.observe');
    expect(sentTypes).toContain('secondary.feed.subscribe');
  });

  it('groups RFQ messages by auctionId', () => {
    const { result } = renderHook(() => useRelayerMessageLog());

    act(() => {
      deliverMessage({
        type: 'auction.started',
        __source: 'relayer',
        payload: { auctionId: 'a1', picks: [] },
      });
    });

    act(() => {
      deliverMessage({
        type: 'auction.bids',
        __source: 'relayer',
        auctionId: 'a1',
        payload: { auctionId: 'a1', bids: [] },
      });
    });

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].groupId).toBe('a1');
    expect(result.current.groups[0].category).toBe('rfq');
    expect(result.current.groups[0].messages).toHaveLength(2);
  });

  it('groups vault messages by chainId:vaultAddress', () => {
    const { result } = renderHook(() => useRelayerMessageLog());

    act(() => {
      deliverMessage({
        type: 'vault_quote.update',
        __source: 'relayer',
        payload: { chainId: 1, vaultAddress: '0xabc', price: '1.5' },
      });
    });

    act(() => {
      deliverMessage({
        type: 'vault_quote.update',
        __source: 'relayer',
        payload: { chainId: 1, vaultAddress: '0xabc', price: '1.6' },
      });
    });

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].groupId).toBe('vault:1:0xabc');
    expect(result.current.groups[0].category).toBe('vault');
    expect(result.current.groups[0].messages).toHaveLength(2);
  });

  it('groups secondary messages by auctionId', () => {
    const { result } = renderHook(() => useRelayerMessageLog());

    act(() => {
      deliverMessage({
        type: 'secondary.auction.started',
        __source: 'relayer',
        payload: { auctionId: 'sec-1' },
      });
    });

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].groupId).toBe('sec-1');
    expect(result.current.groups[0].category).toBe('secondary');
  });

  it('preserves message source from __source tag', () => {
    const { result } = renderHook(() => useRelayerMessageLog());

    act(() => {
      deliverMessage({
        type: 'auction.started',
        __source: 'p2p',
        payload: { auctionId: 'a1' },
      });
    });

    expect(result.current.groups[0].messages[0].source).toBe('p2p');
  });

  it('auto-subscribes to auctions on auction.started', () => {
    renderHook(() => useRelayerMessageLog());

    act(() => {
      deliverMessage({
        type: 'auction.started',
        __source: 'relayer',
        payload: { auctionId: 'auto-1' },
      });
    });

    const subscribeMsgs = wsSent.filter((m) => m.type === 'auction.subscribe');
    expect(subscribeMsgs).toContainEqual({
      type: 'auction.subscribe',
      payload: { auctionId: 'auto-1' },
    });
  });

  it('resubscribes on reconnect', () => {
    renderHook(() => useRelayerMessageLog());

    act(() => {
      deliverMessage({
        type: 'auction.started',
        __source: 'relayer',
        payload: { auctionId: 'resub-1' },
      });
    });

    wsSent.length = 0;

    act(() => {
      triggerReconnect();
    });

    const sentTypes = wsSent.map((m) => m.type);
    // Only dynamic auction subscriptions are re-sent on reconnect
    // (vault_quote.observe and secondary.feed.subscribe are sent once on mount)
    expect(sentTypes).toContain('auction.subscribe');
    expect(sentTypes).not.toContain('vault_quote.observe');
    expect(sentTypes).not.toContain('secondary.feed.subscribe');
  });

  it('sorts groups by updatedAt descending', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRelayerMessageLog());

    act(() => {
      vi.setSystemTime(1000);
      deliverMessage({
        type: 'auction.started',
        __source: 'relayer',
        payload: { auctionId: 'first' },
      });
    });

    act(() => {
      vi.setSystemTime(2000);
      deliverMessage({
        type: 'auction.started',
        __source: 'relayer',
        payload: { auctionId: 'second' },
      });
    });

    // Most recent should be first
    expect(result.current.groups[0].groupId).toBe('second');
    expect(result.current.groups[1].groupId).toBe('first');

    vi.useRealTimers();
  });

  it('clear() empties all groups', () => {
    const { result } = renderHook(() => useRelayerMessageLog());

    act(() => {
      deliverMessage({
        type: 'auction.started',
        __source: 'relayer',
        payload: { auctionId: 'a1' },
      });
    });

    expect(result.current.groups).toHaveLength(1);

    act(() => {
      result.current.clear();
    });

    expect(result.current.groups).toHaveLength(0);
  });

  it('puts ungroupable messages into system: groups', () => {
    const { result } = renderHook(() => useRelayerMessageLog());

    act(() => {
      deliverMessage({
        type: 'heartbeat',
        __source: 'relayer',
      });
    });

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].groupId).toBe('system:heartbeat');
  });

  it('unsubscribes from feeds on unmount', () => {
    const { unmount } = renderHook(() => useRelayerMessageLog());

    wsSent.length = 0;
    unmount();

    const sentTypes = wsSent.map((m) => m.type);
    expect(sentTypes).toContain('vault_quote.unobserve');
    expect(sentTypes).toContain('secondary.feed.unsubscribe');
  });
});
