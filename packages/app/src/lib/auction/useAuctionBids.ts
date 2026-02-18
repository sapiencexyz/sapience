'use client';

import {
  useAuctionBidsFor,
  type AuctionBid,
} from '~/lib/auction/useAuctionBidsHub';

export type { AuctionBid };

export function useAuctionBids(auctionId: string | null | undefined) {
  return useAuctionBidsFor(auctionId);
}
