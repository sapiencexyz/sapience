'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import * as Sentry from '@sentry/nextjs';

/** Time after last bid expires before cleaning up entire auction (ms) */
const STALE_THRESHOLD_MS = 60_000; // 1 minute

export type AuctionBid = {
  auctionId: string;
  counterparty: string;
  counterpartyCollateral: string;
  counterpartyDeadline: number;
  counterpartySignature: string;
  counterpartyNonce: number;
  counterpartySessionKeyData?: string;
  receivedAtMs: number;
};

type Listener = () => void;

interface WsBidsMessage {
  type?: string;
  payload?: {
    auctionId?: string;
    bids?: Array<Record<string, unknown>>;
  };
}

class AuctionBidsHub {
  private client: ReturnType<typeof getSharedAuctionWsClient> | null = null;
  private wsUrl: string | null = null;
  private isOpen = false;
  private listeners = new Set<Listener>();
  private pendingSubs = new Set<string>();
  private activeSubs = new Set<string>();
  private receivedAtRef = new Map<string, number>();
  public bidsByAuctionId = new Map<string, AuctionBid[]>();
  private cleanupTimer: number | null = null;

  setUrl(url: string | null | undefined) {
    const next = url || null;
    if (this.wsUrl === next) return;
    this.wsUrl = next;
    this.attachClient();
  }

  private attachClient() {
    if (!this.wsUrl) return;
    const c = getSharedAuctionWsClient(this.wsUrl);
    this.client = c;
    const offOpen = c.addOpenListener(() => {
      this.isOpen = true;
      for (const id of this.pendingSubs) this.sendSubscribe(id);
      Sentry.addBreadcrumb({
        category: 'ws.app',
        level: 'info',
        message: 'resubscribe.bids',
        data: { count: this.pendingSubs.size },
      });
    });
    const offClose = c.addCloseListener(() => {
      this.isOpen = false;
    });
    const offMsg = c.addMessageListener((raw) =>
      this.onMessage(raw as WsBidsMessage)
    );
    // Store noop cleanup to avoid GC until URL changes
    if (this.cleanupTimer != null) window.clearInterval(this.cleanupTimer);
    this.cleanupTimer = window.setInterval(() => this.prune(), 60_000);
    // Keep references in instance for potential future detach if needed
    void offOpen;
    void offClose;
    void offMsg;
  }

  private onMessage(msg: WsBidsMessage) {
    if (msg?.type !== 'auction.bids') return;
    const raw = Array.isArray(msg?.payload?.bids) ? msg.payload.bids : [];
    if (raw.length === 0) return;
    const auctionIdFromPayload = String(msg?.payload?.auctionId || '');
    const updates = new Map<string, AuctionBid[]>();
    for (const b of raw) {
      try {
        const auctionId = String(b?.auctionId || auctionIdFromPayload || '');
        if (!auctionId) continue;
        const signature = String(b?.counterpartySignature || '0x');
        const existingTs = this.receivedAtRef.get(signature);
        const receivedAtMs = existingTs ?? Date.now();
        if (existingTs === undefined)
          this.receivedAtRef.set(signature, receivedAtMs);
        const obj: AuctionBid = {
          auctionId,
          counterparty: String(b?.counterparty || ''),
          counterpartyCollateral: String(b?.counterpartyCollateral || '0'),
          counterpartyDeadline: Number(b?.counterpartyDeadline || 0),
          counterpartySignature: signature,
          counterpartyNonce: Number(b?.counterpartyNonce || 0),
          receivedAtMs,
        };
        if (!updates.has(auctionId)) updates.set(auctionId, []);
        updates.get(auctionId)!.push(obj);
      } catch {
        /* noop */
      }
    }
    if (updates.size > 0) {
      for (const [id, newBids] of updates.entries()) {
        const existing = this.bidsByAuctionId.get(id) || [];

        // Merge existing and new bids, deduplicating by signature
        const bySignature = new Map<string, AuctionBid>();
        for (const bid of existing) {
          bySignature.set(bid.counterpartySignature, bid);
        }
        for (const bid of newBids) {
          bySignature.set(bid.counterpartySignature, bid);
        }

        // Sort by receivedAt (newest first) and cap at 200
        const merged = Array.from(bySignature.values())
          .sort((a, b) => b.receivedAtMs - a.receivedAtMs)
          .slice(0, 200);

        this.bidsByAuctionId.set(id, merged);
      }
      this.emit();
    }
    this.prune();
  }

  private sendSubscribe(auctionId: string) {
    this.pendingSubs.add(auctionId);
    if (!this.client) return;
    this.client.send({ type: 'auction.subscribe', payload: { auctionId } });
    this.activeSubs.add(auctionId);
  }

  private sendUnsubscribe(auctionId: string) {
    this.pendingSubs.delete(auctionId);
    this.activeSubs.delete(auctionId);
    if (!this.client) return;
    this.client.send({ type: 'auction.unsubscribe', payload: { auctionId } });
  }

  ensureSubscribed(auctionId: string | null | undefined) {
    if (!auctionId) return;
    if (this.activeSubs.has(auctionId)) return;
    if (this.isOpen) this.sendSubscribe(auctionId);
    else this.pendingSubs.add(auctionId);
  }

  ensureUnsubscribed(auctionId: string | null | undefined) {
    if (!auctionId) return;
    if (!this.activeSubs.has(auctionId) && !this.pendingSubs.has(auctionId))
      return;
    this.sendUnsubscribe(auctionId);
  }

  addListener(cb: Listener) {
    this.listeners.add(cb);
    // Return a cleanup function that returns void (not boolean)
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit() {
    for (const cb of Array.from(this.listeners)) {
      try {
        cb();
      } catch {
        /* noop */
      }
    }
  }

  private prune() {
    const expiryCutoff = Date.now() - STALE_THRESHOLD_MS;
    const prunedAuctionIds: string[] = [];

    // Prune auctions where the latest bid expired more than STALE_THRESHOLD_MS ago
    for (const [id, bids] of this.bidsByAuctionId.entries()) {
      if (bids.length === 0) {
        // No bids - remove empty entry
        prunedAuctionIds.push(id);
        continue;
      }

      // Find the latest bid expiry (highest counterpartyDeadline)
      let latestExpiryMs = 0;
      for (const bid of bids) {
        const expiryMs = bid.counterpartyDeadline * 1000;
        if (expiryMs > latestExpiryMs) {
          latestExpiryMs = expiryMs;
        }
      }

      // If latest bid expired more than threshold ago, prune the auction
      if (latestExpiryMs > 0 && latestExpiryMs < expiryCutoff) {
        prunedAuctionIds.push(id);
      }
    }

    // Delete pruned auctions and clean up receivedAtRef
    for (const id of prunedAuctionIds) {
      const bids = this.bidsByAuctionId.get(id);
      if (bids) {
        for (const bid of bids) {
          this.receivedAtRef.delete(bid.counterpartySignature);
        }
      }
      this.bidsByAuctionId.delete(id);
    }

    // Notify listeners if anything was pruned
    if (prunedAuctionIds.length > 0) {
      this.emit();
    }
  }
}

const hub = new AuctionBidsHub();

export function useAuctionBidsFor(auctionId: string | null | undefined) {
  const { apiBaseUrl } = useSettings();
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);
  const [tick, setTick] = useState(0);
  const idRef = useRef<string | null | undefined>(auctionId);

  useEffect(() => {
    hub.setUrl(wsUrl);
  }, [wsUrl]);

  useEffect(() => {
    idRef.current = auctionId;
    hub.ensureSubscribed(auctionId);
    return () => hub.ensureUnsubscribed(auctionId);
  }, [auctionId]);

  useEffect(() => {
    const off = hub.addListener(() => setTick((t) => (t + 1) % 1_000_000));
    return () => {
      off();
    };
  }, []);

  const bids = useMemo(() => {
    if (!auctionId) return [] as AuctionBid[];
    return hub.bidsByAuctionId.get(auctionId) || [];
  }, [auctionId, wsUrl, idRef.current, tick]);

  return { bids };
}

export default hub;
