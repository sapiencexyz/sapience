import type { MeshClient } from './MeshClient';

/**
 * Adapts MeshClient to the same interface that ReconnectingWebSocketClient exposes,
 * so auction hooks (useAuctionStart, useEscrowBidSubmission, etc.) work unchanged.
 */
export class MeshTransport {
  private mesh: MeshClient;

  constructor(mesh: MeshClient) {
    this.mesh = mesh;
  }

  send(msg: Record<string, unknown>): void {
    const type = (msg.type as string) ?? 'unknown';
    this.mesh.broadcast(type, msg);
  }

  async sendWithAck<T = unknown>(
    type: string,
    payload: Record<string, unknown>,
    opts?: { timeoutMs?: number }
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutMs = opts?.timeoutMs ?? 5_000;
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Math.random().toString(36).slice(2)}${Date.now()}`;

      const timer = setTimeout(() => {
        unsub();
        reject(new Error('ack_timeout'));
      }, timeoutMs);

      const unsub = this.mesh.on(`${type}.ack`, (_ackType, ackPayload) => {
        const ack = ackPayload as Record<string, unknown>;
        if (ack.id === id || (ack as Record<string, unknown>).payload && ((ack as Record<string, unknown>).payload as Record<string, unknown>).id === id) {
          clearTimeout(timer);
          unsub();
          resolve(ack as T);
        }
      });

      this.mesh.broadcast(type, { ...payload, id });
    });
  }

  addMessageListener(cb: (msg: unknown) => void): () => void {
    return this.mesh.onAny((_type, payload) => {
      cb(payload);
    });
  }

  addOpenListener(cb: () => void): () => void {
    let wasOpen = false;
    return this.mesh.onPeerCountChange((count) => {
      if (count > 0 && !wasOpen) {
        wasOpen = true;
        cb();
      } else if (count === 0) {
        wasOpen = false;
      }
    });
  }

  addCloseListener(cb: () => void): () => void {
    let wasOpen = false;
    return this.mesh.onPeerCountChange((count) => {
      if (count > 0) {
        wasOpen = true;
      } else if (count === 0 && wasOpen) {
        wasOpen = false;
        cb();
      }
    });
  }

  addReconnectListener(_cb: () => void): () => void {
    // Mesh auto-reconnects internally; no explicit reconnect event
    return () => {};
  }

  addErrorListener(_cb: (e: unknown) => void): () => void {
    // Errors are handled internally by PeerManager
    return () => {};
  }
}
