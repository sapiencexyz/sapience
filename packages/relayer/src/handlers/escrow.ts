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
import {
  validateAuctionRFQ,
  validateBid,
} from '@sapience/sdk/auction/validation';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
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
} from '../metrics';

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

export async function handleAuctionStart(
  client: ClientConnection,
  payload: AuctionRFQPayload,
  subs: SubscriptionManager,
  ctx: EscrowHandlerContext,
  requestId?: string
): Promise<void> {
  const startTime = Date.now();
  let pendingAuctionId = 'pending';

  logTiming(pendingAuctionId, 'received', startTime, {
    predictor: payload.predictor?.slice(0, 10) || 'unknown',
    picks: payload.picks?.length ?? 0,
    keys: Object.keys(payload).join(','),
  });

  // Look up escrow contract address for this chain
  const escrowAddr = predictionMarketEscrow[payload.chainId]?.address;
  if (!escrowAddr) {
    errorsTotal.inc({ type: 'validation', message_type: 'auction.start' });
    console.warn(
      `[Relayer] auction.start rejected: unknown chainId ${payload.chainId}`
    );
    client.send({
      type: 'auction.ack',
      payload: { auctionId: '', error: 'unknown_chain_id' },
    });
    return;
  }

  // Validate auction request structure + intent signature in one call
  const validation = await validateAuctionRFQ(payload, {
    verifyingContract: escrowAddr as Address,
    requireSignature: !!payload.intentSignature,
    maxDeadlineSeconds: 7200,
  });
  if (validation.status !== 'valid') {
    errorsTotal.inc({ type: 'validation', message_type: 'auction.start' });
    console.warn(`[Relayer] auction.start rejected: ${validation.reason}`);
    client.send({
      type: 'auction.ack',
      payload: {
        auctionId: '',
        error: validation.reason || 'invalid_payload',
      },
    });
    return;
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

  // Broadcast auction.started with auction details to all connected clients
  const details = getEscrowAuctionDetails(auctionId);
  if (details) {
    const broadcastMsg = { type: 'auction.started', payload: details };
    let botCount = 0;
    for (const c of ctx.allClients()) {
      if (c.isOpen) {
        try {
          c.send(broadcastMsg);
          botCount++;
        } catch {
          /* skip dead connections */
        }
      }
    }
    logTiming(auctionId, 'broadcast', startTime, { bots: botCount });
  }

  // Immediately stream current bids if any
  const bids = getEscrowBids(auctionId);
  if (bids.length > 0) {
    client.send({ type: 'auction.bids', payload: { auctionId, bids } });
  }
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

export async function handleBidSubmit(
  client: ClientConnection,
  bid: BidPayload,
  subs: SubscriptionManager
): Promise<void> {
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
    return;
  }

  // Validate bid structure + signature (offline only, no publicClient)
  const escrowAddr = predictionMarketEscrow[rec.auction.chainId]?.address;
  const bidValidation = await validateBid(bid, rec.auction, {
    verifyingContract: escrowAddr as Address,
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
    return;
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
    return;
  }
  logTiming(bid.auctionId, 'bid_validated', bidStartTime);

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
}
