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

      const msgId = this.mesh.broadcast(type, { ...payload });

      const unsub = this.mesh.on(`${type}.ack`, (_ackType, ackPayload) => {
        const ack = ackPayload as Record<string, unknown>;
        const nested = ack.payload as Record<string, unknown> | undefined;
        if (ack.id === msgId || (nested && nested.id === msgId)) {
          clearTimeout(timer);
          unsub();
          resolve(ack as T);
        }
      });

      const timer = setTimeout(() => {
        unsub();
        reject(new Error('ack_timeout'));
      }, timeoutMs);
    });
  }

  addMessageListener(cb: (msg: unknown) => void): () => void {
    return this.mesh.onAny((_type, payload) => cb(payload));
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
      if (count > 0) wasOpen = true;
      else if (count === 0 && wasOpen) {
        wasOpen = false;
        cb();
      }
    });
  }

  addReconnectListener(_cb: () => void): () => void {
    return () => {};
  }

  addErrorListener(_cb: (e: unknown) => void): () => void {
    return () => {};
  }
}
