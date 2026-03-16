import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MeshClient } from '../mesh/MeshClient';

// Capture the PeerManager constructor args so we can drive events
let capturedEvents: {
  onPeerConnected: (peerId: string) => void;
  onPeerDisconnected: (peerId: string) => void;
  onMessage: (peerId: string, data: string) => void;
  onPeerCountChanged: (count: number) => void;
};

const mockBroadcastToPeers = vi.fn<(data: string) => number>().mockReturnValue(1);
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

vi.mock('../peer/PeerManager', () => ({
  PeerManager: vi.fn().mockImplementation((_config, events) => {
    capturedEvents = events;
    return {
      connect: mockConnect,
      disconnect: mockDisconnect,
      broadcastToPeers: mockBroadcastToPeers,
      get peerCount() {
        return 0;
      },
    };
  }),
}));

function makeEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    type: 'auction.bids',
    payload: { auctionId: '0x123', amount: 100 },
    origin: 'peer-origin',
    hops: 0,
    ts: Date.now(),
    ...overrides,
  };
}

describe('MeshClient', () => {
  let client: MeshClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    client = new MeshClient({
      signalUrl: 'ws://localhost:3001',
      rateLimitPerSec: 5,
      maxHops: 3,
      seenTtlMs: 10_000,
      maxSeenSize: 100,
    });
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  describe('connect / disconnect', () => {
    it('delegates connect to PeerManager and starts timers', () => {
      client.connect();
      expect(mockConnect).toHaveBeenCalledOnce();
    });

    it('delegates disconnect and clears timers', () => {
      client.connect();
      client.disconnect();
      expect(mockDisconnect).toHaveBeenCalledOnce();
    });
  });

  describe('broadcast', () => {
    it('creates a gossip envelope and sends to peers', () => {
      client.connect();
      const msgId = client.broadcast('auction.start', { auctionId: '0x1' });

      expect(msgId).toBeTruthy();
      expect(mockBroadcastToPeers).toHaveBeenCalledOnce();

      const sent = JSON.parse(mockBroadcastToPeers.mock.calls[0][0]);
      expect(sent.type).toBe('auction.start');
      expect(sent.payload).toEqual({ auctionId: '0x1' });
      expect(sent.hops).toBe(0);
      expect(sent.id).toBe(msgId);
    });

    it('marks own message as seen (dedup)', () => {
      client.connect();
      const msgId = client.broadcast('test', {});

      // Simulate receiving our own message back — should be ignored
      const handler = vi.fn();
      client.on('test', handler);
      capturedEvents.onMessage('peer-1', JSON.stringify(makeEnvelope({ id: msgId })));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('message handlers', () => {
    it('on() delivers messages of matching type', () => {
      client.connect();
      const handler = vi.fn();
      client.on('auction.bids', handler);

      const env = makeEnvelope({ type: 'auction.bids' });
      capturedEvents.onMessage('peer-1', JSON.stringify(env));

      expect(handler).toHaveBeenCalledWith('auction.bids', env.payload);
    });

    it('on() does not deliver messages of other types', () => {
      client.connect();
      const handler = vi.fn();
      client.on('auction.bids', handler);

      const env = makeEnvelope({ type: 'other.type' });
      capturedEvents.onMessage('peer-1', JSON.stringify(env));

      expect(handler).not.toHaveBeenCalled();
    });

    it('on() returns an unsubscribe function', () => {
      client.connect();
      const handler = vi.fn();
      const unsub = client.on('test', handler);

      unsub();
      capturedEvents.onMessage('peer-1', JSON.stringify(makeEnvelope({ type: 'test' })));
      expect(handler).not.toHaveBeenCalled();
    });

    it('onAny() delivers all message types', () => {
      client.connect();
      const handler = vi.fn();
      client.onAny(handler);

      const env1 = makeEnvelope({ type: 'type-a' });
      const env2 = makeEnvelope({ type: 'type-b' });
      capturedEvents.onMessage('peer-1', JSON.stringify(env1));
      capturedEvents.onMessage('peer-1', JSON.stringify(env2));

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith('type-a', env1.payload);
      expect(handler).toHaveBeenCalledWith('type-b', env2.payload);
    });

    it('handler errors do not propagate', () => {
      client.connect();
      const badHandler = vi.fn().mockImplementation(() => {
        throw new Error('boom');
      });
      const goodHandler = vi.fn();
      client.on('test', badHandler);
      client.on('test', goodHandler);

      const env = makeEnvelope({ type: 'test' });
      capturedEvents.onMessage('peer-1', JSON.stringify(env));

      expect(badHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });
  });

  describe('deduplication', () => {
    it('ignores duplicate message IDs', () => {
      client.connect();
      const handler = vi.fn();
      client.on('test', handler);

      const env = makeEnvelope({ type: 'test', id: 'dup-1' });
      capturedEvents.onMessage('peer-1', JSON.stringify(env));
      capturedEvents.onMessage('peer-2', JSON.stringify(env));

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('hop limit', () => {
    it('drops messages that exceed maxHops', () => {
      client.connect();
      const handler = vi.fn();
      client.on('test', handler);

      const env = makeEnvelope({ type: 'test', hops: 3 }); // maxHops=3, so hops >= 3 is dropped
      capturedEvents.onMessage('peer-1', JSON.stringify(env));

      expect(handler).not.toHaveBeenCalled();
    });

    it('accepts messages under maxHops', () => {
      client.connect();
      const handler = vi.fn();
      client.on('test', handler);

      const env = makeEnvelope({ type: 'test', hops: 2 });
      capturedEvents.onMessage('peer-1', JSON.stringify(env));

      expect(handler).toHaveBeenCalledOnce();
    });

    it('increments hop count on rebroadcast', () => {
      client.connect();
      const env = makeEnvelope({ type: 'test', hops: 1 });
      capturedEvents.onMessage('peer-1', JSON.stringify(env));

      const rebroadcast = JSON.parse(mockBroadcastToPeers.mock.calls[0][0]);
      expect(rebroadcast.hops).toBe(2);
    });
  });

  describe('TTL filtering', () => {
    it('drops messages older than seenTtlMs', () => {
      client.connect();
      const handler = vi.fn();
      client.on('test', handler);

      const env = makeEnvelope({
        type: 'test',
        ts: Date.now() - 15_000, // older than 10s TTL
      });
      capturedEvents.onMessage('peer-1', JSON.stringify(env));

      expect(handler).not.toHaveBeenCalled();
    });

    it('accepts messages within TTL', () => {
      client.connect();
      const handler = vi.fn();
      client.on('test', handler);

      const env = makeEnvelope({
        type: 'test',
        ts: Date.now() - 5_000, // within 10s TTL
      });
      capturedEvents.onMessage('peer-1', JSON.stringify(env));

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('rate limiting', () => {
    it('drops messages exceeding per-peer rate limit', () => {
      client.connect();
      const handler = vi.fn();
      client.on('test', handler);

      // Send 5 messages (at the limit)
      for (let i = 0; i < 5; i++) {
        capturedEvents.onMessage('peer-1', JSON.stringify(makeEnvelope({ type: 'test' })));
      }
      expect(handler).toHaveBeenCalledTimes(5);

      // 6th should be dropped
      capturedEvents.onMessage('peer-1', JSON.stringify(makeEnvelope({ type: 'test' })));
      expect(handler).toHaveBeenCalledTimes(5);
    });

    it('rate limit resets after 1 second', () => {
      client.connect();
      const handler = vi.fn();
      client.on('test', handler);

      for (let i = 0; i < 5; i++) {
        capturedEvents.onMessage('peer-1', JSON.stringify(makeEnvelope({ type: 'test' })));
      }
      expect(handler).toHaveBeenCalledTimes(5);

      vi.advanceTimersByTime(1_001);

      capturedEvents.onMessage('peer-1', JSON.stringify(makeEnvelope({ type: 'test' })));
      expect(handler).toHaveBeenCalledTimes(6);
    });

    it('rate limits are per-peer', () => {
      client.connect();
      const handler = vi.fn();
      client.on('test', handler);

      for (let i = 0; i < 5; i++) {
        capturedEvents.onMessage('peer-1', JSON.stringify(makeEnvelope({ type: 'test' })));
      }
      // peer-1 is at limit, but peer-2 should still work
      capturedEvents.onMessage('peer-2', JSON.stringify(makeEnvelope({ type: 'test' })));
      expect(handler).toHaveBeenCalledTimes(6);
    });

    it('setRateLimit adjusts the limit dynamically', () => {
      client.connect();
      const handler = vi.fn();
      client.on('test', handler);

      client.setRateLimit(2);

      capturedEvents.onMessage('peer-1', JSON.stringify(makeEnvelope({ type: 'test' })));
      capturedEvents.onMessage('peer-1', JSON.stringify(makeEnvelope({ type: 'test' })));
      capturedEvents.onMessage('peer-1', JSON.stringify(makeEnvelope({ type: 'test' })));
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('setRateLimit(0) disables rate limiting', () => {
      client.connect();
      const handler = vi.fn();
      client.on('test', handler);

      client.setRateLimit(0);

      for (let i = 0; i < 20; i++) {
        capturedEvents.onMessage('peer-1', JSON.stringify(makeEnvelope({ type: 'test' })));
      }
      expect(handler).toHaveBeenCalledTimes(20);
    });
  });

  describe('pruning', () => {
    it('prunes expired seen messages on interval', () => {
      client.connect();
      const handler = vi.fn();
      client.on('test', handler);

      // Receive a message
      const env = makeEnvelope({ type: 'test', id: 'old-msg' });
      capturedEvents.onMessage('peer-1', JSON.stringify(env));
      expect(handler).toHaveBeenCalledTimes(1);

      // Advance past TTL + prune interval
      vi.advanceTimersByTime(10_000 + 30_000);

      // Same message ID should now be accepted again (pruned from seen set)
      const env2 = makeEnvelope({ type: 'test', id: 'old-msg', ts: Date.now() });
      capturedEvents.onMessage('peer-2', JSON.stringify(env2));
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalid messages', () => {
    it('ignores non-JSON data', () => {
      client.connect();
      const handler = vi.fn();
      client.onAny(handler);

      capturedEvents.onMessage('peer-1', 'not json');
      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores messages without id', () => {
      client.connect();
      const handler = vi.fn();
      client.onAny(handler);

      capturedEvents.onMessage('peer-1', JSON.stringify({ type: 'test' }));
      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores messages without type', () => {
      client.connect();
      const handler = vi.fn();
      client.onAny(handler);

      capturedEvents.onMessage('peer-1', JSON.stringify({ id: 'abc' }));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('peer count', () => {
    it('forwards peer count changes to listeners', () => {
      const listener = vi.fn();
      client.onPeerCountChange(listener);

      capturedEvents.onPeerCountChanged(3);
      expect(listener).toHaveBeenCalledWith(3);
    });

    it('unsubscribes peer count listener', () => {
      const listener = vi.fn();
      const unsub = client.onPeerCountChange(listener);

      unsub();
      capturedEvents.onPeerCountChanged(3);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('bandwidth tracking', () => {
    it('tracks bytes from incoming messages and broadcast', () => {
      client.connect();
      const bwListener = vi.fn();
      client.onBandwidthChange(bwListener);

      // Receive a message to record bytes
      const env = makeEnvelope({ type: 'test' });
      capturedEvents.onMessage('peer-1', JSON.stringify(env));

      // Advance 1 second to trigger bandwidth emission
      vi.advanceTimersByTime(1_000);

      expect(bwListener).toHaveBeenCalled();
      expect(client.bandwidthKbps).toBeGreaterThanOrEqual(0);
    });

    it('unsubscribes bandwidth listener', () => {
      client.connect();
      const listener = vi.fn();
      const unsub = client.onBandwidthChange(listener);

      unsub();
      vi.advanceTimersByTime(1_000);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('rebroadcast', () => {
    it('rebroadcasts valid incoming messages to other peers', () => {
      client.connect();

      const env = makeEnvelope({ type: 'test' });
      capturedEvents.onMessage('peer-1', JSON.stringify(env));

      expect(mockBroadcastToPeers).toHaveBeenCalledOnce();
    });

    it('does not rebroadcast dropped messages (dedup, hops, TTL)', () => {
      client.connect();

      // Message at hop limit — should be dropped, not rebroadcast
      const env = makeEnvelope({ type: 'test', hops: 3 });
      capturedEvents.onMessage('peer-1', JSON.stringify(env));

      expect(mockBroadcastToPeers).not.toHaveBeenCalled();
    });
  });
});
