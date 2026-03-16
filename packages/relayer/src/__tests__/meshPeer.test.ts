import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMeshBridgedSubs } from '../meshPeer';
import type { SubscriptionManager, ClientConnection } from '../transport/types';

function mockClient(id = 'c1'): ClientConnection {
  return {
    id,
    send: vi.fn(),
    close: vi.fn(),
    get isOpen() {
      return true;
    },
  };
}

function mockSubs(): SubscriptionManager {
  return {
    subscribe: vi.fn().mockReturnValue(true),
    unsubscribe: vi.fn().mockReturnValue(true),
    unsubscribeAll: vi.fn().mockReturnValue(1),
    unsubscribeByPrefix: vi.fn().mockReturnValue(1),
    subscriberCount: vi.fn().mockReturnValue(0),
    broadcast: vi.fn().mockReturnValue(1),
    broadcastRaw: vi.fn().mockReturnValue(1),
  };
}

function mockMesh() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    broadcast: vi.fn().mockReturnValue('msg-id'),
    onAny: vi.fn().mockReturnValue(() => {}),
    get peerCount() {
      return 2;
    },
    onPeerCountChange: vi.fn().mockReturnValue(() => {}),
  };
}

describe('createMeshBridgedSubs', () => {
  let localSubs: SubscriptionManager;
  let mesh: ReturnType<typeof mockMesh>;
  let bridged: SubscriptionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    localSubs = mockSubs();
    mesh = mockMesh();
    bridged = createMeshBridgedSubs(localSubs, mesh);
  });

  describe('passthrough methods', () => {
    it('subscribe delegates to localSubs', () => {
      const client = mockClient();
      bridged.subscribe('topic:1', client);
      expect(localSubs.subscribe).toHaveBeenCalledWith('topic:1', client);
    });

    it('unsubscribe delegates to localSubs', () => {
      const client = mockClient();
      bridged.unsubscribe('topic:1', client);
      expect(localSubs.unsubscribe).toHaveBeenCalledWith('topic:1', client);
    });

    it('unsubscribeAll delegates to localSubs', () => {
      const client = mockClient();
      bridged.unsubscribeAll(client);
      expect(localSubs.unsubscribeAll).toHaveBeenCalledWith(client);
    });

    it('unsubscribeByPrefix delegates to localSubs', () => {
      const client = mockClient();
      bridged.unsubscribeByPrefix('topic:', client);
      expect(localSubs.unsubscribeByPrefix).toHaveBeenCalledWith(
        'topic:',
        client
      );
    });

    it('subscriberCount delegates to localSubs', () => {
      bridged.subscriberCount('topic:1');
      expect(localSubs.subscriberCount).toHaveBeenCalledWith('topic:1');
    });
  });

  describe('broadcast', () => {
    it('broadcasts locally and to mesh', () => {
      const count = bridged.broadcast('auction:0x1', {
        type: 'auction.bids',
        payload: { auctionId: '0x1', bids: [] },
      });

      expect(localSubs.broadcast).toHaveBeenCalledWith('auction:0x1', {
        type: 'auction.bids',
        payload: { auctionId: '0x1', bids: [] },
      });
      expect(mesh.broadcast).toHaveBeenCalledWith('auction.bids', {
        auctionId: '0x1',
        bids: [],
      });
      expect(count).toBe(1);
    });

    it('uses topic as type when msg has no type field', () => {
      bridged.broadcast('auction:0x1', { data: 'raw' });

      expect(mesh.broadcast).toHaveBeenCalledWith('auction:0x1', {
        data: 'raw',
      });
    });

    it('uses msg directly as payload when msg has no payload field', () => {
      bridged.broadcast('topic', { type: 'test', data: 'value' });

      expect(mesh.broadcast).toHaveBeenCalledWith('test', {
        type: 'test',
        data: 'value',
      });
    });

    it('handles non-object messages', () => {
      bridged.broadcast('topic', 'raw-string');

      expect(localSubs.broadcast).toHaveBeenCalledWith('topic', 'raw-string');
      expect(mesh.broadcast).toHaveBeenCalledWith('topic', 'raw-string');
    });

    it('handles null messages', () => {
      bridged.broadcast('topic', null);

      expect(localSubs.broadcast).toHaveBeenCalledWith('topic', null);
      expect(mesh.broadcast).toHaveBeenCalledWith('topic', null);
    });
  });

  describe('broadcastRaw', () => {
    it('broadcasts raw locally and parses for mesh', () => {
      const raw = JSON.stringify({
        type: 'auction.bids',
        payload: { auctionId: '0x1' },
      });

      const count = bridged.broadcastRaw('auction:0x1', raw);

      expect(localSubs.broadcastRaw).toHaveBeenCalledWith('auction:0x1', raw);
      expect(mesh.broadcast).toHaveBeenCalledWith('auction.bids', {
        auctionId: '0x1',
      });
      expect(count).toBe(1);
    });

    it('uses topic as type when parsed JSON has no type', () => {
      const raw = JSON.stringify({ data: 'value' });
      bridged.broadcastRaw('my-topic', raw);

      expect(mesh.broadcast).toHaveBeenCalledWith('my-topic', {
        data: 'value',
      });
    });

    it('skips mesh broadcast on invalid JSON', () => {
      bridged.broadcastRaw('topic', 'not-json');

      expect(localSubs.broadcastRaw).toHaveBeenCalledWith('topic', 'not-json');
      expect(mesh.broadcast).not.toHaveBeenCalled();
    });
  });
});
