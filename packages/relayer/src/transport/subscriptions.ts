import type { ClientConnection, SubscriptionManager } from './types';

/**
 * In-memory topic-based subscription manager.
 * Works for single-process deployments (WebSocket, single-node NATS).
 */
export class InMemorySubscriptionManager implements SubscriptionManager {
  private topics = new Map<string, Set<ClientConnection>>();

  subscribe(topic: string, client: ClientConnection): void {
    let set = this.topics.get(topic);
    if (!set) {
      set = new Set();
      this.topics.set(topic, set);
    }
    set.add(client);
  }

  unsubscribe(topic: string, client: ClientConnection): void {
    const set = this.topics.get(topic);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) this.topics.delete(topic);
  }

  unsubscribeAll(client: ClientConnection): void {
    for (const [topic, set] of this.topics.entries()) {
      if (set.has(client)) {
        set.delete(client);
        if (set.size === 0) this.topics.delete(topic);
      }
    }
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
