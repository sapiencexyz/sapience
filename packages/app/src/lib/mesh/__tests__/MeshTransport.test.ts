import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MeshTransport } from '../MeshTransport';

function createMockMesh() {
  const peerCountCallbacks = new Set<(count: number) => void>();
  const anyHandlers = new Set<(type: string, payload: unknown) => void>();
  const typeHandlers = new Map<
    string,
    Set<(type: string, payload: unknown) => void>
  >();

  return {
    broadcast: vi
      .fn<(type: string, payload: unknown) => string>()
      .mockReturnValue('msg-123'),
    on: vi.fn(
      (type: string, handler: (type: string, payload: unknown) => void) => {
        let set = typeHandlers.get(type);
        if (!set) {
          set = new Set();
          typeHandlers.set(type, set);
        }
        set.add(handler);
        return () => set!.delete(handler);
      }
    ),
    onAny: vi.fn((handler: (type: string, payload: unknown) => void) => {
      anyHandlers.add(handler);
      return () => anyHandlers.delete(handler);
    }),
    onPeerCountChange: vi.fn((cb: (count: number) => void) => {
      peerCountCallbacks.add(cb);
      return () => peerCountCallbacks.delete(cb);
    }),
    // Test helpers
    _emitPeerCount(count: number) {
      for (const cb of peerCountCallbacks) cb(count);
    },
    _emitAny(type: string, payload: unknown) {
      for (const h of anyHandlers) h(type, payload);
    },
    _emitType(type: string, payload: unknown) {
      const set = typeHandlers.get(type);
      if (set) for (const h of set) h(type, payload);
    },
  };
}

describe('MeshTransport', () => {
  let mesh: ReturnType<typeof createMockMesh>;
  let transport: MeshTransport;

  beforeEach(() => {
    vi.useFakeTimers();
    mesh = createMockMesh();
    transport = new MeshTransport(mesh as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('send', () => {
    it('broadcasts with the message type', () => {
      transport.send({ type: 'auction.start', auctionId: '0x1' });

      expect(mesh.broadcast).toHaveBeenCalledWith('auction.start', {
        type: 'auction.start',
        auctionId: '0x1',
      });
    });

    it('uses "unknown" when no type field present', () => {
      transport.send({ data: 'foo' });

      expect(mesh.broadcast).toHaveBeenCalledWith('unknown', { data: 'foo' });
    });
  });

  describe('sendWithAck', () => {
    it('throws because ack matching cannot work over gossip', async () => {
      await expect(
        transport.sendWithAck('bid.submit', { amount: 100 })
      ).rejects.toThrow('not supported on MeshTransport');
    });
  });

  describe('addMessageListener', () => {
    it('receives all messages via onAny', () => {
      const listener = vi.fn();
      transport.addMessageListener(listener);

      mesh._emitAny('auction.bids', { auctionId: '0x1', bids: [] });

      expect(listener).toHaveBeenCalledWith({ auctionId: '0x1', bids: [] });
    });

    it('returns an unsubscribe function', () => {
      const listener = vi.fn();
      const unsub = transport.addMessageListener(listener);

      unsub();
      mesh._emitAny('test', { data: 'hello' });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('addOpenListener', () => {
    it('fires when peer count goes from 0 to >0', () => {
      const listener = vi.fn();
      transport.addOpenListener(listener);

      mesh._emitPeerCount(1);
      expect(listener).toHaveBeenCalledOnce();
    });

    it('does not fire again while already open', () => {
      const listener = vi.fn();
      transport.addOpenListener(listener);

      mesh._emitPeerCount(1);
      mesh._emitPeerCount(2);
      mesh._emitPeerCount(3);

      expect(listener).toHaveBeenCalledOnce();
    });

    it('fires again after going back to 0', () => {
      const listener = vi.fn();
      transport.addOpenListener(listener);

      mesh._emitPeerCount(1);
      mesh._emitPeerCount(0);
      mesh._emitPeerCount(1);

      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('addCloseListener', () => {
    it('fires when peer count drops to 0 after being open', () => {
      const listener = vi.fn();
      transport.addCloseListener(listener);

      mesh._emitPeerCount(1); // open
      mesh._emitPeerCount(0); // close

      expect(listener).toHaveBeenCalledOnce();
    });

    it('does not fire if never opened', () => {
      const listener = vi.fn();
      transport.addCloseListener(listener);

      mesh._emitPeerCount(0);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('no-op listeners', () => {
    it('addReconnectListener returns an unsubscribe function', () => {
      const unsub = transport.addReconnectListener(vi.fn());
      expect(typeof unsub).toBe('function');
      unsub(); // should not throw
    });

    it('addErrorListener returns an unsubscribe function', () => {
      const unsub = transport.addErrorListener(vi.fn());
      expect(typeof unsub).toBe('function');
      unsub(); // should not throw
    });
  });
});
