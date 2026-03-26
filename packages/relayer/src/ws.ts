/**
 * WebSocket dispatch layer.
 *
 * Thin entry point that accepts WS connections, JSON-parses messages,
 * rate-limits, and dispatches to handler functions. All business logic
 * lives in handlers/ — this file only owns transport lifecycle.
 */

import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage } from 'http';
import { createWsClientConnection } from './transport/wsTransport';
import { InMemorySubscriptionManager } from './transport/subscriptions';
import type { ClientConnection } from './transport/types';
import {
  handleAuctionStart,
  handleAuctionSubscribe,
  handleAuctionUnsubscribe,
  handleBidSubmit,
} from './handlers/escrow';
import {
  handleVaultObserve,
  handleVaultUnobserve,
  handleVaultSubscribe,
  handleVaultUnsubscribe,
  handleVaultQuotePublish,
} from './handlers/vault';
import type {
  ClientToServerMessage,
  AuctionRFQPayload,
  BidPayload,
} from './escrowTypes';
import { isEscrowClientMessage } from './escrowTypes';
import { isSecondaryClientMessage } from './secondaryMarketTypes';
import {
  handleSecondaryAuctionStart,
  handleSecondaryBidSubmit,
  handleSecondarySubscribe,
  handleSecondaryUnsubscribe,
  handleSecondaryFeedSubscribe,
  handleSecondaryFeedUnsubscribe,
  handleSecondaryListingsRequest,
} from './secondaryMarketHandlers';
import {
  activeConnections,
  connectionsTotal,
  connectionsClosed,
  messagesReceived,
  messagesSent,
  messageProcessingDuration,
  rateLimitHits,
  errorsTotal,
  subscriptionsActive,
} from './metrics';
import { config } from './config';
import Sentry from './instrument';

// ============================================================================
// Helpers
// ============================================================================

function safeParse<T = unknown>(data: RawData): T | null {
  try {
    return JSON.parse(String(data)) as T;
  } catch {
    return null;
  }
}

function trackDuration(msgType: string, startTime: number): void {
  const duration = (Date.now() - startTime) / 1000;
  messageProcessingDuration.observe({ type: msgType }, duration);
}

// ============================================================================
// Server factory
// ============================================================================

const RATE_LIMIT_WINDOW_MS = config.RATE_LIMIT_WINDOW_MS;
const RATE_LIMIT_MAX_MESSAGES = config.RATE_LIMIT_MAX_MESSAGES;

export function createAuctionWebSocketServer() {
  const wss = new WebSocketServer({ noServer: true });

  let activeConnectionCount = 0;

  // Shared subscription manager for all topics (escrow, vault, observers)
  const subs = new InMemorySubscriptionManager();

  // Map ws → ClientConnection so we can look up the adapter on close
  const connectionMap = new WeakMap<WebSocket, ClientConnection>();

  // Track all active client connections for global broadcast
  const allClients = new Set<ClientConnection>();

  const handlerCtx = {
    allClients: () => allClients as Iterable<ClientConnection>,
  };

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // Connection limit
    if (activeConnectionCount >= config.WS_MAX_CONNECTIONS) {
      console.warn(
        `[Relayer] Max connections (${config.WS_MAX_CONNECTIONS}) reached, rejecting`
      );
      ws.close(1008, 'connection_limit_exceeded');
      return;
    }

    // Origin validation
    if (config.WS_ALLOWED_ORIGINS) {
      const origin = req.headers.origin;
      const allowedOrigins = config.WS_ALLOWED_ORIGINS.split(',').map((o) =>
        o.trim()
      );
      if (!origin || !allowedOrigins.includes(origin)) {
        console.warn(`[Relayer] Origin validation failed: ${origin}`);
        ws.close(1008, 'origin_not_allowed');
        return;
      }
    }

    activeConnectionCount++;
    activeConnections.inc();
    connectionsTotal.inc();

    const client = createWsClientConnection(ws, {
      onSend: (msgType) => messagesSent.inc({ type: msgType }),
    });
    connectionMap.set(ws, client);
    allClients.add(client);

    const ip =
      req.socket.remoteAddress ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      'unknown';

    // Idle timeout
    let idleTimeout: NodeJS.Timeout | null = null;
    const resetIdleTimeout = () => {
      if (idleTimeout) clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        console.log(`[Relayer] Connection idle timeout from ${ip}`);
        ws.close(1008, 'idle_timeout');
      }, config.WS_IDLE_TIMEOUT_MS);
    };

    ws.on('ping', () => resetIdleTimeout());
    ws.on('pong', () => resetIdleTimeout());
    resetIdleTimeout();

    // Rate limiting state
    let rateCount = 0;
    let rateResetAt = Date.now() + RATE_LIMIT_WINDOW_MS;

    ws.on('message', async (data: RawData) => {
      resetIdleTimeout();

      // Rate limiting
      const now = Date.now();
      if (now > rateResetAt) {
        rateCount = 0;
        rateResetAt = now + RATE_LIMIT_WINDOW_MS;
      }
      if (++rateCount > RATE_LIMIT_MAX_MESSAGES) {
        rateLimitHits.inc();
        console.warn(`[Relayer] Rate limit exceeded from ${ip}; closing`);
        try {
          ws.close(1008, 'rate_limited');
        } catch {
          /* */
        }
        return;
      }

      // Size guard
      const dataSize =
        typeof data === 'string'
          ? (data as string).length
          : (data as Buffer).byteLength;
      if (dataSize > 64_000) {
        console.warn(`[Relayer] Message too large from ${ip}; closing`);
        try {
          ws.close(1009, 'message_too_large');
        } catch {
          /* */
        }
        return;
      }

      const msg = safeParse<ClientToServerMessage | { type?: string }>(data);
      if (!msg || typeof msg !== 'object') {
        messagesReceived.inc({ type: 'invalid' });
        errorsTotal.inc({ type: 'validation', message_type: 'unknown' });
        console.warn(`[Relayer] Invalid JSON from ${ip}`);
        return;
      }

      const msgType = (msg as { type?: string })?.type || 'unknown';
      const startTime = Date.now();
      messagesReceived.inc({ type: msgType });

      // JSON-level ping/pong
      if (msgType === 'ping') {
        client.send({ type: 'pong' });
        trackDuration(msgType, startTime);
        return;
      }

      // ── Vault quote messages ──────────────────────────────────────────
      if (msgType.startsWith('vault_quote.')) {
        const payload = (msg as { payload?: unknown })?.payload;

        switch (msgType) {
          case 'vault_quote.observe':
            handleVaultObserve(client, subs);
            break;
          case 'vault_quote.unobserve':
            handleVaultUnobserve(client, subs);
            break;
          case 'vault_quote.subscribe':
            handleVaultSubscribe(
              client,
              payload as { chainId: number; vaultAddress: string } | undefined,
              subs
            );
            break;
          case 'vault_quote.unsubscribe':
            handleVaultUnsubscribe(
              client,
              payload as { chainId: number; vaultAddress: string } | undefined,
              subs
            );
            break;
          case 'vault_quote.publish':
          case 'vault_quote.submit':
            await handleVaultQuotePublish(
              client,
              payload as Parameters<typeof handleVaultQuotePublish>[1],
              subs
            );
            break;
        }
        trackDuration(msgType, startTime);
        return;
      }

      // ── Escrow auction messages ───────────────────────────────────────
      if (isEscrowClientMessage(msg)) {
        switch (msg.type) {
          case 'auction.start': {
            const requestId =
              (msg as { id?: string }).id ||
              (msg.payload as { id?: string })?.id;
            await handleAuctionStart(
              client,
              msg.payload as AuctionRFQPayload,
              subs,
              handlerCtx,
              requestId
            );
            break;
          }
          case 'auction.subscribe':
            handleAuctionSubscribe(
              client,
              (msg.payload as { auctionId?: string })?.auctionId,
              subs
            );
            break;
          case 'auction.unsubscribe':
            handleAuctionUnsubscribe(
              client,
              (msg.payload as { auctionId?: string })?.auctionId,
              subs
            );
            break;
          case 'bid.submit':
            await handleBidSubmit(client, msg.payload as BidPayload, subs);
            break;
        }
        trackDuration(msgType, startTime);
        return;
      }

      // ── Secondary market messages ─────────────────────────────────────
      if (isSecondaryClientMessage(msg) && msgType.startsWith('secondary.')) {
        const secondaryMsg =
          msg as import('@sapience/sdk/types/secondary').SecondaryClientToServerMessage;
        switch (secondaryMsg.type) {
          case 'secondary.auction.start':
            await handleSecondaryAuctionStart(
              client,
              secondaryMsg.payload,
              subs,
              handlerCtx
            );
            break;
          case 'secondary.bid.submit':
            await handleSecondaryBidSubmit(client, secondaryMsg.payload, subs);
            break;
          case 'secondary.auction.subscribe':
            handleSecondarySubscribe(client, secondaryMsg.payload, subs);
            break;
          case 'secondary.auction.unsubscribe':
            handleSecondaryUnsubscribe(client, secondaryMsg.payload, subs);
            break;
          case 'secondary.feed.subscribe':
            handleSecondaryFeedSubscribe(client, subs);
            break;
          case 'secondary.feed.unsubscribe':
            handleSecondaryFeedUnsubscribe(client, subs);
            break;
          case 'secondary.listings.request':
            handleSecondaryListingsRequest(client);
            break;
        }
        trackDuration(msgType, startTime);
        return;
      }

      // ── Unhandled ─────────────────────────────────────────────────────
      trackDuration(msgType, startTime);
      errorsTotal.inc({ type: 'unhandled_message', message_type: msgType });
      console.warn(
        `[Relayer] Unhandled message type from ${ip}: ${
          (msg as Record<string, unknown>)?.type ?? typeof msg
        }`
      );
    });

    ws.on('error', (err) => {
      errorsTotal.inc({ type: 'socket_error', message_type: 'unknown' });
      console.error(`[Relayer] Socket error from ${ip}:`, err);
      try {
        Sentry.captureException(err);
      } catch {
        /* */
      }
    });

    ws.on('close', (code, reason) => {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
        idleTimeout = null;
      }

      activeConnectionCount--;
      activeConnections.dec();
      const reasonStr = reason?.toString() ?? '';
      connectionsClosed.inc({ reason: reasonStr || `code_${code}` });
      console.log(
        `[Relayer] Socket closed from ${ip} code=${code} reason=${reasonStr}`
      );

      // Clean up subscriptions by type so metrics are properly decremented
      const auctionUnsubs = subs.unsubscribeByPrefix('auction:', client);
      for (let i = 0; i < auctionUnsubs; i++) {
        subscriptionsActive.dec({ subscription_type: 'auction' });
      }
      const vaultUnsubs = subs.unsubscribeByPrefix('vault:', client);
      for (let i = 0; i < vaultUnsubs; i++) {
        subscriptionsActive.dec({ subscription_type: 'vault' });
      }

      // Clean up secondary market subscriptions via shared sub manager
      const secondaryUnsubs = subs.unsubscribeByPrefix('secondary:', client);
      for (let i = 0; i < secondaryUnsubs; i++) {
        subscriptionsActive.dec({ subscription_type: 'secondary' });
      }

      allClients.delete(client);
      connectionMap.delete(ws);
    });
  });

  return wss;
}
