'use client';

import type { Address } from 'viem';
import {
  isValidGossipPayload,
  validateGossipPayloadAsync,
  type GossipValidationContext,
} from '@sapience/sdk/auction/gossipValidation';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants/chain';
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

const SEEN_TTL = 30_000;

function getValidationContext(): GossipValidationContext {
  const escrow = predictionMarketEscrow[DEFAULT_CHAIN_ID];
  return {
    verifyingContract:
      escrow?.address ??
      ('0x0000000000000000000000000000000000000000' as Address),
    chainId: DEFAULT_CHAIN_ID,
  };
}

/**
 * Wraps ReconnectingWebSocketClient with mesh dual-delivery.
 * Uses composition instead of monkey-patching — delegates send/listen
 * to both the WS client and the mesh transport.
 */
class AuctionWsClient {
  private client: ReconnectingWebSocketClient | null = null;
  private url: string | null = null;

  /** Dedup recent message IDs seen from both WS and mesh. */
  private seen = new Map<string, number>();

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

  private ensureClient(): ReconnectingWebSocketClient {
    if (!this.client) throw new Error('AuctionWsClient not initialized');
    return this.client;
  }

  /** Send to both WS relayer and mesh (for eligible message types). */
  send(msg: Record<string, unknown> & { id?: string }): void {
    this.ensureClient().send(msg);
    if (shouldMesh(msg)) {
      try {
        const mesh = getSharedMeshClient();
        mesh.send(msg);
        // P2P: promote auction.start → auction.started so peers can display
        // the request without a relayer. When the relayer IS present, its
        // auction.started arrives via WS and dedup drops the duplicate.
        // P2P promotions: translate raw client messages into the formats
        // that consuming hooks expect (normally produced by the relayer).
        if (msg.type === 'auction.start') {
          const payload = msg.payload as Record<string, unknown> | undefined;
          const auctionId =
            (payload?.id as string) || msg.id || crypto.randomUUID();
          const { id: _origId, ...rest } = payload ?? {};
          mesh.send({
            type: 'auction.started',
            auctionId,
            payload: { ...rest, auctionId },
          });
        }
        if (msg.type === 'bid.submit') {
          const payload = msg.payload as Record<string, unknown> | undefined;
          const auctionId =
            (payload?.auctionId as string) || (msg.auctionId as string) || '';
          if (auctionId) {
            mesh.send({
              type: 'auction.bids',
              auctionId,
              payload: { auctionId, bids: [payload ?? msg] },
            });
          }
        }
      } catch {
        /* mesh unavailable */
      }
    }
  }

  /** Delegates to the WS client's sendWithAck (mesh does not support ack). */
  sendWithAck<T = unknown>(
    type: string,
    payload: Record<string, unknown>,
    opts?: { timeoutMs?: number }
  ): Promise<T> {
    return this.ensureClient().sendWithAck<T>(type, payload, opts);
  }

  /**
   * Registers a message listener that receives from both WS and mesh.
   * Mesh messages are validated (structural + crypto) and deduped before delivery.
   */
  addMessageListener(cb: (msg: unknown) => void): () => void {
    const client = this.ensureClient();

    const unsubWs = client.addMessageListener((msg: unknown) => {
      const data = msg as Record<string, unknown>;
      if (shouldMesh(data)) this.dedup(data); // mark as seen from WS
      cb(msg);
    });

    const unsubMesh = getSharedMeshClient().addMessageListener(
      (msg: unknown) => {
        const data = msg as Record<string, unknown>;
        if (!shouldMesh(data)) return;
        // Dedup BEFORE async validation to prevent a race where two
        // identical messages both enter the async path and both pass
        // the dedup check after their validations resolve.
        if (!this.dedup(data)) return;
        const inner =
          (data.payload as Record<string, unknown> | undefined) ?? data;
        const msgType = data.type as string;
        if (!isValidGossipPayload(msgType, inner)) return;
        validateGossipPayloadAsync(msgType, inner, getValidationContext())
          .then((valid) => {
            if (!valid) return;
            cb(msg);
          })
          .catch(() => {
            /* validation error → drop silently */
          });
      }
    );

    return () => {
      unsubMesh();
      unsubWs();
    };
  }

  addOpenListener(cb: () => void): () => void {
    return this.ensureClient().addOpenListener(cb);
  }

  addCloseListener(cb: () => void): () => void {
    return this.ensureClient().addCloseListener(cb);
  }

  addReconnectListener(cb: () => void): () => void {
    return this.ensureClient().addReconnectListener(cb);
  }

  addErrorListener(cb: (e: unknown) => void): () => void {
    return this.ensureClient().addErrorListener(cb);
  }

  /**
   * Returns true if the message is new, false if already seen.
   * Always prunes expired entries regardless of map size.
   */
  private dedup(msg: Record<string, unknown>): boolean {
    const id =
      (msg.id as string) ??
      ((msg.payload as Record<string, unknown> | undefined)?.id as string);
    if (!id) return true; // no ID to dedup on, let it through
    const now = Date.now();

    // Prune expired entries
    for (const [k, ts] of this.seen) {
      if (now - ts > SEEN_TTL) this.seen.delete(k);
    }

    if (this.seen.has(id)) return false;
    this.seen.set(id, now);
    return true;
  }
}

const shared = new AuctionWsClient();

export function getSharedAuctionWsClient(
  wsUrl: string | null
): AuctionWsClient {
  shared.setUrl(wsUrl);
  return shared;
}
