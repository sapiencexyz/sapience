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
// Error Metrics
// ============================================================================

export const errorsTotal = new Counter({
  name: 'relayer_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'message_type'], // e.g., type: 'validation', 'signature', 'internal'
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

