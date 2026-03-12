import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage } from 'http';
import { verifyMessage, type Abi } from 'viem';
import { getProviderForChain } from './utils/getProviderForChain';
import {
  upsertEscrowAuction,
  getEscrowAuction,
  addEscrowBid,
  getEscrowBids,
  getEscrowAuctionDetails,
} from './escrowRegistry';
import { validateEscrowAuctionRequest, validateEscrowBid } from './escrowHelpers';
import { verifyAuctionIntentSignature } from './escrowSigVerify';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
import {
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
} from './metrics';
import { config } from './config';
import Sentry from './instrument';
import type {
  ClientToServerMessage,
  ServerToClientMessage,
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
  unsubscribeFromAllSecondary,
} from './secondaryMarketHandlers';

function safeParse<T = unknown>(data: RawData): T | null {
  try {
    return JSON.parse(String(data)) as T;
  } catch {
    return null;
  }
}

// Structured timing log for observability
// Format: [TIMING] auction=<id> step=<step> ts=<timestamp> delta=<ms>ms [extra]
function logTiming(
  auctionId: string,
  step: string,
  startTime: number,
  extra?: Record<string, string | number>
) {
  const now = Date.now();
  const delta = now - startTime;
  const extraStr = extra
    ? ' ' + Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(' ')
    : '';
  console.log(
    `[TIMING] auction=${auctionId.slice(0, 8)} step=${step} ts=${now} delta=${delta}ms${extraStr}`
  );
}

function send(ws: WebSocket, message: ServerToClientMessage): void {
  try {
    ws.send(JSON.stringify(message));
    messagesSent.inc({ type: message.type });
  } catch (err) {
    console.error('[Relayer] Failed to send message:', err);
  }
}

function trackDuration(msgType: string, startTime: number): void {
  const duration = (Date.now() - startTime) / 1000;
  messageProcessingDuration.observe({ type: msgType }, duration);
}

function subscribeToAuction(
  auctionId: string,
  ws: WebSocket,
  auctionSubscriptions: Map<string, Set<WebSocket>>
) {
  if (!auctionSubscriptions.has(auctionId)) {
    auctionSubscriptions.set(auctionId, new Set());
  }
  auctionSubscriptions.get(auctionId)!.add(ws);
}

function unsubscribeFromAuction(
  auctionId: string,
  ws: WebSocket,
  auctionSubscriptions: Map<string, Set<WebSocket>>
) {
  const subscribers = auctionSubscriptions.get(auctionId);
  if (subscribers) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      auctionSubscriptions.delete(auctionId);
    }
  }
}

function unsubscribeFromAllAuctions(
  ws: WebSocket,
  auctionSubscriptions: Map<string, Set<WebSocket>>
) {
  for (const [auctionId, subscribers] of auctionSubscriptions.entries()) {
    if (subscribers.has(ws)) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        auctionSubscriptions.delete(auctionId);
      }
    }
  }
}

function broadcastToAuctionSubscribers(
  auctionId: string,
  message: ServerToClientMessage,
  auctionSubscriptions: Map<string, Set<WebSocket>>
) {
  const subscribers = auctionSubscriptions.get(auctionId);
  if (!subscribers || subscribers.size === 0) {
    return 0;
  }

  const dataStr = JSON.stringify(message);
  let recipients = 0;
  subscribers.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(dataStr);
        recipients++;
      } catch (error) {
        console.warn(`[Relayer] Failed to send to subscriber:`, error);
        subscribers.delete(ws);
      }
    } else {
      subscribers.delete(ws);
    }
  });

  return recipients;
}

const RATE_LIMIT_WINDOW_MS = config.RATE_LIMIT_WINDOW_MS;
const RATE_LIMIT_MAX_MESSAGES = config.RATE_LIMIT_MAX_MESSAGES;

export function createAuctionWebSocketServer() {
  const wss = new WebSocketServer({ noServer: true });
  
  // Track active connections for connection limit
  let activeConnectionCount = 0;

  // Track which clients are subscribed to which auction channels
  const auctionSubscriptions = new Map<string, Set<WebSocket>>();

  // Vault quotes multiplexed on /auction
  type VaultKey = string; // `${chainId}:${vaultAddressLower}`
  type PublishVaultQuotePayload = {
    chainId: number;
    vaultAddress: string;
    vaultCollateralPerShare: string; // decimal string, e.g. "1.234567"
    timestamp: number;
    signedBy: string;
    signature: string;
  };
  type SubscribePayload = { chainId: number; vaultAddress: string };
  type VaultServerToClientMessage =
    | { type: 'vault_quote.update'; payload: PublishVaultQuotePayload }
    | { type: 'vault_quote.ack'; payload: { ok?: boolean; error?: string } };

  const vaultSubscriptions = new Map<VaultKey, Set<WebSocket>>();
  const latestVaultQuoteByKey = new Map<VaultKey, PublishVaultQuotePayload>();
  const SIGNER_CACHE_TTL_MS = 60_000;
  const SIGNER_CACHE_MAX_SIZE = 500;
  const vaultSignerCache = new Map<
    VaultKey,
    { signers: Set<string>; fetchedAt: number }
  >();
  const vaultObservers = new Set<WebSocket>();

  // Periodically evict expired signer cache entries to prevent unbounded growth
  const cacheEvictionTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of vaultSignerCache) {
      if (now - entry.fetchedAt > SIGNER_CACHE_TTL_MS) {
        vaultSignerCache.delete(key);
      }
    }
  }, SIGNER_CACHE_TTL_MS);
  wss.on('close', () => clearInterval(cacheEvictionTimer));

  function makeVaultKey(chainId: number, vaultAddress: string): VaultKey {
    return `${chainId}:${vaultAddress.toLowerCase()}`;
  }
  function broadcastToVaultSubscribers(
    key: VaultKey,
    message: VaultServerToClientMessage
  ): number {
    const set = vaultSubscriptions.get(key);
    if (!set || set.size === 0) return 0;
    const str = JSON.stringify(message);
    let n = 0;
    set.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(str);
          n++;
        } catch {
          set.delete(ws);
        }
      } else {
        set.delete(ws);
      }
    });
    return n;
  }
  function vaultSubscribe(key: VaultKey, ws: WebSocket) {
    if (!vaultSubscriptions.has(key)) vaultSubscriptions.set(key, new Set());
    vaultSubscriptions.get(key)!.add(ws);
  }
  function vaultUnsubscribe(key: VaultKey, ws: WebSocket) {
    const set = vaultSubscriptions.get(key);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) vaultSubscriptions.delete(key);
  }
  function vaultUnsubscribeAll(ws: WebSocket): number {
    let count = 0;
    for (const [k, set] of vaultSubscriptions.entries()) {
      if (set.has(ws)) {
        set.delete(ws);
        count++;
        if (set.size === 0) vaultSubscriptions.delete(k);
      }
    }
    return count;
  }

  function addVaultObserver(ws: WebSocket): void {
    vaultObservers.add(ws);
  }

  function removeVaultObserver(ws: WebSocket): void {
    vaultObservers.delete(ws);
  }

  function sendVaultAck(
    ws: WebSocket,
    payload: { ok?: boolean; error?: string },
    context: string
  ): void {
    try {
      ws.send(JSON.stringify({ type: 'vault_quote.ack', payload }));
      if (payload.ok || payload.error) {
        messagesSent.inc({ type: 'vault_quote.ack' });
      }
    } catch (err) {
      console.error(`[Relayer] Failed to send vault_quote.ack (${context}):`, err);
    }
  }
  function broadcastToVaultObservers(message: unknown): number {
    if (vaultObservers.size === 0) return 0;
    let str: string;
    try {
      str = JSON.stringify(message);
    } catch {
      return 0;
    }
    let count = 0;
    for (const client of vaultObservers) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(str);
          count++;
        } catch {
          vaultObservers.delete(client);
        }
      } else {
        vaultObservers.delete(client);
      }
    }
    return count;
  }

  const PASSIVE_VAULT_ABI: Abi = [
    {
      type: 'function',
      name: 'manager',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
    },
  ];
  async function fetchAuthorizedVaultSigners(
    chainId: number,
    vaultAddress: string
  ): Promise<Set<string>> {
    const client = getProviderForChain(chainId);
    const addr = vaultAddress.toLowerCase() as `0x${string}`;
    const manager = (await client
      .readContract({
        address: addr,
        abi: PASSIVE_VAULT_ABI,
        functionName: 'manager',
      })
      .catch(() => undefined)) as string | undefined;
    const set = new Set<string>();
    if (manager) set.add(manager.toLowerCase());
    return set;
  }
  function buildVaultCanonicalMessage(
    payload: PublishVaultQuotePayload
  ): string {
    return [
      'Sapience Vault Share Quote',
      `Vault: ${payload.vaultAddress.toLowerCase()}`,
      `ChainId: ${payload.chainId}`,
      `CollateralPerShare: ${String(payload.vaultCollateralPerShare)}`,
      `Timestamp: ${payload.timestamp}`,
    ].join('\n');
  }

  // Startup banner removed to reduce verbosity

  wss.on('connection', (ws, req: IncomingMessage) => {
    // Check connection limit
    if (activeConnectionCount >= config.WS_MAX_CONNECTIONS) {
      console.warn(
        `[Relayer] Max connections (${config.WS_MAX_CONNECTIONS}) reached, rejecting new connection`
      );
      ws.close(1008, 'connection_limit_exceeded');
      return;
    }

    // Origin validation (if configured)
    if (config.WS_ALLOWED_ORIGINS) {
      const origin = req.headers.origin;
      const allowedOrigins = config.WS_ALLOWED_ORIGINS.split(',').map(o => o.trim());
      if (!origin || !allowedOrigins.includes(origin)) {
        console.warn(`[Relayer] Origin validation failed: ${origin}`);
        ws.close(1008, 'origin_not_allowed');
        return;
      }
    }

    activeConnectionCount++;
    // Metrics: Track connection
    activeConnections.inc();
    connectionsTotal.inc();

    const ip =
      req.socket.remoteAddress ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      'unknown';

    // Idle timeout setup
    let idleTimeout: NodeJS.Timeout | null = null;

    const resetIdleTimeout = () => {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      idleTimeout = setTimeout(() => {
        console.log(`[Relayer] Connection idle timeout from ${ip}`);
        ws.close(1008, 'idle_timeout');
      }, config.WS_IDLE_TIMEOUT_MS);
    };

    // Handle client pings - server automatically responds with pong via ws library
    // Reset idle timeout on ping/pong to keep connection alive
    ws.on('ping', () => {
      resetIdleTimeout();
      // ws library automatically responds with pong
    });

    ws.on('pong', () => {
      resetIdleTimeout();
    });

    // Start idle timeout
    resetIdleTimeout();

    let rateCount = 0;
    let rateResetAt = Date.now() + RATE_LIMIT_WINDOW_MS;

    ws.on('message', async (data: RawData) => {
      // Reset idle timeout on any message
      resetIdleTimeout();

      // basic rate limiting and size guard
      const now = Date.now();
      if (now > rateResetAt) {
        rateCount = 0;
        rateResetAt = now + RATE_LIMIT_WINDOW_MS;
      }
      if (++rateCount > RATE_LIMIT_MAX_MESSAGES) {
        rateLimitHits.inc();
        console.warn(
          `[Relayer] Rate limit exceeded from ${ip}; closing connection`
        );
        try {
          ws.close(1008, 'rate_limited');
        } catch (err) {
          console.error(
            '[Relayer] Failed to close rate-limited connection:',
            err
          );
        }
        return;
      }
      const dataSize =
        typeof data === 'string'
          ? (data as string).length
          : (data as Buffer).byteLength;
      if (dataSize > 64_000) {
        console.warn(
          `[Relayer] Message too large from ${ip}; closing connection`
        );
        try {
          ws.close(1009, 'message_too_large');
        } catch (err) {
          console.error(
            '[Relayer] Failed to close oversized-message connection:',
            err
          );
        }
        return;
      }
      const msg = safeParse<
        ClientToServerMessage | { type?: string }
      >(data);
      if (!msg || typeof msg !== 'object') {
        messagesReceived.inc({ type: 'invalid' });
        errorsTotal.inc({ type: 'validation', message_type: 'unknown' });
        console.warn(`[Relayer] Invalid JSON from ${ip}`);
        return;
      }

      const msgType = (msg as { type?: string })?.type || 'unknown';
      const startTime = Date.now();

      // Track message received
      messagesReceived.inc({ type: msgType });

      // Handle ping/pong messages (JSON-level, not WebSocket frames)
      if (msgType === 'ping') {
        try {
          ws.send(JSON.stringify({ type: 'pong' }));
          messagesSent.inc({ type: 'pong' });
        } catch (err) {
          console.error('[Relayer] Failed to send pong response:', err);
        }
        trackDuration(msgType, startTime);
        return;
      }

      // Handle Vault Quote messages (multiplexed)
      if ((msg as { type?: string })?.type?.startsWith('vault_quote.')) {
        const type = (msg as { type?: string }).type as string;
        if (type === 'vault_quote.observe') {
          addVaultObserver(ws);
          sendVaultAck(ws, { ok: true }, 'observe');
          return;
        }
        if (type === 'vault_quote.unobserve') {
          removeVaultObserver(ws);
          sendVaultAck(ws, { ok: true }, 'unobserve');
          return;
        }
        if (type === 'vault_quote.subscribe') {
          const { chainId, vaultAddress } =
            (msg as unknown as { payload?: SubscribePayload })?.payload ||
            ({} as SubscribePayload);
          if (!chainId || !vaultAddress) {
            sendVaultAck(ws, { error: 'invalid_subscribe' }, 'invalid_subscribe');
            return;
          }
          const key = makeVaultKey(chainId, vaultAddress);
          const wasNewSubscription = !vaultSubscriptions.get(key)?.has(ws);
          vaultSubscribe(key, ws);
          if (wasNewSubscription) {
            subscriptionsActive.inc({ subscription_type: 'vault' });
          }
          const latest = latestVaultQuoteByKey.get(key);
          if (latest) {
            try {
              ws.send(
                JSON.stringify({ type: 'vault_quote.update', payload: latest })
              );
            } catch (err) {
              console.error(
                '[Relayer] Failed to send vault_quote.update (latest on subscribe):',
                err
              );
            }
          }
          sendVaultAck(ws, { ok: true }, 'subscribe');
          broadcastToVaultObservers({
            type: 'vault_quote.requested',
            payload: {
              chainId,
              vaultAddress: vaultAddress.toLowerCase(),
              channel: key,
            },
          });
          return;
        }
        if (type === 'vault_quote.unsubscribe') {
          const { chainId, vaultAddress } =
            (msg as unknown as { payload?: SubscribePayload })?.payload ||
            ({} as SubscribePayload);
          if (!chainId || !vaultAddress) return;
          const key = makeVaultKey(chainId, vaultAddress);
          const hadSubscription = vaultSubscriptions.get(key)?.has(ws) ?? false;
          vaultUnsubscribe(key, ws);
          if (hadSubscription) {
            subscriptionsActive.dec({ subscription_type: 'vault' });
          }
          sendVaultAck(ws, { ok: true }, 'unsubscribe');
          return;
        }
        if (type === 'vault_quote.publish' || type === 'vault_quote.submit') {
          const p = (msg as unknown as { payload: PublishVaultQuotePayload })
            .payload;
          try {
            if (
              !p ||
              !p.vaultAddress ||
              !p.chainId ||
              p.timestamp == null ||
              p.vaultCollateralPerShare == null ||
              !p.signedBy ||
              !p.signature
            ) {
              vaultQuotesPublished.inc({ status: 'error' });
              errorsTotal.inc({ type: 'validation', message_type: 'vault_quote.publish' });
              sendVaultAck(ws, { error: 'invalid_payload' }, 'invalid_payload');
              trackDuration(msgType, startTime);
              return;
            }
            // anti-replay window (5 minutes)
            if (Math.abs(Date.now() - p.timestamp) > 5 * 60 * 1000) {
              vaultQuotesPublished.inc({ status: 'error' });
              errorsTotal.inc({ type: 'validation', message_type: 'vault_quote.publish' });
              sendVaultAck(ws, { error: 'stale_timestamp' }, 'stale_timestamp');
              trackDuration(msgType, startTime);
              return;
            }
            const key = makeVaultKey(p.chainId, p.vaultAddress);
            let allowed = vaultSignerCache.get(key);
            const cacheFresh =
              allowed && Date.now() - allowed.fetchedAt < SIGNER_CACHE_TTL_MS;
            if (!cacheFresh) {
              const signers = await fetchAuthorizedVaultSigners(
                p.chainId,
                p.vaultAddress
              );
              allowed = { signers, fetchedAt: Date.now() };
              // Evict oldest entry if cache is full
              if (vaultSignerCache.size >= SIGNER_CACHE_MAX_SIZE && !vaultSignerCache.has(key)) {
                const oldestKey = vaultSignerCache.keys().next().value;
                if (oldestKey) vaultSignerCache.delete(oldestKey);
              }
              vaultSignerCache.set(key, allowed);
            }
            const canonical = buildVaultCanonicalMessage(p);
            const ok = await verifyMessage({
              address: p.signedBy.toLowerCase() as `0x${string}`,
              message: canonical,
              signature: p.signature as `0x${string}`,
            });
            if (!ok) {
              sendVaultAck(ws, { error: 'bad_signature' }, 'bad_signature');
              return;
            }
            if (!allowed!.signers.has(p.signedBy.toLowerCase())) {
              vaultQuotesPublished.inc({ status: 'unauthorized' });
              errorsTotal.inc({ type: 'authorization', message_type: 'vault_quote.publish' });
              sendVaultAck(ws, { error: 'unauthorized_signer' }, 'unauthorized_signer');
              trackDuration(msgType, startTime);
              return;
            }
            const normalized: PublishVaultQuotePayload = {
              chainId: p.chainId,
              vaultAddress: p.vaultAddress.toLowerCase(),
              vaultCollateralPerShare: String(p.vaultCollateralPerShare),
              timestamp: p.timestamp,
              signedBy: p.signedBy.toLowerCase(),
              signature: p.signature,
            };
            latestVaultQuoteByKey.set(key, normalized);
            vaultQuotesPublished.inc({ status: 'success' });
            broadcastToVaultSubscribers(key, {
              type: 'vault_quote.update',
              payload: normalized,
            });
            sendVaultAck(ws, { ok: true }, 'publish_success');
            broadcastToVaultObservers({
              type: 'vault_quote.update',
              payload: normalized,
            });
          } catch (err) {
            vaultQuotesPublished.inc({ status: 'error' });
            errorsTotal.inc({ type: 'internal_error', message_type: 'vault_quote.publish' });
            sendVaultAck(
              ws,
              { error: (err as Error).message || 'internal_error' },
              'internal_error'
            );
          }
          
          trackDuration(msgType, startTime);
          return;
        }
      }

      // Handle Escrow Auction client messages
      if (isEscrowClientMessage(msg)) {
        if (msg.type === 'auction.start') {
          const payload = msg.payload as AuctionRFQPayload;
          const auctionStartTime = startTime;
          let pendingAuctionId = 'pending';

          logTiming(pendingAuctionId, 'received', auctionStartTime, {
            predictor: payload.predictor?.slice(0, 10) || 'unknown',
            picks: payload.picks?.length ?? 0,
            keys: Object.keys(payload).join(','),
          });

          // Validate auction request structure
          const validation = validateEscrowAuctionRequest(payload);
          if (!validation.valid) {
            errorsTotal.inc({ type: 'validation', message_type: 'auction.start' });
            console.warn(
              `[Relayer] auction.start rejected: ${validation.error}`
            );
            send(ws, {
              type: 'auction.ack',
              payload: { auctionId: '', error: validation.error || 'invalid_payload' },
            });
            trackDuration(msgType, startTime);
            return;
          }

          // Verify intent signature if present
          if (payload.intentSignature) {
            const escrowAddr = predictionMarketEscrow[payload.chainId]?.address;
            if (!escrowAddr) {
              errorsTotal.inc({ type: 'validation', message_type: 'auction.start' });
              console.warn(
                `[Relayer] auction.start rejected: unknown chainId ${payload.chainId}`
              );
              send(ws, {
                type: 'auction.ack',
                payload: { auctionId: '', error: 'unknown_chain_id' },
              });
              trackDuration(msgType, startTime);
              return;
            }

            const intentValid = await verifyAuctionIntentSignature(
              payload,
              escrowAddr as `0x${string}`
            );
            if (!intentValid) {
              errorsTotal.inc({ type: 'validation', message_type: 'auction.start' });
              console.warn(
                `[Relayer] auction.start rejected: invalid intent signature from ${payload.predictor?.slice(0, 10)}`
              );
              send(ws, {
                type: 'auction.ack',
                payload: { auctionId: '', error: 'invalid_intent_signature' },
              });
              trackDuration(msgType, startTime);
              return;
            }
          }

          const auctionId = upsertEscrowAuction(payload);
          pendingAuctionId = auctionId;
          logTiming(auctionId, 'created', auctionStartTime);

          auctionsStarted.inc();
          subscribeToAuction(auctionId, ws, auctionSubscriptions);
          subscriptionsActive.inc({ subscription_type: 'auction' });

          // Echo back request ID for client-side correlation
          const requestId =
            (msg as { id?: string }).id || (payload as { id?: string }).id;
          send(ws, {
            type: 'auction.ack',
            payload: requestId ? { auctionId, id: requestId } : { auctionId },
          });
          logTiming(auctionId, 'ack_sent', auctionStartTime);

          // Broadcast auction.started with auction details to all connected clients
          const details = getEscrowAuctionDetails(auctionId);
          if (details) {
            const requested = JSON.stringify({
              type: 'auction.started',
              payload: details,
            });
            const botCount = wss.clients.size;
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) client.send(requested);
            });
            logTiming(auctionId, 'broadcast', auctionStartTime, { bots: botCount });
          }

          // Immediately stream current bids if any
          const bids = getEscrowBids(auctionId);
          if (bids.length > 0) {
            send(ws, {
              type: 'auction.bids',
              payload: { auctionId, bids },
            });
          }

          trackDuration(msgType, startTime);
          return;
        }
        if (msg.type === 'auction.subscribe') {
          const auctionId = (msg.payload as { auctionId?: string })?.auctionId;
          if (typeof auctionId === 'string' && auctionId.length > 0) {
            subscribeToAuction(auctionId, ws, auctionSubscriptions);
            subscriptionsActive.inc({ subscription_type: 'auction' });
            const bids = getEscrowBids(auctionId);
            if (bids.length > 0) {
              send(ws, {
                type: 'auction.bids',
                payload: { auctionId, bids },
              });
            }
            send(ws, {
              type: 'auction.ack',
              payload: { auctionId, subscribed: true },
            });
          } else {
            console.warn('[Relayer] subscribe rejected: missing auctionId');
            send(ws, {
              type: 'auction.ack',
              payload: { error: 'missing_auction_id' },
            });
          }

          trackDuration(msgType, startTime);
          return;
        }
        if (msg.type === 'auction.unsubscribe') {
          const auctionId = (msg.payload as { auctionId?: string })?.auctionId;
          if (typeof auctionId === 'string' && auctionId.length > 0) {
            unsubscribeFromAuction(auctionId, ws, auctionSubscriptions);
            subscriptionsActive.dec({ subscription_type: 'auction' });
            send(ws, {
              type: 'auction.ack',
              payload: { auctionId, unsubscribed: true },
            });
          } else {
            console.warn('[Relayer] unsubscribe rejected: missing auctionId');
            send(ws, {
              type: 'auction.ack',
              payload: { error: 'missing_auction_id' },
            });
          }

          trackDuration(msgType, startTime);
          return;
        }
        if (msg.type === 'bid.submit') {
          const bid = msg.payload as BidPayload;
          const bidStartTime = startTime;
          logTiming(bid.auctionId || 'unknown', 'bid_received', bidStartTime, {
            counterparty: bid.counterparty?.slice(0, 10) || 'unknown',
          });

          const rec = getEscrowAuction(bid.auctionId);
          if (!rec) {
            bidsSubmitted.inc({ status: 'rejected' });
            errorsTotal.inc({ type: 'validation', message_type: 'bid.submit' });
            send(ws, {
              type: 'bid.ack',
              payload: { error: 'auction_not_found_or_expired' },
            });
            console.warn(
              `[Relayer] bid.submit rejected auctionId=${bid.auctionId} reason=auction_not_found_or_expired`
            );

            trackDuration(msgType, startTime);
            return;
          }

          // Validate bid structure
          const bidValidation = validateEscrowBid(bid, rec.auction);
          if (!bidValidation.valid) {
            bidsSubmitted.inc({ status: 'rejected' });
            errorsTotal.inc({ type: 'validation', message_type: 'bid.submit' });
            send(ws, {
              type: 'bid.ack',
              payload: { error: bidValidation.error || 'invalid_bid' },
            });
            console.warn(
              `[Relayer] bid.submit rejected auctionId=${bid.auctionId} reason=${bidValidation.error || 'invalid_bid'}`
            );

            trackDuration(msgType, startTime);
            return;
          }

          const validated = addEscrowBid(bid.auctionId, bid);
          if (!validated) {
            bidsSubmitted.inc({ status: 'error' });
            errorsTotal.inc({ type: 'validation', message_type: 'bid.submit' });
            send(ws, {
              type: 'bid.ack',
              payload: { error: 'auction_not_found_or_expired' },
            });
            console.warn(
              `[Relayer] bid.submit failed auctionId=${bid.auctionId} reason=auction_not_found_or_expired`
            );
            return;
          }
          logTiming(bid.auctionId, 'bid_validated', bidStartTime);

          bidsSubmitted.inc({ status: 'success' });
          send(ws, { type: 'bid.ack', payload: {} });

          // Broadcast updated bids to auction subscribers
          const currentBids = getEscrowBids(bid.auctionId);
          const broadcastPayload: ServerToClientMessage = {
            type: 'auction.bids',
            payload: { auctionId: bid.auctionId, bids: currentBids },
          };
          const subscriberCount = auctionSubscriptions.get(bid.auctionId)?.size || 0;
          broadcastToAuctionSubscribers(
            bid.auctionId,
            broadcastPayload,
            auctionSubscriptions
          );
          logTiming(bid.auctionId, 'bid_broadcast', bidStartTime, {
            bidCount: currentBids.length,
            subscribers: subscriberCount,
          });

          trackDuration(msgType, startTime);
          return;
        }
      }

      // Handle Secondary Market messages
      if (isSecondaryClientMessage(msg) && (msg as { type: string }).type.startsWith('secondary.')) {
        const secondaryMsg = msg as import('@sapience/sdk/types/secondary').SecondaryClientToServerMessage;
        if (secondaryMsg.type === 'secondary.auction.start') {
          await handleSecondaryAuctionStart(ws, secondaryMsg.payload);
          trackDuration(msgType, startTime);
          return;
        }
        if (secondaryMsg.type === 'secondary.bid.submit') {
          await handleSecondaryBidSubmit(ws, secondaryMsg.payload);
          trackDuration(msgType, startTime);
          return;
        }
        if (secondaryMsg.type === 'secondary.auction.subscribe') {
          handleSecondarySubscribe(ws, secondaryMsg.payload);
          trackDuration(msgType, startTime);
          return;
        }
        if (secondaryMsg.type === 'secondary.auction.unsubscribe') {
          handleSecondaryUnsubscribe(ws, secondaryMsg.payload);
          trackDuration(msgType, startTime);
          return;
        }
      }

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
      } catch (err2) {
        console.error('[Relayer] Sentry capture failed:', err2);
      }
    });

    ws.on('close', (code, reason) => {
      // Cleanup timers
      if (idleTimeout) {
        clearTimeout(idleTimeout);
        idleTimeout = null;
      }

      activeConnectionCount--;
      // Metrics: Track connection closed
      activeConnections.dec();
      const reasonStr = reason?.toString() ?? '';
      connectionsClosed.inc({ reason: reasonStr || `code_${code}` });

      console.log(
        `[Relayer] Socket closed from ${ip} code=${code} reason=${reasonStr}`
      );

      // Clean up auction subscriptions for this client
      unsubscribeFromAllAuctions(ws, auctionSubscriptions);
      subscriptionsActive.dec({ subscription_type: 'auction' });
      // Clean up vault subscriptions and observers for this client
      const vaultSubscriptionCount = vaultUnsubscribeAll(ws);
      // Decrement metric for each vault subscription that was removed
      for (let i = 0; i < vaultSubscriptionCount; i++) {
        subscriptionsActive.dec({ subscription_type: 'vault' });
      }
      removeVaultObserver(ws);
      // Clean up secondary market subscriptions
      unsubscribeFromAllSecondary(ws);
    });
  });

  return wss;
}

