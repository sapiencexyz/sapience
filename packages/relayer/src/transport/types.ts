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
  /**
   * Mutable identity fields populated by the `identify` handshake.
   * Anonymous clients (pre-handshake or clients that never identify) carry
   * `service: 'anonymous'` so log lines always have a value.
   */
  service: string;
  /**
   * Strategy/vault flavor a bot serves (e.g. `'default'`, `'pyth'`).
   * Used in tandem with `service` to break out metrics — see
   * `KNOWN_VARIANT_LABELS` in metrics.ts.
   */
  variant: string;
  instanceId?: string;
  chainId?: number;
  /**
   * Per-auction bid counts for this connection. Used to cap how many bids a
   * single connection can place on one auction so it can't monopolize the
   * auction's bid slots with unverifiable bids. Lazily initialized by the bid
   * handlers; keyed by auctionId. Transport-agnostic and never serialized.
   */
  bidCounts?: Map<string, number>;
  /** @returns `true` if the underlying transport accepted the message synchronously. */
  send(msg: unknown): boolean;
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
