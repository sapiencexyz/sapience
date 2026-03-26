'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  SecondaryAuctionDetails,
  SecondaryListingSummary,
  SecondaryServerToClientMessage,
  SecondaryValidatedBid,
} from '@sapience/sdk/types/secondary';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';

export interface SecondaryListing extends SecondaryAuctionDetails {
  bidCount: number;
  bids: SecondaryValidatedBid[];
}

interface UseSecondaryFeedOptions {
  /** Only show listings for this chain */
  chainId?: number;
  /** Auto-subscribe on mount (default true) */
  enabled?: boolean;
}

/**
 * Subscribe to the secondary market global feed.
 * On connect: requests a snapshot of active listings, then subscribes to live updates.
 * Maintains a local Map of active listings with bid counts.
 */
export function useSecondaryFeed(options: UseSecondaryFeedOptions = {}) {
  const { chainId, enabled = true } = options;
  const { apiBaseUrl } = useSettings();
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  const [listings, setListings] = useState<Map<string, SecondaryListing>>(
    new Map()
  );
  const [isConnected, setIsConnected] = useState(false);
  const removeListenerRef = useRef<(() => void) | null>(null);

  const handleMessage = useCallback(
    (msg: unknown) => {
      const data = msg as SecondaryServerToClientMessage;

      if (data?.type === 'secondary.listings.snapshot') {
        const payload = data.payload as { listings: SecondaryListingSummary[] };
        setListings(() => {
          // Replace all listings on snapshot (not merge) to clear stale data after reconnect
          const next = new Map<string, SecondaryListing>();
          for (const l of payload.listings) {
            if (chainId && l.chainId !== chainId) continue;
            next.set(l.auctionId, {
              auctionId: l.auctionId,
              token: l.token,
              collateral: l.collateral,
              tokenAmount: l.tokenAmount,
              seller: l.seller,
              sellerDeadline: l.sellerDeadline,
              chainId: l.chainId,
              createdAt: l.createdAt,
              bidCount: l.bidCount,
              bids: [],
            });
          }
          return next;
        });
      }

      if (data?.type === 'secondary.auction.started') {
        const details = data.payload;
        if (chainId && details.chainId !== chainId) return;
        setListings((prev) => {
          const next = new Map(prev);
          next.set(details.auctionId, {
            ...details,
            bidCount: 0,
            bids: [],
          });
          return next;
        });
      }

      if (data?.type === 'secondary.auction.bids') {
        const payload = data.payload as {
          auctionId: string;
          bids: SecondaryValidatedBid[];
        };
        setListings((prev) => {
          const existing = prev.get(payload.auctionId);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(payload.auctionId, {
            ...existing,
            bids: payload.bids,
            bidCount: payload.bids.length,
          });
          return next;
        });
      }

      if (data?.type === 'secondary.auction.filled') {
        const payload = data.payload as { auctionId: string };
        setListings((prev) => {
          const next = new Map(prev);
          next.delete(payload.auctionId);
          return next;
        });
      }

      if (data?.type === 'secondary.auction.expired') {
        const payload = data.payload as { auctionId: string };
        setListings((prev) => {
          const next = new Map(prev);
          next.delete(payload.auctionId);
          return next;
        });
      }
    },
    [chainId]
  );

  useEffect(() => {
    if (!enabled || !wsUrl) return;

    const client = getSharedAuctionWsClient(wsUrl);

    const subscribe = () => {
      // Request snapshot of current listings
      client.send({ type: 'secondary.listings.request' });
      // Subscribe to live feed
      client.send({ type: 'secondary.feed.subscribe' });
    };

    subscribe();

    // Re-subscribe when WS reconnects (server-side state is lost on disconnect)
    const removeReconnectListener = client.addReconnectListener(subscribe);

    const removeListener = client.addMessageListener(handleMessage);
    removeListenerRef.current = removeListener;
    setIsConnected(true);

    return () => {
      removeListener();
      removeReconnectListener();
      removeListenerRef.current = null;
      // Unsubscribe from global feed
      try {
        client.send({ type: 'secondary.feed.unsubscribe' });
      } catch {
        // WS may already be closed
      }
      setIsConnected(false);
    };
  }, [enabled, wsUrl, handleMessage]);

  // Prune expired listings periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      setListings((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, listing] of next) {
          if (listing.sellerDeadline <= now) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  const listingsArray = useMemo(
    () => Array.from(listings.values()),
    [listings]
  );

  const subscribeToBids = useCallback(
    (auctionId: string) => {
      if (!wsUrl) return;
      const client = getSharedAuctionWsClient(wsUrl);
      client.send({
        type: 'secondary.auction.subscribe',
        payload: { auctionId },
      });
    },
    [wsUrl]
  );

  return {
    listings: listingsArray,
    listingsMap: listings,
    isConnected,
    subscribeToBids,
  };
}
