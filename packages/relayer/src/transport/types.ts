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

/** Optional hooks for observability. Passed at adapter creation time. */
export interface ConnectionHooks {
  /** Called after every successful send with the message type (if parseable). */
  onSend?: (msgType: string) => void;
}

/** Manages topic-based subscriptions across any transport. */
export interface SubscriptionManager {
  subscribe(topic: string, client: ClientConnection): boolean;
  unsubscribe(topic: string, client: ClientConnection): boolean;
  /** Remove client from all topics. Returns the number of topics removed. */
  unsubscribeAll(client: ClientConnection): number;
  /** Remove client from all topics matching a prefix. Returns the number of topics removed. */
  unsubscribeByPrefix(prefix: string, client: ClientConnection): number;
  /** Broadcast a message to all subscribers of a topic. Returns recipient count. */
  broadcast(topic: string, msg: unknown): number;
  /** Broadcast a pre-serialized string to all subscribers. Returns recipient count. */
  broadcastRaw(topic: string, raw: string): number;
  subscriberCount(topic: string): number;
}
