import { describe, it, expect } from 'vitest';
import { Counter, Gauge, Histogram } from 'prom-client';
import {
  register,
  activeConnections,
  connectionsTotal,
  connectionsClosed,
  messagesReceived,
  messagesSent,
  messageProcessingDuration,
  rateLimitHits,
  auctionsStarted,
  bidsSubmitted,
  vaultQuotesPublished,
  errorsTotal,
  subscriptionsActive,
  getMetrics,
} from '../metrics';

describe('Metrics', () => {
  describe('Registry', () => {
    it('has default label app=relayer', async () => {
      const output = await register.metrics();
      // Default labels appear in every metric line
      expect(output).toContain('app="relayer"');
    });
  });

  describe('Connection Metrics', () => {
    it('activeConnections is a Gauge with correct name', () => {
      expect(activeConnections).toBeInstanceOf(Gauge);
      // @ts-expect-error - accessing internal name for test verification
      expect((activeConnections as { name: string }).name).toBe(
        'relayer_connections_active'
      );
    });

    it('connectionsTotal is a Counter with correct name', () => {
      expect(connectionsTotal).toBeInstanceOf(Counter);
      // @ts-expect-error - accessing internal name for test verification
      expect((connectionsTotal as { name: string }).name).toBe(
        'relayer_connections_total'
      );
    });

    it('connectionsClosed is a Counter with label "reason"', () => {
      expect(connectionsClosed).toBeInstanceOf(Counter);
      // @ts-expect-error - accessing internal name for test verification
      expect((connectionsClosed as { name: string }).name).toBe(
        'relayer_connections_closed_total'
      );
      // Verify it accepts the reason label without error
      connectionsClosed.inc({ reason: 'test' });
    });
  });

  describe('Message Metrics', () => {
    it('messagesReceived is a Counter with label "type"', () => {
      expect(messagesReceived).toBeInstanceOf(Counter);
      messagesReceived.inc({ type: 'test' });
    });

    it('messagesSent is a Counter with label "type"', () => {
      expect(messagesSent).toBeInstanceOf(Counter);
      messagesSent.inc({ type: 'test' });
    });

    it('messageProcessingDuration is a Histogram with label "type"', () => {
      expect(messageProcessingDuration).toBeInstanceOf(Histogram);
      messageProcessingDuration.observe({ type: 'test' }, 0.01);
    });
  });

  describe('Rate Limiting Metrics', () => {
    it('rateLimitHits is a Counter', () => {
      expect(rateLimitHits).toBeInstanceOf(Counter);
      rateLimitHits.inc();
    });
  });

  describe('Auction Metrics', () => {
    it('auctionsStarted is a Counter', () => {
      expect(auctionsStarted).toBeInstanceOf(Counter);
      auctionsStarted.inc();
    });

    it('bidsSubmitted is a Counter with label "status"', () => {
      expect(bidsSubmitted).toBeInstanceOf(Counter);
      bidsSubmitted.inc({ status: 'success' });
      bidsSubmitted.inc({ status: 'error' });
      bidsSubmitted.inc({ status: 'rejected' });
    });

    it('vaultQuotesPublished is a Counter with label "status"', () => {
      expect(vaultQuotesPublished).toBeInstanceOf(Counter);
      vaultQuotesPublished.inc({ status: 'success' });
      vaultQuotesPublished.inc({ status: 'error' });
      vaultQuotesPublished.inc({ status: 'unauthorized' });
    });
  });

  describe('Error Metrics', () => {
    it('errorsTotal is a Counter with labels "type" and "message_type"', () => {
      expect(errorsTotal).toBeInstanceOf(Counter);
      errorsTotal.inc({ type: 'validation', message_type: 'test' });
    });
  });

  describe('Subscription Metrics', () => {
    it('subscriptionsActive is a Gauge with label "subscription_type"', () => {
      expect(subscriptionsActive).toBeInstanceOf(Gauge);
      subscriptionsActive.inc({ subscription_type: 'auction' });
      subscriptionsActive.dec({ subscription_type: 'auction' });
      subscriptionsActive.inc({ subscription_type: 'vault' });
      subscriptionsActive.dec({ subscription_type: 'vault' });
    });
  });

  describe('Gauge operations', () => {
    it('supports inc and dec on Gauge metrics', () => {
      activeConnections.inc();
      activeConnections.inc();
      activeConnections.dec();
      // No error means success
    });
  });

  describe('getMetrics()', () => {
    it('returns valid Prometheus exposition format', async () => {
      const output = await getMetrics();
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
      // Should contain HELP lines
      expect(output).toContain('# HELP');
      // Should contain TYPE lines
      expect(output).toContain('# TYPE');
      // Should contain our metric names
      expect(output).toContain('relayer_connections_active');
      expect(output).toContain('relayer_connections_total');
      expect(output).toContain('relayer_messages_received_total');
      expect(output).toContain('relayer_messages_sent_total');
      expect(output).toContain('relayer_message_processing_duration_seconds');
      expect(output).toContain('relayer_rate_limit_hits_total');
      expect(output).toContain('relayer_auctions_started_total');
      expect(output).toContain('relayer_bids_submitted_total');
      expect(output).toContain('relayer_vault_quotes_published_total');
      expect(output).toContain('relayer_errors_total');
      expect(output).toContain('relayer_subscriptions_active');
      expect(output).toContain('relayer_connections_closed_total');
    });
  });
});
