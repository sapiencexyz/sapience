'use client';

import { ReconnectingWebSocketClient } from './ReconnectingWebSocket';
import { getSharedMeshClient } from './MeshAuctionClient';

/** Message types that should be gossiped over the mesh for redundancy. */
const MESH_TYPES = new Set([
  'auction.start',
  'auction.started',
  'auction.bids',
  'bid.submit',
  'bid.ack',
  'order.created',
]);

function shouldMesh(msg: Record<string, unknown>): boolean {
  return MESH_TYPES.has(msg.type as string);
}

/** Dedup recent message IDs seen from both WS and mesh. */
const seen = new Map<string, number>();
const SEEN_TTL = 30_000;

function dedup(msg: Record<string, unknown>): boolean {
  const id =
    (msg.id as string) ??
    ((msg.payload as Record<string, unknown> | undefined)?.id as string);
  if (!id) return true; // no ID to dedup on, let it through
  const now = Date.now();
  if (seen.has(id)) return false;
  seen.set(id, now);
  // Lazy prune
  if (seen.size > 1000) {
    for (const [k, ts] of seen) {
      if (now - ts > SEEN_TTL) seen.delete(k);
    }
  }
  return true;
}

class AuctionWsClient {
  private client: ReconnectingWebSocketClient | null = null;
  private url: string | null = null;
  private patched = false;

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
      this.patchForMesh();
    } else {
      this.client.setUrl(url);
    }
  }

  ensure(url: string | null) {
    this.setUrl(url);
    if (!this.client) throw new Error('AuctionWsClient not initialized');
    return this.client;
  }

  private patchForMesh() {
    if (!this.client || this.patched) return;
    this.patched = true;

    // Outbound: also gossip auction/bid messages via mesh
    const origSend = this.client.send.bind(this.client);
    this.client.send = (msg: Record<string, unknown> & { id?: string }) => {
      origSend(msg);
      if (shouldMesh(msg)) {
        try {
          getSharedMeshClient().send(msg);
        } catch {
          /* */
        }
      }
    };

    // Inbound: also deliver mesh messages to WS message listeners.
    // Patch addMessageListener so each listener also gets mesh messages.
    const origAddMsgListener = this.client.addMessageListener.bind(this.client);
    this.client.addMessageListener = (cb: (msg: unknown) => void) => {
      const unsubWs = origAddMsgListener((msg: unknown) => {
        const data = msg as Record<string, unknown>;
        if (shouldMesh(data)) dedup(data); // mark as seen from WS
        cb(msg);
      });
      const unsubMesh = getSharedMeshClient().addMessageListener(
        (msg: unknown) => {
          const data = msg as Record<string, unknown>;
          if (!shouldMesh(data)) return;
          if (!dedup(data)) return; // already seen from WS
          cb(msg);
        }
      );
      return () => {
        unsubMesh();
        return unsubWs();
      };
    };
  }
}

const shared = new AuctionWsClient();

export function getSharedAuctionWsClient(wsUrl: string | null) {
  return shared.ensure(wsUrl);
}
