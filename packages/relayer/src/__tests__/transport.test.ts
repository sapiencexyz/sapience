import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemorySubscriptionManager } from '../transport/subscriptions';
import type { ClientConnection } from '../transport/types';

function mockClient(id = crypto.randomUUID(), open = true): ClientConnection {
  return {
    id,
    send: vi.fn(),
    close: vi.fn(),
    get isOpen() {
      return open;
    },
  };
}

describe('InMemorySubscriptionManager', () => {
  let subs: InMemorySubscriptionManager;

  beforeEach(() => {
    subs = new InMemorySubscriptionManager();
  });

  it('subscribe + broadcast delivers to subscriber', () => {
    const client = mockClient();
    subs.subscribe('topic:1', client);

    const count = subs.broadcast('topic:1', { type: 'test' });
    expect(count).toBe(1);
    expect(client.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test' }));
  });

  it('broadcast returns 0 for empty topic', () => {
    const count = subs.broadcast('topic:empty', { type: 'test' });
    expect(count).toBe(0);
  });

  it('unsubscribe removes client from topic', () => {
    const client = mockClient();
    subs.subscribe('topic:1', client);
    subs.unsubscribe('topic:1', client);

    const count = subs.broadcast('topic:1', { type: 'test' });
    expect(count).toBe(0);
    expect(client.send).not.toHaveBeenCalled();
  });

  it('unsubscribeAll removes client from all topics', () => {
    const client = mockClient();
    subs.subscribe('topic:1', client);
    subs.subscribe('topic:2', client);
    subs.subscribe('topic:3', client);

    subs.unsubscribeAll(client);

    expect(subs.subscriberCount('topic:1')).toBe(0);
    expect(subs.subscriberCount('topic:2')).toBe(0);
    expect(subs.subscriberCount('topic:3')).toBe(0);
  });

  it('multiple clients receive broadcast', () => {
    const c1 = mockClient('c1');
    const c2 = mockClient('c2');
    subs.subscribe('topic:1', c1);
    subs.subscribe('topic:1', c2);

    const count = subs.broadcast('topic:1', { data: 'hello' });
    expect(count).toBe(2);
    expect(c1.send).toHaveBeenCalledTimes(1);
    expect(c2.send).toHaveBeenCalledTimes(1);
  });

  it('skips closed clients during broadcast', () => {
    const open = mockClient('open', true);
    const closed = mockClient('closed', false);
    subs.subscribe('topic:1', open);
    subs.subscribe('topic:1', closed);

    const count = subs.broadcast('topic:1', { type: 'test' });
    expect(count).toBe(1);
    expect(open.send).toHaveBeenCalledTimes(1);
    expect(closed.send).not.toHaveBeenCalled();
  });

  it('removes client that throws on send during broadcast', () => {
    const good = mockClient('good');
    const bad = mockClient('bad');
    (bad.send as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('connection dead');
    });

    subs.subscribe('topic:1', good);
    subs.subscribe('topic:1', bad);

    const count = subs.broadcast('topic:1', { type: 'test' });
    expect(count).toBe(1);
    // After broadcast, bad should be pruned
    expect(subs.subscriberCount('topic:1')).toBe(1);
  });

  it('subscriberCount returns correct counts', () => {
    const c1 = mockClient('c1');
    const c2 = mockClient('c2');

    expect(subs.subscriberCount('topic:1')).toBe(0);
    subs.subscribe('topic:1', c1);
    expect(subs.subscriberCount('topic:1')).toBe(1);
    subs.subscribe('topic:1', c2);
    expect(subs.subscriberCount('topic:1')).toBe(2);
    subs.unsubscribe('topic:1', c1);
    expect(subs.subscriberCount('topic:1')).toBe(1);
  });

  it('broadcastRaw sends pre-serialized strings', () => {
    const client = mockClient();
    subs.subscribe('topic:1', client);

    const raw = '{"type":"raw_test"}';
    const count = subs.broadcastRaw('topic:1', raw);
    expect(count).toBe(1);
    expect(client.send).toHaveBeenCalledWith(raw);
  });

  it('idempotent subscribe does not duplicate', () => {
    const client = mockClient();
    subs.subscribe('topic:1', client);
    subs.subscribe('topic:1', client);

    expect(subs.subscriberCount('topic:1')).toBe(1);
    const count = subs.broadcast('topic:1', { type: 'test' });
    expect(count).toBe(1);
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe from non-existent topic is no-op', () => {
    const client = mockClient();
    expect(() => subs.unsubscribe('does-not-exist', client)).not.toThrow();
  });

  it('cleans up empty topic sets after last unsubscribe', () => {
    const client = mockClient();
    subs.subscribe('topic:cleanup', client);
    subs.unsubscribe('topic:cleanup', client);
    // Internal: topic should be removed (subscriberCount returns 0)
    expect(subs.subscriberCount('topic:cleanup')).toBe(0);
  });
});
