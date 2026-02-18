'use client';

import { ReconnectingWebSocketClient } from './ReconnectingWebSocket';

class AuctionWsClient {
  private client: ReconnectingWebSocketClient | null = null;
  private url: string | null = null;

  setUrl(url: string | null) {
    if (this.url === url) return;
    this.url = url;
    if (!this.client) {
      this.client = new ReconnectingWebSocketClient(url, {
        maxBackoffMs: 30_000,
        initialBackoffMs: 400,
        heartbeatIntervalMs: 25_000,
        staleCloseMs: 60_000,
        debug: !!process.env.NEXT_PUBLIC_DEBUG_WS,
      });
    } else {
      this.client.setUrl(url);
    }
  }

  ensure(url: string | null) {
    this.setUrl(url);
    if (!this.client) throw new Error('AuctionWsClient not initialized');
    return this.client;
  }
}

const shared = new AuctionWsClient();

export function getSharedAuctionWsClient(wsUrl: string | null) {
  return shared.ensure(wsUrl);
}
