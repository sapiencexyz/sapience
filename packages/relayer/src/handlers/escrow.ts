/**
 * Escrow auction handler functions.
 *
 * Pure business logic — receives ClientConnection + SubscriptionManager,
 * never raw WebSocket. All validation delegated to SDK.
 */

import type { ClientConnection, SubscriptionManager } from '../transport/types';
import type { Address } from 'viem';
import type {
  AuctionRFQPayload,
  BidPayload,
  ServerToClientMessage,
} from '../escrowTypes';
import type {
  AuctionRole,
  IdentifyPayload,
  AuctionReceivedPayload,
} from '@sapience/sdk/types';
import {
  validateAuctionRFQ,
  validateBid,
} from '@sapience/sdk/auction/validation';
import {
  upsertEscrowAuction,
  getEscrowAuction,
  addEscrowBid,
  getEscrowBids,
  getEscrowAuctionDetails,
} from '../escrowRegistry';
import {
  auctionsStarted,
  bidsSubmitted,
  errorsTotal,
  subscriptionsActive,
  auctionBroadcastSends,
  auctionReceivedAcks,
  auctionReceivedAckRejected,
  clientsIdentified,
  serviceLabel,
  variantLabel,
} from '../metrics';
import { recordBroadcast, wasBroadcastTo } from '../broadcastLedger';
import { config } from '../config';
import { getProviderForChain } from '../utils/getProviderForChain';

// Identity helpers — keep clientId/instanceId short in logs.
const short = (s: string | undefined): string =>
  s ? s.slice(0, 8) : 'unknown';

// A client receives the global `auction.started` feed only if it declared a
// counterparty-side role. Predictors (the default) and anonymous clients are
// excluded — they still get bids on their own auctions via the per-auction
// subscription. See AuctionRole in @sapience/sdk/types.
const receivesAuctionFeed = (c: ClientConnection): boolean =>
  c.role === 'counterparty' || c.role === 'both';

// Strip non-printable ASCII so a client can't inject newlines/control chars
// into our log lines via the `service` field.
const sanitizeForLog = (s: string): string =>
  // eslint-disable-next-line no-control-regex
  s.replace(/[^\x20-\x7E]/g, '?');

// Structured timing log for observability
function logTiming(
  auctionId: string,
  step: string,
  startTime: number,
  extra?: Record<string, string | number>
) {
  const now = Date.now();
  const delta = now - startTime;
  const extraStr = extra
    ? ' ' +
      Object.entries(extra)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
    : '';
  console.log(
    `[TIMING] auction=${auctionId.slice(0, 8)} step=${step} ts=${now} delta=${delta}ms${extraStr}`
  );
}

export interface EscrowHandlerContext {
  /** All connected clients — used for global auction.started broadcast. */
  allClients: () => Iterable<ClientConnection>;
}

/**
 * @returns `true` if the request was rejected due to a validation failure
 *          (used by ws.ts to track per-connection validation failure penalties).
 */
export async function handleAuctionStart(
  client: ClientConnection,
  payload: AuctionRFQPayload,
  subs: SubscriptionManager,
  ctx: EscrowHandlerContext,
  requestId?: string
): Promise<boolean> {
  const startTime = Date.now();
  let pendingAuctionId = 'pending';

  logTiming(pendingAuctionId, 'received', startTime, {
    predictor: payload.predictor?.slice(0, 10) || 'unknown',
    picks: payload.picks?.length ?? 0,
    keys: Object.keys(payload).join(','),
  });

  // Use client-supplied escrowContract as verifyingContract
  if (!payload.escrowContract) {
    errorsTotal.inc({ type: 'validation', message_type: 'auction.start' });
    console.warn('[Relayer] auction.start rejected: missing escrowContract');
    client.send({
      type: 'auction.ack',
      payload: { auctionId: '', error: 'missing_escrow_contract' },
    });
    return true;
  }

  // Public client enables ERC-1271 fallback for smart-account predictors
  // that emit kernel-wrapped intent signatures (the migrated app path).
  // If the chain isn't configured, we proceed without the client and the
  // SDK handles smart-account predictors as `unverified` passthrough below.
  let publicClient: ReturnType<typeof getProviderForChain> | undefined;
  try {
    publicClient = getProviderForChain(payload.chainId);
  } catch {
    publicClient = undefined;
  }

  // Validate auction request structure + intent signature in one call
  const validation = await validateAuctionRFQ(payload, {
    verifyingContract: payload.escrowContract as Address,
    requireSignature: !!payload.intentSignature,
    maxDeadlineSeconds: 7200,
    publicClient,
  });
  if (validation.status === 'invalid') {
    errorsTotal.inc({ type: 'validation', message_type: 'auction.start' });
    console.warn(`[Relayer] auction.start rejected: ${validation.reason}`);
    client.send({
      type: 'auction.ack',
      payload: {
        auctionId: '',
        error: validation.reason || 'invalid_payload',
      },
    });
    return true;
  }
  if (validation.status === 'unverified') {
    // Smart-account predictor with a kernel-wrapped intent signature that we
    // couldn't verify offline. Pass through — the on-chain mint() is the
    // authoritative gate. Log it so operators can spot anomalies.
    console.warn(
      `[Relayer] auction.start unverified (passthrough): ${validation.reason}`
    );
  }

  const auctionId = upsertEscrowAuction(payload);
  pendingAuctionId = auctionId;
  logTiming(auctionId, 'created', startTime);

  auctionsStarted.inc();
  const isNew = subs.subscribe(`auction:${auctionId}`, client);
  if (isNew) subscriptionsActive.inc({ subscription_type: 'auction' });

  // Echo back request ID for client-side correlation
  const ackPayload: Record<string, unknown> = { auctionId };
  if (requestId) ackPayload.id = requestId;
  client.send({ type: 'auction.ack', payload: ackPayload });
  logTiming(auctionId, 'ack_sent', startTime);

  // Broadcast auction.started with auction details to all connected clients.
  // Per-client logging here is intentional: it's the only ground truth we
  // have for "did the relayer attempt to deliver this auction to this bot."
  // Without it, a silent miss (auction received, but bot never saw it) is
  // indistinguishable from a relayer-side failure.
  const details = getEscrowAuctionDetails(auctionId);
  if (details) {
    const broadcastMsg = { type: 'auction.started', payload: details };
    const auctionShort = short(auctionId);
    // When role gating is on, the feed reaches only counterparty/both clients.
    // Kept behind a flag so clients can deploy their declared role before the
    // relayer narrows the fan-out (see config.AUCTION_FEED_ROLE_GATING).
    const roleGating = config.AUCTION_FEED_ROLE_GATING;
    let attempted = 0;
    let sent = 0;
    let failed = 0;
    let skippedClosed = 0;
    let skippedRole = 0;
    for (const c of ctx.allClients()) {
      if (!c.isOpen) {
        skippedClosed++;
        continue;
      }
      if (roleGating && !receivesAuctionFeed(c)) {
        skippedRole++;
        continue;
      }
      attempted++;
      let ok = false;
      try {
        ok = c.send(broadcastMsg);
      } catch {
        ok = false;
      }
      auctionBroadcastSends.inc({
        service: serviceLabel(c.service),
        variant: variantLabel(c.variant),
        ok: ok ? 'true' : 'false',
      });
      if (ok) {
        sent++;
        recordBroadcast(auctionId, c.id);
        console.log(
          `[Relayer] auction.broadcast.send ok=true auctionId=${auctionShort} clientId=${short(
            c.id
          )} service=${c.service} variant=${c.variant} instance=${short(c.instanceId)}`
        );
      } else {
        failed++;
        console.warn(
          `[Relayer] auction.broadcast.send ok=false auctionId=${auctionShort} clientId=${short(
            c.id
          )} service=${c.service} variant=${c.variant} instance=${short(c.instanceId)}`
        );
      }
    }
    console.log(
      `[Relayer] auction.broadcast.done auctionId=${auctionShort} attempted=${attempted} sent=${sent} failed=${failed} skippedClosed=${skippedClosed} skippedRole=${skippedRole} roleGating=${roleGating}`
    );
    logTiming(auctionId, 'broadcast', startTime, {
      attempted,
      sent,
      failed,
      skippedClosed,
      skippedRole,
    });
  }

  // Immediately stream current bids if any
  const bids = getEscrowBids(auctionId);
  if (bids.length > 0) {
    client.send({ type: 'auction.bids', payload: { auctionId, bids } });
  }

  return false;
}

export function handleAuctionSubscribe(
  client: ClientConnection,
  auctionId: string | undefined,
  subs: SubscriptionManager
): void {
  if (typeof auctionId === 'string' && auctionId.length > 0) {
    const isNew = subs.subscribe(`auction:${auctionId}`, client);
    if (isNew) subscriptionsActive.inc({ subscription_type: 'auction' });
    const bids = getEscrowBids(auctionId);
    if (bids.length > 0) {
      client.send({
        type: 'auction.bids',
        payload: { auctionId, bids },
      });
    }
    client.send({
      type: 'auction.ack',
      payload: { auctionId, subscribed: true },
    });
  } else {
    console.warn('[Relayer] subscribe rejected: missing auctionId');
    client.send({
      type: 'auction.ack',
      payload: { error: 'missing_auction_id' },
    });
  }
}

export function handleAuctionUnsubscribe(
  client: ClientConnection,
  auctionId: string | undefined,
  subs: SubscriptionManager
): void {
  if (typeof auctionId === 'string' && auctionId.length > 0) {
    const wasRemoved = subs.unsubscribe(`auction:${auctionId}`, client);
    if (wasRemoved) subscriptionsActive.dec({ subscription_type: 'auction' });
    client.send({
      type: 'auction.ack',
      payload: { auctionId, unsubscribed: true },
    });
  } else {
    console.warn('[Relayer] unsubscribe rejected: missing auctionId');
    client.send({
      type: 'auction.ack',
      payload: { error: 'missing_auction_id' },
    });
  }
}

/**
 * @returns `true` if the bid was rejected due to a validation failure.
 */
export async function handleBidSubmit(
  client: ClientConnection,
  bid: BidPayload,
  subs: SubscriptionManager
): Promise<boolean> {
  const bidStartTime = Date.now();
  logTiming(bid.auctionId || 'unknown', 'bid_received', bidStartTime, {
    counterparty: bid.counterparty?.slice(0, 10) || 'unknown',
  });

  const rec = getEscrowAuction(bid.auctionId);
  if (!rec) {
    bidsSubmitted.inc({ status: 'rejected' });
    errorsTotal.inc({ type: 'validation', message_type: 'bid.submit' });
    client.send({
      type: 'bid.ack',
      payload: { error: 'auction_not_found_or_expired' },
    });
    console.warn(
      `[Relayer] bid.submit rejected auctionId=${bid.auctionId} reason=auction_not_found_or_expired`
    );
    return true;
  }

  // Bid cap — matches secondary market's MAX_BIDS_PER_AUCTION
  if (rec.bids.length >= config.MAX_BIDS_PER_ESCROW_AUCTION) {
    bidsSubmitted.inc({ status: 'rejected' });
    client.send({
      type: 'bid.ack',
      payload: { error: 'bid_limit_reached' },
    });
    console.warn(
      `[Relayer] bid.submit rejected auctionId=${bid.auctionId} reason=bid_limit_reached (${rec.bids.length}/${config.MAX_BIDS_PER_ESCROW_AUCTION})`
    );
    return false; // Not a validation failure — just a capacity limit
  }

  // Per-connection cap — one connection cannot monopolize an auction's bid
  // slots. Offline signature verification can't tell a forged bid from a
  // legitimate smart-account (session-key) bid — both pass through as
  // 'unverified' — so without this a single connection could fill the global
  // cap with unverifiable bids and lock out real counterparties.
  const priorBidsFromConnection = client.bidCounts?.get(bid.auctionId) ?? 0;
  if (priorBidsFromConnection >= config.MAX_BIDS_PER_CONNECTION_PER_AUCTION) {
    bidsSubmitted.inc({ status: 'rejected' });
    client.send({
      type: 'bid.ack',
      payload: { error: 'bid_limit_reached' },
    });
    console.warn(
      `[Relayer] bid.submit rejected auctionId=${bid.auctionId} reason=connection_bid_limit_reached (${priorBidsFromConnection}/${config.MAX_BIDS_PER_CONNECTION_PER_AUCTION})`
    );
    return false; // Not a validation failure — just a capacity limit
  }

  // Validate bid structure + signature (offline only, no publicClient)
  const bidValidation = await validateBid(bid, rec.auction, {
    verifyingContract: rec.auction.escrowContract as Address,
    chainId: rec.auction.chainId,
    // No publicClient — relayer does offline verification only.
    // Unverified bids pass through (relayer is not the authority).
  });
  if (bidValidation.status === 'invalid') {
    bidsSubmitted.inc({ status: 'rejected' });
    errorsTotal.inc({ type: 'validation', message_type: 'bid.submit' });
    client.send({
      type: 'bid.ack',
      payload: { error: bidValidation.reason || 'invalid_bid' },
    });
    console.warn(
      `[Relayer] bid.submit rejected auctionId=${bid.auctionId} reason=${bidValidation.reason || 'invalid_bid'}`
    );
    return true;
  }
  // 'valid' and 'unverified' both pass through

  const validated = addEscrowBid(bid.auctionId, bid);
  if (!validated) {
    bidsSubmitted.inc({ status: 'error' });
    errorsTotal.inc({ type: 'validation', message_type: 'bid.submit' });
    client.send({
      type: 'bid.ack',
      payload: { error: 'auction_not_found_or_expired' },
    });
    console.warn(
      `[Relayer] bid.submit failed auctionId=${bid.auctionId} reason=auction_not_found_or_expired`
    );
    return false;
  }
  logTiming(bid.auctionId, 'bid_validated', bidStartTime);

  // Count this accepted bid against the per-connection cap.
  if (!client.bidCounts) client.bidCounts = new Map();
  client.bidCounts.set(bid.auctionId, priorBidsFromConnection + 1);

  bidsSubmitted.inc({ status: 'success' });
  client.send({ type: 'bid.ack', payload: {} });

  // Broadcast updated bids to auction subscribers
  const currentBids = getEscrowBids(bid.auctionId);
  const broadcastPayload: ServerToClientMessage = {
    type: 'auction.bids',
    payload: { auctionId: bid.auctionId, bids: currentBids },
  };
  const subscriberCount = subs.subscriberCount(`auction:${bid.auctionId}`);
  subs.broadcast(`auction:${bid.auctionId}`, broadcastPayload);
  logTiming(bid.auctionId, 'bid_broadcast', bidStartTime, {
    bidCount: currentBids.length,
    subscribers: subscriberCount,
  });

  return false;
}

/**
 * Identify handshake — clients announce service/instance identity so per-client
 * broadcast logs are useful. No-op if payload is malformed; we don't penalize
 * because identify is best-effort observability, not auth.
 */
export function handleIdentify(
  client: ClientConnection,
  payload: IdentifyPayload | undefined
): void {
  if (!payload || typeof payload !== 'object') return;
  // The raw service is stored on the client and used in log lines (verbatim,
  // sanitized for log injection). The Prometheus label is bounded separately
  // via serviceLabel() so a client cannot inflate metric cardinality.
  const rawService =
    typeof payload.service === 'string' && payload.service.length > 0
      ? sanitizeForLog(payload.service.slice(0, 64))
      : 'anonymous';
  const rawVariant =
    typeof payload.variant === 'string' && payload.variant.length > 0
      ? sanitizeForLog(payload.variant.slice(0, 32))
      : 'default';
  const instanceId =
    typeof payload.instanceId === 'string' && payload.instanceId.length > 0
      ? sanitizeForLog(payload.instanceId.slice(0, 64))
      : undefined;
  const chainId =
    typeof payload.chainId === 'number' && Number.isFinite(payload.chainId)
      ? payload.chainId
      : undefined;
  // Role gates the global auction.started feed. Unknown/missing values fall
  // back to 'predictor' (no feed) so a malformed identify can't silently
  // subscribe a client to the broadcast. Re-identify upgrades in place
  // (e.g. an app session promoting 'predictor' → 'both' on terminal open).
  const role: AuctionRole =
    payload.role === 'counterparty' || payload.role === 'both'
      ? payload.role
      : 'predictor';

  client.service = rawService;
  client.variant = rawVariant;
  client.instanceId = instanceId;
  client.chainId = chainId;
  client.role = role;

  clientsIdentified.inc({
    service: serviceLabel(rawService),
    variant: variantLabel(rawVariant),
  });
  console.log(
    `[Relayer] client.identified clientId=${short(client.id)} service=${rawService} variant=${rawVariant} role=${role} instance=${short(
      instanceId
    )} chainId=${chainId ?? 'none'} serviceInstance=${
      typeof payload.serviceInstance === 'string'
        ? sanitizeForLog(payload.serviceInstance.slice(0, 32))
        : 'none'
    } deploy=${
      typeof payload.deploymentId === 'string'
        ? sanitizeForLog(payload.deploymentId.slice(0, 12))
        : 'none'
    } replica=${
      typeof payload.replicaId === 'string'
        ? sanitizeForLog(payload.replicaId.slice(0, 12))
        : 'none'
    } version=${
      typeof payload.version === 'string'
        ? sanitizeForLog(payload.version.slice(0, 16))
        : 'none'
    }`
  );
}

/**
 * Bot ack for auction.started — proves end-to-end delivery (the bot's WS
 * handler ran and saw the auction). Without this ack, a successful `ws.send`
 * is the strongest signal we have, and it only proves the kernel buffer
 * accepted the bytes.
 *
 * Anti-spoof: the relayer only honors an ack if it has a record of having
 * broadcast that exact `auctionId` to this exact `clientId`. A client that
 * fabricates an ack for an auction it never received gets dropped (and
 * counted in `auctionReceivedAckRejected`), so the `auction.client_ack`
 * log line is a real proof-of-delivery signal rather than self-reported.
 */
export function handleAuctionReceived(
  client: ClientConnection,
  payload: AuctionReceivedPayload | undefined
): void {
  if (!payload || typeof payload.auctionId !== 'string') {
    auctionReceivedAckRejected.inc({ reason: 'invalid_payload' });
    return;
  }
  if (!wasBroadcastTo(payload.auctionId, client.id)) {
    auctionReceivedAckRejected.inc({ reason: 'not_recipient' });
    console.warn(
      `[Relayer] auction.received rejected (no broadcast record) auctionId=${short(
        payload.auctionId
      )} clientId=${short(client.id)} service=${client.service}`
    );
    return;
  }
  auctionReceivedAcks.inc({
    service: serviceLabel(client.service),
    variant: variantLabel(client.variant),
  });
  console.log(
    `[Relayer] auction.client_ack auctionId=${short(
      payload.auctionId
    )} clientId=${short(client.id)} service=${client.service} variant=${client.variant} instance=${short(
      client.instanceId
    )}`
  );
}
