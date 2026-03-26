import type { ClientConnection, SubscriptionManager } from './types';

/**
 * In-memory topic-based subscription manager.
 * Works for single-process deployments (WebSocket, single-node NATS).
 */
export class InMemorySubscriptionManager implements SubscriptionManager {
  private topics = new Map<string, Set<ClientConnection>>();

  /** Returns true if the client was newly added (false if already subscribed). */
  subscribe(topic: string, client: ClientConnection): boolean {
    let set = this.topics.get(topic);
    if (!set) {
      set = new Set();
      this.topics.set(topic, set);
    }
    if (set.has(client)) return false;
    set.add(client);
    return true;
  }

  /** Returns true if the client was actually removed. */
  unsubscribe(topic: string, client: ClientConnection): boolean {
    const set = this.topics.get(topic);
    if (!set) return false;
    const removed = set.delete(client);
    if (set.size === 0) this.topics.delete(topic);
    return removed;
  }

  /** Remove client from all topics. Returns the number of topics removed from. */
  unsubscribeAll(client: ClientConnection): number {
    let count = 0;
    for (const [topic, set] of this.topics.entries()) {
      if (set.has(client)) {
        set.delete(client);
        count++;
        if (set.size === 0) this.topics.delete(topic);
      }
    }
    return count;
  }

  /** Remove client from all topics matching a prefix. Returns the number of topics removed from. */
  unsubscribeByPrefix(prefix: string, client: ClientConnection): number {
    let count = 0;
    for (const [topic, set] of this.topics.entries()) {
      if (topic.startsWith(prefix) && set.has(client)) {
        set.delete(client);
        count++;
        if (set.size === 0) this.topics.delete(topic);
      }
    }
    return count;
  }

  broadcast(topic: string, msg: unknown): number {
    return this.broadcastRaw(topic, JSON.stringify(msg));
  }

  broadcastRaw(topic: string, raw: string): number {
    const set = this.topics.get(topic);
    if (!set || set.size === 0) return 0;

    let count = 0;
    for (const client of set) {
      if (client.isOpen) {
        try {
          client.send(raw);
          count++;
        } catch {
          set.delete(client);
        }
      } else {
        set.delete(client);
      }
    }
    return count;
  }

  subscriberCount(topic: string): number {
    return this.topics.get(topic)?.size ?? 0;
  }
}
