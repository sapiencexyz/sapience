/**
 * Escrow Auction Registry
 * Stores and manages escrow auctions and bids
 */

import type { AuctionRFQPayload, ValidatedBid } from '@sapience/sdk/types';
import type { EscrowAuctionRecord, BidPayload } from './escrowTypes';
import { computePickConfigId } from '@sapience/sdk/auction/escrowEncoding';
import type { Pick } from '@sapience/sdk/types';
import type { Address, Hex } from 'viem';

const escrowAuctions = new Map<string, EscrowAuctionRecord>();

/**
 * Create or update an escrow auction
 */
export function upsertEscrowAuction(auction: AuctionRFQPayload): string {
  const auctionId = crypto.randomUUID();
  const ttl = 60_000; // default 60s
  const deadlineMs = Date.now() + Math.max(5_000, Math.min(ttl, 5 * 60_000));

  // Compute pickConfigId from picks
  const sdkPicks: Pick[] = auction.picks.map((p) => ({
    conditionResolver: p.conditionResolver as Address,
    conditionId: p.conditionId as Hex,
    predictedOutcome: p.predictedOutcome,
  }));
  const pickConfigId = computePickConfigId(sdkPicks);

  escrowAuctions.set(auctionId, {
    auction: {
      ...auction,
      counterpartyCollateral: auction.counterpartyCollateral ?? '0',
    },
    bids: [],
    deadlineMs,
    pickConfigId,
  });

  return auctionId;
}

/**
 * Get an escrow auction by ID
 */
export function getEscrowAuction(
  auctionId: string
): EscrowAuctionRecord | undefined {
  const rec = escrowAuctions.get(auctionId);
  if (!rec) return undefined;
  if (Date.now() > rec.deadlineMs) {
    escrowAuctions.delete(auctionId);
    return undefined;
  }
  return rec;
}

/**
 * Add a bid to an escrow auction
 */
export function addEscrowBid(
  auctionId: string,
  bid: BidPayload
): ValidatedBid | undefined {
  const rec = getEscrowAuction(auctionId);
  if (!rec) return undefined;

  // Reject duplicate bids by counterparty signature
  if (
    bid.counterpartySignature &&
    rec.bids.some((b) => b.counterpartySignature === bid.counterpartySignature)
  ) {
    return undefined;
  }

  const validated: ValidatedBid = {
    auctionId,
    counterparty: bid.counterparty,
    counterpartyCollateral: bid.counterpartyCollateral,
    counterpartyNonce: bid.counterpartyNonce,
    counterpartyDeadline: bid.counterpartyDeadline,
    counterpartySignature: bid.counterpartySignature,
    counterpartySessionKeyData: bid.counterpartySessionKeyData,
    receivedAt: new Date().toISOString(),
  };

  rec.bids.push(validated);
  rec.deadlineMs = Math.max(rec.deadlineMs, bid.counterpartyDeadline * 1000);
  escrowAuctions.set(auctionId, rec);

  return validated;
}

/**
 * Get all bids for an escrow auction
 */
export function getEscrowBids(auctionId: string): ValidatedBid[] {
  const rec = getEscrowAuction(auctionId);
  return rec?.bids ?? [];
}

/**
 * Get auction details for broadcast
 */
export function getEscrowAuctionDetails(
  auctionId: string
): import('@sapience/sdk/types').AuctionDetails | undefined {
  const rec = getEscrowAuction(auctionId);
  if (!rec) return undefined;

  return {
    auctionId,
    picks: rec.auction.picks,
    predictorCollateral: rec.auction.predictorCollateral,

    predictor: rec.auction.predictor,
    predictorNonce: rec.auction.predictorNonce,
    predictorDeadline: rec.auction.predictorDeadline,
    ...(rec.auction.intentSignature && {
      intentSignature: rec.auction.intentSignature,
    }),
    ...(rec.auction.predictorSessionKeyData && {
      predictorSessionKeyData: rec.auction.predictorSessionKeyData,
    }),
    chainId: rec.auction.chainId,
    createdAt: new Date(rec.deadlineMs - 60_000).toISOString(), // Approximate creation time
    ...(rec.auction.predictorSponsor && {
      predictorSponsor: rec.auction.predictorSponsor,
      predictorSponsorData: rec.auction.predictorSponsorData ?? '0x',
    }),
  };
}

// Periodic cleanup of expired auctions
setInterval(() => {
  const now = Date.now();
  for (const [id, rec] of escrowAuctions.entries()) {
    if (now > rec.deadlineMs) {
      escrowAuctions.delete(id);
    }
  }
}, 30_000).unref?.();
