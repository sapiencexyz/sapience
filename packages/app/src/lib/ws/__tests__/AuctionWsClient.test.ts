import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock MeshTransport — captures send() calls and exposes listener trigger
// ---------------------------------------------------------------------------

type MsgCallback = (msg: unknown) => void;

const meshSent: Record<string, unknown>[] = [];
const meshListeners: MsgCallback[] = [];

const mockMeshTransport = {
  send: vi.fn((msg: Record<string, unknown>) => {
    meshSent.push(msg);
  }),
  addMessageListener: vi.fn((cb: MsgCallback) => {
    meshListeners.push(cb);
    return () => {
      const idx = meshListeners.indexOf(cb);
      if (idx !== -1) meshListeners.splice(idx, 1);
    };
  }),
};

/** Simulate a message arriving from the mesh network. */
function deliverFromMesh(msg: Record<string, unknown>) {
  for (const cb of [...meshListeners]) cb(msg);
}

vi.mock('../MeshAuctionClient', () => ({
  getSharedMeshClient: () => mockMeshTransport,
}));

// Mock gossip validation — accept everything by default, tests can override
const isValidGossipPayloadMock = vi.fn(() => true);
const validateGossipPayloadAsyncMock = vi.fn(async () => true);

vi.mock('@sapience/sdk/auction/gossipValidation', () => ({
  isValidGossipPayload: (...args: unknown[]) =>
    isValidGossipPayloadMock(...args),
  validateGossipPayloadAsync: (...args: unknown[]) =>
    validateGossipPayloadAsyncMock(...args),
}));

vi.mock('@sapience/sdk/contracts', () => ({
  predictionMarketEscrow: {},
}));

vi.mock('@sapience/sdk/constants/chain', () => ({
  DEFAULT_CHAIN_ID: 1,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { getSharedAuctionWsClient } = await import('../AuctionWsClient');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuctionWsClient dual-send (outbound)', () => {
  beforeEach(() => {
    meshSent.length = 0;
    meshListeners.length = 0;
    mockMeshTransport.send.mockClear();
    mockMeshTransport.addMessageListener.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends auction.start to both relayer WS and mesh', () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');

    // The underlying WS isn't connected, but send() is patched and will
    // still forward to mesh even if the WS send queues/no-ops.
    const msg = {
      id: 'a1',
      type: 'auction.start',
      payload: { picks: [], predictor: '0x1234', id: 'a1' },
    };
    client.send(msg);

    expect(mockMeshTransport.send).toHaveBeenCalledWith(msg);
  });

  it('promotes auction.start to auction.started on mesh for P2P', () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const msg = {
      id: 'promo-1',
      type: 'auction.start',
      payload: { picks: [], predictor: '0x1234', id: 'promo-1' },
    };
    client.send(msg);

    // First call: original auction.start
    // Second call: promoted auction.started
    expect(mockMeshTransport.send).toHaveBeenCalledTimes(2);

    const promoted = meshSent[1];
    expect(promoted.type).toBe('auction.started');
    expect((promoted.payload as Record<string, unknown>).auctionId).toBe(
      'promo-1'
    );
    // Original id should be omitted to avoid dedup collision
    expect((promoted.payload as Record<string, unknown>).id).toBeUndefined();
  });

  it('promotes bid.submit to auction.bids on mesh for P2P', () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const msg = {
      id: 'b1',
      type: 'bid.submit',
      payload: {
        auctionId: 'a1',
        counterparty: '0x1234567890123456789012345678901234567890',
        counterpartyCollateral: '100',
      },
    };
    client.send(msg);

    // First call: original bid.submit
    // Second call: promoted auction.bids
    expect(mockMeshTransport.send).toHaveBeenCalledTimes(2);

    const promoted = meshSent[1];
    expect(promoted.type).toBe('auction.bids');
    expect((promoted.payload as Record<string, unknown>).auctionId).toBe('a1');
    const bids = (promoted.payload as Record<string, unknown>)
      .bids as unknown[];
    expect(bids).toHaveLength(1);
  });

  it('sends bid.submit to both relayer WS and mesh', () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const msg = {
      id: 'b1',
      type: 'bid.submit',
      payload: { auctionId: 'a1', counterparty: '0xABC' },
    };
    client.send(msg);

    expect(mockMeshTransport.send).toHaveBeenCalledWith(msg);
  });

  it('sends auction.bids to mesh', () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const msg = { id: 'ab1', type: 'auction.bids', payload: { bids: [] } };
    client.send(msg);

    expect(mockMeshTransport.send).toHaveBeenCalledWith(msg);
  });

  it('sends bid.ack to mesh', () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const msg = { id: 'ba1', type: 'bid.ack', payload: { auctionId: 'a1' } };
    client.send(msg);

    expect(mockMeshTransport.send).toHaveBeenCalledWith(msg);
  });

  it('sends order.created to mesh', () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const msg = { id: 'oc1', type: 'order.created', payload: { id: 'o1' } };
    client.send(msg);

    expect(mockMeshTransport.send).toHaveBeenCalledWith(msg);
  });

  it('does NOT send non-mesh types to mesh', () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    client.send({ id: 'x1', type: 'ping' });
    client.send({ id: 'x2', type: 'subscribe' });
    client.send({ id: 'x3', type: 'some.custom.type' });

    expect(mockMeshTransport.send).not.toHaveBeenCalled();
  });

  it('swallows mesh send errors gracefully', () => {
    mockMeshTransport.send.mockImplementationOnce(() => {
      throw new Error('mesh down');
    });

    const client = getSharedAuctionWsClient('ws://localhost:9999');
    // Should not throw
    expect(() => {
      client.send({ id: 'e1', type: 'auction.start', payload: {} });
    }).not.toThrow();
  });
});

describe('AuctionWsClient dual-receive (inbound)', () => {
  beforeEach(() => {
    meshSent.length = 0;
    meshListeners.length = 0;
    mockMeshTransport.send.mockClear();
    mockMeshTransport.addMessageListener.mockClear();
    isValidGossipPayloadMock.mockReturnValue(true);
    validateGossipPayloadAsyncMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delivers mesh messages to WS message listeners', async () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const received: unknown[] = [];
    client.addMessageListener((msg) => received.push(msg));

    const meshMsg = {
      id: 'mesh-1',
      type: 'auction.bids',
      auctionId: 'a1',
      bids: [
        {
          auctionId: 'a1',
          counterparty: '0x1234567890123456789012345678901234567890',
          counterpartyCollateral: '100',
        },
      ],
    };
    deliverFromMesh(meshMsg);

    // Async validation runs in a microtask
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toBe(meshMsg);
  });

  it('validates mesh messages structurally before delivery', async () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const received: unknown[] = [];
    client.addMessageListener((msg) => received.push(msg));

    isValidGossipPayloadMock.mockReturnValue(false);

    deliverFromMesh({ id: 'bad-1', type: 'auction.start', payload: {} });

    // Give async path time to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(0);
  });

  it('validates mesh messages cryptographically before delivery', async () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const received: unknown[] = [];
    client.addMessageListener((msg) => received.push(msg));

    isValidGossipPayloadMock.mockReturnValue(true);
    validateGossipPayloadAsyncMock.mockResolvedValue(false);

    deliverFromMesh({
      id: 'bad-sig-1',
      type: 'auction.start',
      picks: [
        {
          conditionResolver: '0x1234567890123456789012345678901234567890',
          conditionId: '0x' + 'ab'.repeat(32),
          predictedOutcome: 0,
        },
      ],
      predictor: '0x1234567890123456789012345678901234567890',
      predictorCollateral: '100',
      chainId: 1,
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(0);
  });

  it('drops non-mesh types from mesh', async () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const received: unknown[] = [];
    client.addMessageListener((msg) => received.push(msg));

    deliverFromMesh({ id: 'nm-1', type: 'ping' });
    deliverFromMesh({ id: 'nm-2', type: 'subscribe' });

    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(0);
    // Should not even reach validation
    expect(isValidGossipPayloadMock).not.toHaveBeenCalled();
  });

  it('validates against inner payload, not outer envelope', async () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const received: unknown[] = [];
    client.addMessageListener((msg) => received.push(msg));

    // Simulate a mesh message where fields are nested in payload (real shape)
    isValidGossipPayloadMock.mockImplementation((_type, data) => {
      // Should receive the inner payload with picks, not the outer envelope
      return !!(data as Record<string, unknown>).picks;
    });

    // Outer envelope — picks are inside payload, not at top level
    deliverFromMesh({
      type: 'auction.start',
      payload: {
        picks: [
          { conditionResolver: '0x1234567890123456789012345678901234567890' },
        ],
        predictor: '0x1234567890123456789012345678901234567890',
      },
    });

    await vi.waitFor(() => expect(received).toHaveLength(1));
    // Validation was called with inner payload
    expect(isValidGossipPayloadMock).toHaveBeenCalledWith(
      'auction.start',
      expect.objectContaining({ picks: expect.any(Array) })
    );
  });

  it('unsubscribes from mesh when WS listener is removed', () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const unsub = client.addMessageListener(() => {});

    expect(meshListeners).toHaveLength(1);
    unsub();
    expect(meshListeners).toHaveLength(0);
  });
});

describe('AuctionWsClient deduplication', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    meshSent.length = 0;
    meshListeners.length = 0;
    mockMeshTransport.send.mockClear();
    mockMeshTransport.addMessageListener.mockClear();
    isValidGossipPayloadMock.mockReturnValue(true);
    validateGossipPayloadAsyncMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('deduplicates messages seen from mesh when same ID arrives again', async () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const received: unknown[] = [];
    client.addMessageListener((msg) => received.push(msg));

    const msg = {
      id: 'dedup-mesh-1',
      type: 'auction.bids',
      auctionId: 'a1',
      bids: [
        {
          auctionId: 'a1',
          counterparty: '0x1234567890123456789012345678901234567890',
          counterpartyCollateral: '100',
        },
      ],
    };

    // First delivery from mesh — should arrive
    deliverFromMesh(msg);
    await vi.waitFor(() => expect(received).toHaveLength(1));

    // Second delivery of same ID from mesh — should be deduped
    deliverFromMesh(msg);
    await vi.advanceTimersByTimeAsync(50);
    expect(received).toHaveLength(1);
  });

  it('deduplicates concurrent identical mesh messages before async validation resolves', async () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const received: unknown[] = [];
    client.addMessageListener((msg) => received.push(msg));

    // Make async validation slow so both messages enter the pipeline
    // before the first one resolves.
    let resolveValidation!: (v: boolean) => void;
    validateGossipPayloadAsyncMock.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveValidation = resolve;
        })
    );

    const msg = {
      id: 'concurrent-dedup-1',
      type: 'auction.bids',
      auctionId: 'a1',
      bids: [
        {
          auctionId: 'a1',
          counterparty: '0x1234567890123456789012345678901234567890',
          counterpartyCollateral: '100',
        },
      ],
    };

    // Deliver the same message twice before validation resolves.
    // Because dedup runs synchronously before async validation,
    // the second message should be dropped immediately.
    deliverFromMesh(msg);
    deliverFromMesh(msg);

    // Resolve the (single) pending validation
    resolveValidation(true);
    await vi.advanceTimersByTimeAsync(50);

    // Only one message should be delivered
    expect(received).toHaveLength(1);
    // Async validation should only have been called once (second message
    // was deduped before reaching validation)
    expect(validateGossipPayloadAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('expires dedup entries after SEEN_TTL even when map is small', async () => {
    const client = getSharedAuctionWsClient('ws://localhost:9999');
    const received: unknown[] = [];
    client.addMessageListener((msg) => received.push(msg));

    const msg = {
      id: 'ttl-expire-1',
      type: 'auction.bids',
      auctionId: 'a1',
      bids: [
        {
          auctionId: 'a1',
          counterparty: '0x1234567890123456789012345678901234567890',
          counterpartyCollateral: '100',
        },
      ],
    };

    // First delivery — accepted
    deliverFromMesh(msg);
    await vi.waitFor(() => expect(received).toHaveLength(1));

    // Advance past SEEN_TTL (30s)
    vi.advanceTimersByTime(31_000);

    // Same ID should be accepted again after TTL expiry
    deliverFromMesh(msg);
    await vi.waitFor(() => expect(received).toHaveLength(2));
  });
});
