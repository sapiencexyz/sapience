/**
 * Transport-agnostic abstractions for the relayer.
 *
 * These interfaces decouple handler logic from the underlying transport
 * (WebSocket today, NATS/gossip tomorrow). Handler functions receive
 * `ClientConnection` + `SubscriptionManager` — never raw WebSocket objects.
 */

/** Opaque handle to a connected client — transport-agnostic. */
export interface ClientConnection {
  readonly id: string;
  send(msg: unknown): void;
  close(code?: number, reason?: string): void;
  readonly isOpen: boolean;
}

/** Manages topic-based subscriptions across any transport. */
export interface SubscriptionManager {
  subscribe(topic: string, client: ClientConnection): void;
  unsubscribe(topic: string, client: ClientConnection): void;
  unsubscribeAll(client: ClientConnection): void;
  /** Broadcast a message to all subscribers of a topic. Returns recipient count. */
  broadcast(topic: string, msg: unknown): number;
  /** Broadcast a pre-serialized string to all subscribers. Returns recipient count. */
  broadcastRaw(topic: string, raw: string): number;
  subscriberCount(topic: string): number;
}
