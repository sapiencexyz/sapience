'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '~/lib/context/SettingsContext';

export type AuctionBid = {
  auctionId: string;
  taker: string;
  takerWager: string;
  takerDeadline: number;
  takerSignature: string;
};

function toWsUrl(baseHttpUrl: string | null): string | null {
  try {
    if (!baseHttpUrl || baseHttpUrl.length === 0) {
      const loc = typeof window !== 'undefined' ? window.location : undefined;
      if (!loc) return null;
      const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${loc.host}/auction`;
    }
    const u = new URL(baseHttpUrl);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.search = '';
    return u.toString();
  } catch {
    return null;
  }
}

export function useAuctionBids(auctionId: string | null | undefined) {
  const { apiBaseUrl } = useSettings();
  const wsUrl = useMemo(() => toWsUrl(apiBaseUrl), [apiBaseUrl]);
  const wsRef = useRef<WebSocket | null>(null);
  const [bids, setBids] = useState<AuctionBid[]>([]);

  useEffect(() => {
    if (!wsUrl || !auctionId) return;
    let closed = false;
    try {
      console.debug('[AUCTION-BIDS] connecting', { wsUrl, auctionId });
    } catch (err) {
      console.error('[AUCTION-BIDS] failed to log connect', err);
    }
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      try {
        console.debug('[AUCTION-BIDS] open');
        console.debug('[AUCTION-BIDS] send auction.subscribe', { auctionId });
      } catch (err) {
        console.error('[AUCTION-BIDS] failed to log onopen', err);
      }
      try {
        ws.send(
          JSON.stringify({
            type: 'auction.subscribe',
            payload: { auctionId },
          })
        );
      } catch (err) {
        console.error('[AUCTION-BIDS] failed to send subscribe', err);
      }
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg?.type !== 'auction.bids') return;
        const raw = Array.isArray(msg?.payload?.bids)
          ? (msg.payload.bids as any[])
          : [];
        const filtered = raw.filter((b) => b?.auctionId === auctionId);
        try {
          console.debug('[AUCTION-BIDS] bids received', {
            total: raw.length,
            forAuction: filtered.length,
          });
        } catch (err) {
          console.error('[AUCTION-BIDS] failed to log bids received', err);
        }
        if (filtered.length === 0) return;
        const normalized: AuctionBid[] = filtered
          .map((b) => {
            try {
              return {
                auctionId: String(b?.auctionId || auctionId),
                taker: String(b?.taker || ''),
                takerWager: String(b?.takerWager || '0'),
                takerDeadline: Number(b?.takerDeadline || 0),
                takerSignature: String(b?.takerSignature || '0x'),
              } as AuctionBid;
            } catch {
              return null;
            }
          })
          .filter(Boolean) as AuctionBid[];
        setBids(normalized);
      } catch (err) {
        console.error('[AUCTION-BIDS] onmessage handler error', err);
      }
    };

    ws.onerror = (e) => {
      try {
        console.debug('[AUCTION-BIDS] error', e);
      } catch (err) {
        console.error('[AUCTION-BIDS] failed to log onerror', err);
      }
      // ignore
    };

    return () => {
      closed = true;
      try {
        console.debug('[AUCTION-BIDS] close');
      } catch (err) {
        console.error('[AUCTION-BIDS] failed to log close', err);
      }
      try {
        ws.close();
      } catch (err) {
        console.error('[AUCTION-BIDS] failed to close websocket', err);
      }
      wsRef.current = null;
      if (!closed) {
        console.debug('[AUCTION-BIDS] cleanup called while not closed');
      }
    };
  }, [wsUrl, auctionId]);

  return { bids };
}
