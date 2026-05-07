import { Registry, Counter, Gauge, Histogram } from 'prom-client';

// Create a registry for metrics
export const register = new Registry();

// Add default Node.js metrics (CPU, memory, etc.)
register.setDefaultLabels({
  app: 'relayer',
});

// ============================================================================
// Connection Metrics
// ============================================================================

export const activeConnections = new Gauge({
  name: 'relayer_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

export const connectionsTotal = new Counter({
  name: 'relayer_connections_total',
  help: 'Total number of WebSocket connections established',
  registers: [register],
});

export const connectionsClosed = new Counter({
  name: 'relayer_connections_closed_total',
  help: 'Total number of WebSocket connections closed',
  labelNames: ['reason'],
  registers: [register],
});

// ============================================================================
// Message Metrics
// ============================================================================

export const messagesReceived = new Counter({
  name: 'relayer_messages_received_total',
  help: 'Total number of messages received',
  labelNames: ['type'],
  registers: [register],
});

export const messagesSent = new Counter({
  name: 'relayer_messages_sent_total',
  help: 'Total number of messages sent',
  labelNames: ['type'],
  registers: [register],
});

export const messageProcessingDuration = new Histogram({
  name: 'relayer_message_processing_duration_seconds',
  help: 'Duration of message processing in seconds',
  labelNames: ['type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// ============================================================================
// Rate Limiting Metrics
// ============================================================================

export const rateLimitHits = new Counter({
  name: 'relayer_rate_limit_hits_total',
  help: 'Total number of rate limit violations',
  registers: [register],
});

// ============================================================================
// Auction Operation Metrics
// ============================================================================

export const auctionsStarted = new Counter({
  name: 'relayer_auctions_started_total',
  help: 'Total number of auctions started',
  registers: [register],
});

export const auctionBroadcastSends = new Counter({
  name: 'relayer_auction_broadcast_sends_total',
  help: 'Per-client auction.started broadcast attempts',
  // service+variant are bounded via serviceLabel()/variantLabel() so cardinality
  // can't grow with arbitrary client-supplied strings.
  labelNames: ['service', 'variant', 'ok'],
  registers: [register],
});

export const auctionReceivedAcks = new Counter({
  name: 'relayer_auction_received_acks_total',
  help: 'Per-client auction.received acks gated by the broadcast ledger (proves end-to-end delivery)',
  labelNames: ['service', 'variant'],
  registers: [register],
});

export const auctionReceivedAckRejected = new Counter({
  name: 'relayer_auction_received_ack_rejected_total',
  help: 'auction.received messages dropped because the relayer never broadcast that auction to that client',
  labelNames: ['reason'], // 'not_recipient' (no broadcast record) | 'invalid_payload'
  registers: [register],
});

export const clientsIdentified = new Counter({
  name: 'relayer_clients_identified_total',
  help: 'Total identify handshakes accepted',
  labelNames: ['service', 'variant'],
  registers: [register],
});

// ============================================================================
// Service / variant label allowlists
// ============================================================================

/**
 * Bounded sets of identifier values that may appear as Prometheus label
 * values. Anything sent by a client that doesn't match collapses to
 * `'unknown'` so a misbehaving (or malicious) bot cannot blow up metric
 * cardinality by sending a fresh string on every connect.
 *
 * `service` is the logical service name (kind of bot). `variant` is the
 * strategy/vault flavor — kept orthogonal so we have at most one bot family
 * per service, and `sum by (service) (...)` reports across all variants.
 *
 * Adding a value requires a code change here AND a relayer redeploy — the
 * right tradeoff for a Prometheus label.
 */
export const KNOWN_SERVICE_LABELS = [
  'auction-bidder',
  'estimator',
  'secondary-bidder',
  'vault-quoter',
  'anonymous',
] as const;

export const KNOWN_VARIANT_LABELS = [
  'default',
  'pyth',
  'experimental',
] as const;

const KNOWN_SERVICE_LABEL_SET: ReadonlySet<string> = new Set(
  KNOWN_SERVICE_LABELS
);
const KNOWN_VARIANT_LABEL_SET: ReadonlySet<string> = new Set(
  KNOWN_VARIANT_LABELS
);

export function serviceLabel(rawService: string | undefined): string {
  if (!rawService) return 'unknown';
  return KNOWN_SERVICE_LABEL_SET.has(rawService) ? rawService : 'unknown';
}

export function variantLabel(rawVariant: string | undefined): string {
  if (!rawVariant) return 'default';
  return KNOWN_VARIANT_LABEL_SET.has(rawVariant) ? rawVariant : 'unknown';
}

export const bidsSubmitted = new Counter({
  name: 'relayer_bids_submitted_total',
  help: 'Total number of bids submitted',
  labelNames: ['status'], // 'success', 'error', 'rejected'
  registers: [register],
});

export const vaultQuotesPublished = new Counter({
  name: 'relayer_vault_quotes_published_total',
  help: 'Total number of vault quotes published',
  labelNames: ['status'], // 'success', 'error', 'unauthorized'
  registers: [register],
});

// ============================================================================
// Secondary Market Metrics
// ============================================================================

export const secondaryListingsStarted = new Counter({
  name: 'relayer_secondary_listings_started_total',
  help: 'Total number of secondary market listings created',
  registers: [register],
});

export const secondaryBidsSubmitted = new Counter({
  name: 'relayer_secondary_bids_submitted_total',
  help: 'Total number of secondary market bids submitted',
  labelNames: ['status'], // 'success', 'rejected'
  registers: [register],
});

// ============================================================================
// Error Metrics
// ============================================================================

export const errorsTotal = new Counter({
  name: 'relayer_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'message_type'], // e.g., type: 'validation', 'signature', 'internal'
  registers: [register],
});

// ============================================================================
// Committed Intent Metrics (PRD-001)
// ============================================================================

export const commitmentsSubmitted = new Counter({
  name: 'relayer_commitments_submitted_total',
  help: 'Total number of commitment.submit messages processed',
  labelNames: ['status', 'reason'], // status: accepted|rejected; reason: optional rejection reason code
  registers: [register],
});

export const quotesSubmitted = new Counter({
  name: 'relayer_committed_intent_quotes_submitted_total',
  help: 'Total number of quote.submit messages processed (committed-intent)',
  labelNames: ['status', 'reason'],
  registers: [register],
});

export const quotesCancelled = new Counter({
  name: 'relayer_committed_intent_quotes_cancelled_total',
  help: 'Total number of quote.cancel messages processed (committed-intent)',
  labelNames: ['status'],
  registers: [register],
});

/**
 * Live committed-intent exposure per counterparty.
 * Counterparty addresses are truncated to the first 10 chars to bound
 * label cardinality (still distinguishable in practice).
 */
export const committedIntentExposure = new Gauge({
  name: 'relayer_committed_intent_exposure',
  help: 'Live committed-intent exposure (sum of outstanding quote amountOut) per counterparty (truncated address)',
  labelNames: ['counterparty'],
  registers: [register],
});

// ============================================================================
// Subscription Metrics
// ============================================================================

export const subscriptionsActive = new Gauge({
  name: 'relayer_subscriptions_active',
  help: 'Number of active subscriptions',
  labelNames: ['subscription_type'], // 'auction', 'vault'
  registers: [register],
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}
