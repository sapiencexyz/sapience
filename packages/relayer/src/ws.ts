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
  handleIdentify,
  handleAuctionReceived,
} from './handlers/escrow';
import {
  handleVaultObserve,
  handleVaultUnobserve,
  handleVaultSubscribe,
  handleVaultUnsubscribe,
  handleVaultQuotePublish,
} from './handlers/vault';
import {
  handleCommitmentSubmit,
  handleCommitmentSubscribe,
  handleCommitmentUnsubscribe,
  handleQuoteSubmit,
  handleQuoteCancel,
} from './handlers/committedIntent';
import type {
  ClientToServerMessage,
  AuctionRFQPayload,
  BidPayload,
} from './escrowTypes';
import { isEscrowClientMessage } from './escrowTypes';
import { isCommittedIntentClientMessage } from './committedIntentTypes';
import { pruneExpired } from './committedIntentRegistry';
import { MIRROR_TOPIC } from './publicMirror';
import type {
  SignedCommitmentJson,
  SignedQuoteJson,
  QuoteCancelJson,
} from './committedIntentTypes';
import { isSecondaryClientMessage } from './secondaryMarketTypes';
import { getProviderForChain } from './utils/getProviderForChain';
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

  // Per-IP connection tracking
  const connectionsPerIp = new Map<string, number>();

  // Per-IP penalty cooldown — IPs disconnected for abuse can't reconnect immediately
  const penaltyCooldowns = new Map<string, number>(); // ip → cooldown expiry timestamp

  // Sweep expired penalty cooldowns every 60s to prevent unbounded map growth
  const penaltySweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, expiry] of penaltyCooldowns) {
      if (now >= expiry) penaltyCooldowns.delete(ip);
    }
  }, 60_000);
  penaltySweepInterval.unref(); // don't keep the process alive for cleanup

  // Shared subscription manager for all topics (escrow, vault, observers)
  const subs = new InMemorySubscriptionManager();

  // Map ws → ClientConnection so we can look up the adapter on close
  const connectionMap = new WeakMap<WebSocket, ClientConnection>();

  // Track all active client connections for global broadcast
  const allClients = new Set<ClientConnection>();

  const handlerCtx = {
    allClients: () => allClients as Iterable<ClientConnection>,
  };

  // Committed-intent handler context — injected on every committed-intent
  // message dispatch below. Includes a simple `setTimeout`-backed TTL
  // scheduler so expired registry records get pruned after grace period.
  const ciHandlerCtx = {
    allClients: () => allClients as Iterable<ClientConnection>,
    scheduleExpiry: (_commitmentHash: string, deadlineMs: number) => {
      const delay = Math.max(0, deadlineMs - Date.now());
      // Cap to 2**31-1 to satisfy setTimeout.
      const clamped = Math.min(delay, 2_147_483_000);
      const t = setTimeout(() => {
        pruneExpired();
      }, clamped);
      t.unref?.();
    },
    // Resolve a chain-bound viem public client for signature verification +
    // quality-gate reads (e.g. token-pair lookup on the executor).
    resolvePublicClient: (chainId: number) => {
      try {
        return getProviderForChain(chainId);
      } catch {
        return undefined;
      }
    },
    // Resolve the on-chain CounterpartyVault balance for a given counterparty
    // address. Without this, the exposure gate treats balance as 0 and rejects
    // every quote with `exposure_exceeds_leverage`.
    resolveVaultBalance: async (counterparty: string): Promise<bigint> => {
      const vaultAddr = process.env.COUNTERPARTY_VAULT_ADDRESS as
        | `0x${string}`
        | undefined;
      if (
        !vaultAddr ||
        vaultAddr === '0x0000000000000000000000000000000000000000'
      ) {
        return 0n;
      }
      const chainId = Number(
        process.env.DEFAULT_CHAIN_ID ?? process.env.CHAIN_ID ?? 0
      );
      if (!chainId) return 0n;
      try {
        const pc = getProviderForChain(chainId);
        const balance = (await pc.readContract({
          address: vaultAddr,
          abi: [
            {
              type: 'function',
              name: 'balanceOf',
              stateMutability: 'view',
              inputs: [{ name: 'account', type: 'address' }],
              outputs: [{ name: '', type: 'uint256' }],
            },
          ] as const,
          functionName: 'balanceOf',
          args: [counterparty as `0x${string}`],
        })) as bigint;
        return balance;
      } catch {
        return 0n;
      }
    },
  };

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // Railway (our reverse proxy) appends the real client IP as the rightmost
    // entry in x-forwarded-for. Take that entry so clients can't spoof their IP
    // by prepending a fake value.
    const forwardedFor = (req.headers['x-forwarded-for'] as string)
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ip =
      (forwardedFor && forwardedFor.length > 0
        ? forwardedFor[forwardedFor.length - 1]
        : undefined) ||
      req.socket.remoteAddress ||
      'unknown';

    // Global connection limit
    if (activeConnectionCount >= config.WS_MAX_CONNECTIONS) {
      console.warn(
        `[Relayer] Max connections (${config.WS_MAX_CONNECTIONS}) reached, rejecting`
      );
      ws.close(1008, 'connection_limit_exceeded');
      return;
    }

    // Per-IP penalty cooldown — reject if recently disconnected for abuse
    const cooldownExpiry = penaltyCooldowns.get(ip);
    if (cooldownExpiry && Date.now() < cooldownExpiry) {
      console.warn(`[Relayer] IP ${ip} in penalty cooldown, rejecting`);
      ws.close(1008, 'penalty_cooldown');
      return;
    }
    // Clean up expired cooldowns lazily
    if (cooldownExpiry) penaltyCooldowns.delete(ip);

    // Per-IP connection limit
    const ipCount = connectionsPerIp.get(ip) ?? 0;
    if (ipCount >= config.WS_MAX_CONNECTIONS_PER_IP) {
      console.warn(
        `[Relayer] Per-IP limit (${config.WS_MAX_CONNECTIONS_PER_IP}) reached for ${ip}, rejecting`
      );
      ws.close(1008, 'ip_connection_limit');
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
    connectionsPerIp.set(ip, ipCount + 1);
    activeConnections.inc();
    connectionsTotal.inc();

    const client = createWsClientConnection(ws, {
      onSend: (msgType) => messagesSent.inc({ type: msgType }),
    });
    connectionMap.set(ws, client);
    allClients.add(client);
    console.log(
      `[Relayer] client.connected clientId=${client.id.slice(0, 8)} ip=${ip}`
    );

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

    // Penalty counters — disconnect abusive clients
    let invalidMessageCount = 0;
    let validationFailureCount = 0;

    const penaltyDisconnect = (reason: string) => {
      // 60-second cooldown before this IP can reconnect
      penaltyCooldowns.set(ip, Date.now() + 60_000);
      try {
        ws.close(1008, reason);
      } catch {
        /* */
      }
    };

    ws.on('message', async (data: RawData) => {
      try {
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
          invalidMessageCount++;
          if (invalidMessageCount > config.WS_MAX_INVALID_MESSAGES) {
            console.warn(
              `[Relayer] Too many invalid messages from ${ip}; closing`
            );
            penaltyDisconnect('too_many_invalid_messages');
            return;
          }
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
                payload as
                  | { chainId: number; vaultAddress: string }
                  | undefined,
                subs
              );
              break;
            case 'vault_quote.unsubscribe':
              handleVaultUnsubscribe(
                client,
                payload as
                  | { chainId: number; vaultAddress: string }
                  | undefined,
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
          // Guard: all escrow messages except ping require a payload object
          if (
            msg.type !== 'ping' &&
            (!msg.payload || typeof msg.payload !== 'object')
          ) {
            invalidMessageCount++;
            if (invalidMessageCount > config.WS_MAX_INVALID_MESSAGES) {
              console.warn(
                `[Relayer] Too many invalid messages from ${ip}; closing`
              );
              penaltyDisconnect('too_many_invalid_messages');
              return;
            }
            client.send({
              type: 'error',
              payload: {
                message: 'missing or invalid payload',
                code: 'invalid_payload',
              },
            });
            trackDuration(msgType, startTime);
            return;
          }

          let handlerFailed = false;
          switch (msg.type) {
            case 'auction.start': {
              const requestId =
                (msg as { id?: string }).id ||
                (msg.payload as { id?: string })?.id;
              handlerFailed = await handleAuctionStart(
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
              handlerFailed = await handleBidSubmit(
                client,
                msg.payload as BidPayload,
                subs
              );
              break;
            case 'identify':
              handleIdentify(
                client,
                msg.payload as Parameters<typeof handleIdentify>[1]
              );
              break;
            case 'auction.received':
              handleAuctionReceived(
                client,
                msg.payload as Parameters<typeof handleAuctionReceived>[1]
              );
              break;
          }

          // Track validation failures and disconnect abusive clients
          if (handlerFailed) {
            validationFailureCount++;
            if (validationFailureCount > config.WS_MAX_VALIDATION_FAILURES) {
              console.warn(
                `[Relayer] Too many validation failures from ${ip}; closing`
              );
              penaltyDisconnect('too_many_validation_failures');
              return;
            }
          }

          trackDuration(msgType, startTime);
          return;
        }

        // ── Secondary market messages ─────────────────────────────────────
        if (isSecondaryClientMessage(msg) && msgType.startsWith('secondary.')) {
          // Guard: secondary messages require payload (except feed/listings which may not)
          const needsPayload =
            !msgType.endsWith('.subscribe') &&
            !msgType.endsWith('.unsubscribe') &&
            !msgType.endsWith('.request');
          const msgPayload = (msg as Record<string, unknown>).payload;
          if (needsPayload && (!msgPayload || typeof msgPayload !== 'object')) {
            client.send({
              type: 'error',
              payload: {
                message: 'missing or invalid payload',
                code: 'invalid_payload',
              },
            });
            trackDuration(msgType, startTime);
            return;
          }

          const secondaryMsg =
            msg as import('@sapience/sdk/types/secondary').SecondaryClientToServerMessage;
          let secondaryHandlerFailed = false;
          switch (secondaryMsg.type) {
            case 'secondary.auction.start':
              secondaryHandlerFailed = await handleSecondaryAuctionStart(
                client,
                secondaryMsg.payload,
                subs,
                handlerCtx
              );
              break;
            case 'secondary.bid.submit':
              secondaryHandlerFailed = await handleSecondaryBidSubmit(
                client,
                secondaryMsg.payload,
                subs
              );
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

          // Track validation failures and disconnect abusive clients
          if (secondaryHandlerFailed) {
            validationFailureCount++;
            if (validationFailureCount > config.WS_MAX_VALIDATION_FAILURES) {
              console.warn(
                `[Relayer] Too many validation failures from ${ip}; closing`
              );
              penaltyDisconnect('too_many_validation_failures');
              return;
            }
          }

          trackDuration(msgType, startTime);
          return;
        }

        // ── Committed-Intent messages (PRD-001) ───────────────────────────
        if (isCommittedIntentClientMessage(msg)) {
          const requestId = (msg as { id?: string }).id;

          // Feature flag gate — if off, respond with a disabled error for
          // every message type and count as a validation failure.
          if (!config.COMMITTED_INTENT_ENABLED) {
            const ackType: 'commitment.ack' | 'quote.ack' =
              msg.type === 'quote.submit' || msg.type === 'quote.cancel'
                ? 'quote.ack'
                : 'commitment.ack';
            client.send({
              type: ackType,
              payload: {
                error: 'committed_intent_disabled',
                ...(requestId ? { id: requestId } : {}),
              },
            });
            validationFailureCount++;
            if (validationFailureCount > config.WS_MAX_VALIDATION_FAILURES) {
              console.warn(
                `[Relayer] Too many validation failures from ${ip}; closing`
              );
              penaltyDisconnect('too_many_validation_failures');
              return;
            }
            trackDuration(msgType, startTime);
            return;
          }

          // Guard: every committed-intent message requires a payload object.
          const msgPayload = (msg as { payload?: unknown }).payload;
          if (!msgPayload || typeof msgPayload !== 'object') {
            invalidMessageCount++;
            if (invalidMessageCount > config.WS_MAX_INVALID_MESSAGES) {
              penaltyDisconnect('too_many_invalid_messages');
              return;
            }
            client.send({
              type: 'error',
              payload: {
                message: 'missing or invalid payload',
                code: 'invalid_payload',
              },
            });
            trackDuration(msgType, startTime);
            return;
          }

          let ciHandlerFailed = false;
          switch (msg.type) {
            case 'commitment.submit':
              ciHandlerFailed = await handleCommitmentSubmit(
                client,
                msgPayload as SignedCommitmentJson,
                subs,
                ciHandlerCtx,
                requestId
              );
              break;
            case 'commitment.subscribe':
              ciHandlerFailed = handleCommitmentSubscribe(
                client,
                (msgPayload as { commitmentHash?: string }).commitmentHash,
                subs
              );
              break;
            case 'commitment.unsubscribe':
              ciHandlerFailed = handleCommitmentUnsubscribe(
                client,
                (msgPayload as { commitmentHash?: string }).commitmentHash,
                subs
              );
              break;
            case 'quote.submit':
              ciHandlerFailed = await handleQuoteSubmit(
                client,
                msgPayload as SignedQuoteJson,
                subs,
                ciHandlerCtx,
                requestId
              );
              break;
            case 'quote.cancel':
              ciHandlerFailed = await handleQuoteCancel(
                client,
                msgPayload as QuoteCancelJson,
                subs,
                ciHandlerCtx,
                requestId
              );
              break;
          }

          if (ciHandlerFailed) {
            validationFailureCount++;
            if (validationFailureCount > config.WS_MAX_VALIDATION_FAILURES) {
              console.warn(
                `[Relayer] Too many validation failures from ${ip}; closing`
              );
              penaltyDisconnect('too_many_validation_failures');
              return;
            }
          }
          trackDuration(msgType, startTime);
          return;
        }

        // ── Public mirror opt-in subscription ─────────────────────────────
        // Thin helper for executors wanting the §4.9 public feed.
        if (
          msgType === 'mirror.subscribe' ||
          msgType === 'mirror.unsubscribe'
        ) {
          if (!config.COMMITTED_INTENT_ENABLED) {
            client.send({
              type: 'error',
              payload: {
                message: 'committed_intent_disabled',
                code: 'committed_intent_disabled',
              },
            });
            trackDuration(msgType, startTime);
            return;
          }
          if (msgType === 'mirror.subscribe') {
            const isNew = subs.subscribe(MIRROR_TOPIC, client);
            if (isNew) subscriptionsActive.inc({ subscription_type: 'mirror' });
            client.send({
              type: 'mirror.ack',
              payload: { subscribed: true, topic: MIRROR_TOPIC },
            });
          } else {
            const wasRemoved = subs.unsubscribe(MIRROR_TOPIC, client);
            if (wasRemoved)
              subscriptionsActive.dec({ subscription_type: 'mirror' });
            client.send({
              type: 'mirror.ack',
              payload: { unsubscribed: true, topic: MIRROR_TOPIC },
            });
          }
          trackDuration(msgType, startTime);
          return;
        }

        // ── Unhandled ─────────────────────────────────────────────────────
        trackDuration(msgType, startTime);
        errorsTotal.inc({ type: 'unhandled_message', message_type: msgType });
        invalidMessageCount++;
        if (invalidMessageCount > config.WS_MAX_INVALID_MESSAGES) {
          console.warn(
            `[Relayer] Too many invalid messages from ${ip}; closing`
          );
          penaltyDisconnect('too_many_invalid_messages');
          return;
        }
        console.warn(
          `[Relayer] Unhandled message type from ${ip}: ${
            (msg as Record<string, unknown>)?.type ?? typeof msg
          }`
        );
      } catch (err) {
        errorsTotal.inc({ type: 'handler_crash', message_type: 'unknown' });
        console.error(
          `[Relayer] Unhandled error in message handler from ${ip}:`,
          err
        );
        try {
          client.send({
            type: 'error',
            payload: { message: 'internal error', code: 'internal_error' },
          });
        } catch {
          /* best-effort error response */
        }
      }
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

      // Decrement per-IP counter
      const currentIpCount = connectionsPerIp.get(ip) ?? 1;
      if (currentIpCount <= 1) {
        connectionsPerIp.delete(ip);
      } else {
        connectionsPerIp.set(ip, currentIpCount - 1);
      }
      const reasonStr = reason?.toString() ?? '';
      connectionsClosed.inc({ reason: reasonStr || `code_${code}` });
      console.log(
        `[Relayer] client.closed clientId=${client.id.slice(0, 8)} service=${client.service} instance=${
          client.instanceId ? client.instanceId.slice(0, 8) : 'unknown'
        } ip=${ip} code=${code} reason=${reasonStr}`
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

      // Clean up committed-intent subscriptions (per-commitment topics).
      const commitmentUnsubs = subs.unsubscribeByPrefix('commitment:', client);
      for (let i = 0; i < commitmentUnsubs; i++) {
        subscriptionsActive.dec({ subscription_type: 'commitment' });
      }

      // Clean up public mirror subscription (singleton topic).
      const mirrorUnsub = subs.unsubscribeByPrefix(MIRROR_TOPIC, client);
      for (let i = 0; i < mirrorUnsub; i++) {
        subscriptionsActive.dec({ subscription_type: 'mirror' });
      }

      allClients.delete(client);
      connectionMap.delete(ws);
    });
  });

  return wss;
}
